/**
 * $ref resolution for JSON Schema.
 *
 * Handles JSON Pointer dereference, $anchor lookup, cycle detection,
 * and depth limiting derived from the document's own $ref count.
 */

import { isObject } from "./guards.ts";
import type { DiagnosticsOptions } from "./diagnostics.ts";
import { emitDiagnostic } from "./diagnostics.ts";

// ---------------------------------------------------------------------------
// External resolver hook
// ---------------------------------------------------------------------------

/**
 * Resolver function for external $ref URIs.
 * Called with the URI portion (everything before `#`) of an external ref.
 * Returns the parsed document (JSON object) or undefined.
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
    collectRefs(root, refs);
    return Math.max(refs.size, 1);
}

function collectRefs(node: unknown, refs: Set<string>): void {
    if (!isObject(node)) return;

    const ref = node.$ref;
    if (typeof ref === "string") {
        refs.add(ref);
    }

    for (const value of Object.values(node)) {
        if (isObject(value)) {
            collectRefs(value, refs);
        } else if (Array.isArray(value)) {
            for (const item of value) {
                collectRefs(item, refs);
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
    maxDepth?: number
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

    // Depth bound: derived from document's distinct ref count, or a
    // reasonable default of 64 for callers that don't pre-compute.
    const depthLimit = maxDepth ?? 64;
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

    // Recursively resolve if the target is also a $ref
    const nextVisited = new Set(visited);
    nextVisited.add(ref);
    return resolveRef(
        resolved,
        rootDocument,
        nextVisited,
        diagnostics,
        maxDepth
    );
}

// ---------------------------------------------------------------------------
// JSON Pointer dereference
// ---------------------------------------------------------------------------

/**
 * Dereference a JSON Pointer fragment (`#/path/to/schema`) or an
 * `$anchor` (`#SomeName`) against a root document.
 */
export function dereference(
    ref: string,
    root: Record<string, unknown>
): Record<string, unknown> | undefined {
    // $ref: "#" (empty fragment) refers to the root document per RFC 6901
    if (ref === "#") return root;

    // JSON Pointer: #/path/to/schema
    if (ref.startsWith("#/")) {
        const parts = ref.slice(2).split("/");
        // "#/" (empty JSON Pointer) also refers to the root document
        if (parts.length === 1 && parts[0] === "") return root;
        let current: unknown = root;

        for (const part of parts) {
            if (!isObject(current)) return undefined;
            // JSON Pointer: ~1 → /, ~0 → ~
            const decoded = part.replace(/~1/g, "/").replace(/~0/g, "~");
            current = current[decoded];
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
 */
export function findAnchor(
    node: unknown,
    anchorName: string
): Record<string, unknown> | undefined {
    if (!isObject(node)) return undefined;
    if (node.$anchor === anchorName) return node;

    // Recurse into known sub-schema locations
    for (const value of Object.values(node)) {
        if (isObject(value)) {
            const found = findAnchor(value, anchorName);
            if (found !== undefined) return found;
        }
        if (Array.isArray(value)) {
            for (const item of value) {
                const found = findAnchor(item, anchorName);
                if (found !== undefined) return found;
            }
        }
    }

    return undefined;
}
