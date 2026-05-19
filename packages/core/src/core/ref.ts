/**
 * $ref resolution for JSON Schema.
 *
 * Handles JSON Pointer dereference, $anchor lookup, cycle detection,
 * and depth limiting derived from the document's own $ref count.
 */

import { isObject } from "./guards.ts";
import { MAX_REF_DEPTH } from "./limits.ts";
import { isPrototypePollutingKey } from "./uri.ts";
import type { DiagnosticsOptions } from "./diagnostics.ts";
import { emitDiagnostic } from "./diagnostics.ts";

// ---------------------------------------------------------------------------
// Boolean sub-schema sentinel
// ---------------------------------------------------------------------------

/**
 * The canonical recursive `$anchor` name synthesised by the Draft
 * 2019-09 `$recursiveAnchor: true` rewrite. Re-exported here so the
 * collision check in {@link findAnchor} stays aligned with the
 * rewriter in `core/normalise.ts`.
 */
export const RECURSIVE_ANCHOR_SENTINEL = "__recursive__";

/**
 * Translate a boolean sub-schema (Draft 06+) into a `Record<string,unknown>`
 * the walker can interpret with no semantic loss:
 *
 *   `true`  → `{}`               (always-valid schema)
 *   `false` → `{ not: {} }`      (never-valid schema)
 *
 * Used by {@link resolveRef} so callers that expect an object schema
 * can continue without per-call-site boolean handling. The walker's
 * sub-schema dispatch (`walkSubSchema`) handles booleans natively at
 * non-root positions; this translation covers the degenerate case
 * where a top-level `$ref` resolves to a boolean schema.
 */
function booleanSchemaToObject(value: boolean): Record<string, unknown> {
    if (value) return {};
    return { not: {} };
}

// ---------------------------------------------------------------------------
// External resolver hook
// ---------------------------------------------------------------------------

/**
 * Resolver function for external $ref URIs.
 * Called with the URI portion (everything before `#`) of an external ref.
 * Returns the parsed document (JSON object) or undefined.
 *
 * ### Security warning — SSRF and local-file disclosure
 *
 * Consumers MUST validate the URI before fetching the target document.
 * schema-components hands the resolver the raw `$ref` URI from the
 * document — which is typically user-controlled — and any network or
 * filesystem access the resolver performs runs with the host
 * application's full privileges. An attacker-crafted schema that
 * references an internal endpoint or a local filesystem path will
 * happily exfiltrate or expose data the application never intended to
 * surface.
 *
 * At a minimum the resolver should:
 *
 * - Refuse non-`https:` schemes by default. Permit `http:` only on an
 *   explicit allow-list. Refuse `file:`, `data:`, `javascript:`,
 *   `ftp:`, `gopher:`, and every other scheme outright.
 * - Resolve the URI's hostname and refuse loopback addresses
 *   (`127.0.0.0/8`, `::1`), link-local addresses (`169.254.0.0/16`,
 *   `fe80::/10`), private ranges (`10.0.0.0/8`, `172.16.0.0/12`,
 *   `192.168.0.0/16`, `fc00::/7`), and cloud-metadata IPs
 *   (`169.254.169.254`, `fd00:ec2::254`).
 * - Apply a strict allow-list of permitted hosts where possible.
 * - Set request timeouts and a maximum response size.
 * - Disable HTTP redirects, or re-validate the redirected URL against
 *   the same denylist before following.
 * - Reject responses that are not `application/json` or
 *   `application/yaml`.
 *
 * schema-components performs no validation itself — that responsibility
 * sits exclusively with the resolver implementation supplied by the
 * caller.
 */
export type ExternalResolver = (uri: string) => unknown;

/**
 * Options for $ref resolution.
 */
export interface RefOptions {
    diagnostics?: DiagnosticsOptions;
    externalResolver?: ExternalResolver;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function getString(
    obj: Record<string, unknown>,
    key: string
): string | undefined {
    const value = obj[key];
    return typeof value === "string" ? value : undefined;
}

// ---------------------------------------------------------------------------
// Derived depth bound
// ---------------------------------------------------------------------------

/**
 * Count all distinct `$ref` strings reachable from a root document.
 * A chain longer than the number of distinct refs is necessarily cyclic.
 * Returns at least 1 so that single-ref schemas have a usable bound.
 */
export function countDistinctRefs(root: Record<string, unknown>): number {
    const refs = new Set<string>();
    collectRefs(root, refs, new WeakSet<object>());
    return Math.max(refs.size, 1);
}

/**
 * The OpenAPI bundler (`bundleOpenApiDoc`) inlines external refs via
 * `structuredClone`, which preserves shared object references and cycles.
 * Without the `visited` set this walk would recurse forever on cyclic or
 * diamond-shaped input. The set is a no-op for tree-shaped documents.
 */
function collectRefs(
    node: unknown,
    refs: Set<string>,
    visited: WeakSet<object>
): void {
    if (!isObject(node)) return;
    if (visited.has(node)) return;
    visited.add(node);

    const ref = node.$ref;
    if (typeof ref === "string") {
        refs.add(ref);
    }

    for (const value of Object.values(node)) {
        if (isObject(value)) {
            collectRefs(value, refs, visited);
        } else if (Array.isArray(value)) {
            if (visited.has(value)) continue;
            visited.add(value);
            for (const item of value) {
                collectRefs(item, refs, visited);
            }
        }
    }
}

// ---------------------------------------------------------------------------
// $ref resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a `$ref` in a schema against a root document.
 * Returns the original schema if no `$ref` is present.
 * Returns an unknown-schema placeholder on cycle or depth exceeded.
 *
 * The depth bound is derived from the number of distinct `$ref` strings
 * in the root document — a chain longer than that count is necessarily
 * cyclic. When `maxDepth` is not provided, a reasonable default is used.
 */
export function resolveRef(
    schema: Record<string, unknown>,
    rootDocument: Record<string, unknown>,
    visited: Set<string>,
    diagnostics?: DiagnosticsOptions,
    maxDepth?: number,
    externalResolver?: ExternalResolver
): Record<string, unknown> {
    const ref = getString(schema, "$ref");
    if (ref === undefined) return schema;

    // Cycle detection
    if (visited.has(ref)) {
        emitDiagnostic(diagnostics, {
            code: "unresolved-ref",
            message: `Circular $ref detected: ${ref}`,
            pointer: ref,
            detail: { ref },
        });
        return {
            type: "unknown",
            editability: "editable",
            meta: {},
            constraints: {},
        };
    }

    // Depth bound: derived from document's distinct ref count, or
    // {@link MAX_REF_DEPTH} for callers that don't pre-compute.
    const depthLimit = maxDepth ?? MAX_REF_DEPTH;
    if (visited.size >= depthLimit) {
        emitDiagnostic(diagnostics, {
            code: "depth-exceeded",
            message: `$ref depth exceeded derived bound (${String(depthLimit)}): ${ref}`,
            pointer: ref,
            detail: { ref, depth: visited.size, bound: depthLimit },
        });
        return {
            type: "unknown",
            editability: "editable",
            meta: {},
            constraints: {},
        };
    }

    // External resolution: if ref doesn't start with #, try externalResolver
    if (!ref.startsWith("#") && externalResolver !== undefined) {
        const hashIndex = ref.indexOf("#");
        const uri = hashIndex >= 0 ? ref.slice(0, hashIndex) : ref;
        const fragment = hashIndex >= 0 ? ref.slice(hashIndex) : "#";
        const externalDoc = externalResolver(uri);
        if (isObject(externalDoc)) {
            const target = dereference(fragment, externalDoc);
            if (target !== undefined) {
                const nextVisited = new Set(visited);
                nextVisited.add(ref);
                // Boolean sub-schemas are valid Draft 06+ resolution
                // targets — translate to an equivalent object so the
                // existing walker contract still holds.
                if (typeof target === "boolean") {
                    return booleanSchemaToObject(target);
                }
                return resolveRef(
                    target,
                    externalDoc,
                    nextVisited,
                    diagnostics,
                    maxDepth,
                    externalResolver
                );
            }
        }
        // Resolver didn't return a usable document
        emitDiagnostic(diagnostics, {
            code: "external-ref",
            message: `External resolver returned no document for: ${ref}`,
            pointer: ref,
            detail: { ref, uri },
        });
        return {
            type: "unknown",
            editability: "editable",
            meta: {},
            constraints: {},
        };
    }

    // Internal resolution
    const resolved = dereference(ref, rootDocument);
    if (resolved === undefined) {
        emitDiagnostic(diagnostics, {
            code: "unresolved-ref",
            message: `Could not resolve $ref: ${ref}`,
            pointer: ref,
            detail: { ref },
        });
        return {
            type: "unknown",
            editability: "editable",
            meta: {},
            constraints: {},
        };
    }

    // Boolean sub-schemas are valid Draft 06+ resolution targets.
    // Translate to an equivalent object representation so downstream
    // walker callers (which expect `Record<string,unknown>`) keep
    // working without per-call-site boolean handling.
    if (typeof resolved === "boolean") {
        return booleanSchemaToObject(resolved);
    }

    // Recursively resolve if the target is also a $ref
    const nextVisited = new Set(visited);
    nextVisited.add(ref);
    return resolveRef(
        resolved,
        rootDocument,
        nextVisited,
        diagnostics,
        maxDepth,
        externalResolver
    );
}

// ---------------------------------------------------------------------------
// JSON Pointer dereference
// ---------------------------------------------------------------------------

/**
 * Dereference a JSON Pointer fragment (`#/path/to/schema`) or an
 * `$anchor` (`#SomeName`) against a root document.
 *
 * Returns the resolved sub-schema, which may be a JSON object or — per
 * Draft 06+ — a boolean (`true` for the always-valid schema, `false`
 * for the never-valid schema). Returns `undefined` when the pointer or
 * anchor cannot be resolved.
 *
 * JSON Pointer segments are percent-decoded per RFC 6901 §6 before the
 * `~1`/`~0` token expansion; this allows pointers such as
 * `#/paths/~1pets%20store` to resolve a path containing a literal space.
 */
export function dereference(
    ref: string,
    root: Record<string, unknown>
): Record<string, unknown> | boolean | undefined {
    // $ref: "#" (empty fragment) refers to the root document per RFC 6901
    if (ref === "#") return root;

    // JSON Pointer: #/path/to/schema
    if (ref.startsWith("#/")) {
        const parts = ref.slice(2).split("/");
        // "#/" (empty JSON Pointer) also refers to the root document
        if (parts.length === 1 && parts[0] === "") return root;
        let current: unknown = root;

        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            if (part === undefined) return undefined;
            // RFC 6901 §6: percent-decode the segment before applying
            // the JSON Pointer `~`-token transforms. Without this,
            // `%20` and similar escapes survive into the key lookup
            // and fail to match the literal characters the URI was
            // meant to encode. A malformed percent-escape (`decodeURIComponent`
            // throws on lone `%`) is treated as an unresolvable pointer.
            let percentDecoded: string;
            try {
                percentDecoded = decodeURIComponent(part);
            } catch {
                return undefined;
            }
            // JSON Pointer: ~1 → /, ~0 → ~
            const decoded = percentDecoded
                .replace(/~1/g, "/")
                .replace(/~0/g, "~");
            // Reject prototype-polluting segments (`__proto__`, `constructor`,
            // `prototype`). Walking into any of these reads `Object.prototype`
            // and lets a crafted `$ref` smuggle properties from the runtime
            // prototype chain into the resolved schema.
            if (isPrototypePollutingKey(decoded)) return undefined;
            if (!isObject(current)) return undefined;
            const next: unknown = current[decoded];
            // The final segment may legitimately resolve to a boolean
            // sub-schema (Draft 06+). Allow the loop to terminate
            // returning that boolean.
            if (i === parts.length - 1 && typeof next === "boolean") {
                return next;
            }
            current = next;
        }

        return isObject(current) ? current : undefined;
    }

    // $anchor: #SomeName — scan document for matching $anchor
    if (ref.startsWith("#") && ref.length > 1) {
        const anchorName = ref.slice(1);
        const found = findAnchor(root, anchorName);
        if (found !== undefined) return found;
    }

    return undefined;
}

// ---------------------------------------------------------------------------
// $anchor lookup
// ---------------------------------------------------------------------------

/**
 * Recursively scan a schema document for a `$anchor` matching the given name.
 * Returns the schema object containing the anchor, or undefined.
 *
 * Per JSON Schema 2020-12 §8.2, `$anchor` is scoped to the resource
 * defined by the nearest enclosing `$id`. A bare DFS would happily
 * cross resource boundaries and resolve to an anchor declared in an
 * unrelated sub-resource — that violates the spec and produces wrong
 * walker input when two sub-schemas use the same anchor name within
 * their own `$id` scope.
 *
 * The walk skips into any sub-tree that introduces a new `$id` value:
 * such a sub-tree is a separate resource and its `$anchor`s belong to
 * that resource, not the caller's. Anchors declared at the same `$id`
 * scope (or in nested sub-schemas without their own `$id`) remain
 * reachable.
 *
 * The optional `visited` set guards against shared object references and
 * cycles introduced by the OpenAPI bundler's `structuredClone`-based
 * inlining of external refs. Without it a recursive document would stack
 * overflow before reaching the matching anchor.
 *
 * When `crossResourceBoundary` is `true` the walker is currently
 * recursing into a sub-tree that introduced its own `$id`; we still
 * recurse so a nested `$anchor` declared inside that same sub-resource
 * is reachable from the caller that owns that resource, but we skip
 * further nested resources for the same reason as above.
 */
export function findAnchor(
    node: unknown,
    anchorName: string,
    visited: WeakSet<object> = new WeakSet<object>()
): Record<string, unknown> | undefined {
    if (!isObject(node)) return undefined;
    if (visited.has(node)) return undefined;
    visited.add(node);
    if (node.$anchor === anchorName) return node;

    // Recurse into known sub-schema locations, but skip sub-trees that
    // introduce a new `$id` — those are separate resources and their
    // anchors are not visible to the enclosing scope.
    for (const [key, value] of Object.entries(node)) {
        // `$id` itself is a string keyword on this node, not a sub-tree
        // boundary; skip the key entirely so we never recurse into the
        // string's `Object.values` representation.
        if (key === "$id") continue;
        if (isObject(value)) {
            if (introducesNewResource(value)) continue;
            const found = findAnchor(value, anchorName, visited);
            if (found !== undefined) return found;
        }
        if (Array.isArray(value)) {
            if (visited.has(value)) continue;
            visited.add(value);
            for (const item of value) {
                if (isObject(item) && introducesNewResource(item)) continue;
                const found = findAnchor(item, anchorName, visited);
                if (found !== undefined) return found;
            }
        }
    }

    return undefined;
}

/**
 * A sub-tree introduces a new resource when it carries a non-empty
 * string `$id`. JSON Schema 2020-12 treats such a sub-tree as the
 * root of a separate resource — its `$anchor` declarations live in
 * that resource's scope, not the enclosing one.
 */
function introducesNewResource(node: Record<string, unknown>): boolean {
    const id = node.$id;
    return typeof id === "string" && id.length > 0;
}
