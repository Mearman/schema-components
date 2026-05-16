/**
 * $ref resolution for JSON Schema.
 *
 * Handles JSON Pointer dereference, $anchor lookup, cycle detection,
 * and maximum depth limiting.
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
// Constants
// ---------------------------------------------------------------------------

const MAX_REF_DEPTH = 10;

// ---------------------------------------------------------------------------
// $ref resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a `$ref` in a schema against a root document.
 * Returns the original schema if no `$ref` is present.
 * Returns an unknown-schema placeholder on cycle or depth exceeded.
 */
export function resolveRef(
    schema: Record<string, unknown>,
    rootDocument: Record<string, unknown>,
    visited: Set<string>,
    diagnostics?: DiagnosticsOptions
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
    if (visited.size >= MAX_REF_DEPTH) {
        emitDiagnostic(diagnostics, {
            code: "unresolved-ref",
            message: `Maximum $ref depth exceeded: ${ref}`,
            pointer: ref,
            detail: { ref, depth: visited.size },
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
    return resolveRef(resolved, rootDocument, nextVisited, diagnostics);
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
