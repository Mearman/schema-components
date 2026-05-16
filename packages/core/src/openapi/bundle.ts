/**
 * OpenAPI document bundler — inlines external $ref files.
 *
 * Walks all `$ref` strings in an OpenAPI document, fetches external
 * documents via a user-provided resolver, inlines their schemas into
 * `components.schemas` with synthesised names, and rewrites the refs
 * to point to the inlined copies.
 *
 * This is an opt-in async pre-step. The synchronous core API is unchanged;
 * consumers call `bundleOpenApiDoc` once before rendering.
 *
 * Usage:
 * ```ts
 * import { bundleOpenApiDoc } from "schema-components/openapi/bundle";
 *
 * const resolver = async (uri: string) => {
 *     const response = await fetch(uri);
 *     return response.json();
 * };
 *
 * const bundled = await bundleOpenApiDoc(doc, resolver);
 * // Now pass bundled to SchemaComponent / ApiOperation
 * ```
 */

import { isObject } from "../core/guards.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Resolver function for external documents.
 * Called with the URI portion of an external $ref (everything before `#`).
 * Returns the parsed JSON document.
 */
export type BundleResolver = (uri: string) => unknown;

// ---------------------------------------------------------------------------
// Bundler
// ---------------------------------------------------------------------------

/**
 * Bundle an OpenAPI document by inlining all external $ref targets.
 *
 * Walks every $ref in the document. For external refs (not starting with `#`),
 * calls the resolver to fetch the external document, extracts the referenced
 * schema, inlines it into `components.schemas` with a synthesised name, and
 * rewrites the $ref to point to the inlined copy.
 *
 * The resolver is called once per unique URI and the result is cached.
 *
 * Returns a deep-cloned document with all external refs resolved.
 * The original document is never mutated.
 */
export async function bundleOpenApiDoc(
    doc: Record<string, unknown>,
    resolver: BundleResolver
): Promise<Record<string, unknown>> {
    const result: Record<string, unknown> = structuredClone(doc);
    const uriCache = new Map<string, Record<string, unknown>>();

    // Ensure components.schemas exists
    if (!isObject(result.components)) {
        result.components = {};
    }
    const components = result.components;
    if (!isObject(components.schemas)) {
        components.schemas = {};
    }

    // Walk and inline external refs
    await walkAndInline(result, uriCache, resolver);

    return result;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Walk a document tree, find external $ref strings, resolve them,
 * inline the targets, and rewrite the refs.
 */
async function walkAndInline(
    node: unknown,
    uriCache: Map<string, Record<string, unknown>>,
    resolver: BundleResolver
): Promise<void> {
    if (!isObject(node)) return;

    // Check if this node has an external $ref
    if (typeof node.$ref === "string" && !node.$ref.startsWith("#")) {
        const ref = node.$ref;
        const hashIndex = ref.indexOf("#");
        const uri = hashIndex >= 0 ? ref.slice(0, hashIndex) : ref;
        const fragment = hashIndex >= 0 ? ref.slice(hashIndex) : "#";

        // Fetch and cache the external document
        let externalDoc = uriCache.get(uri);
        if (externalDoc === undefined) {
            const resolved = await resolver(uri);
            if (isObject(resolved)) {
                externalDoc = resolved;
                uriCache.set(uri, externalDoc);
            }
        }

        if (externalDoc !== undefined) {
            // Resolve the fragment within the external document
            const target = resolveFragment(externalDoc, fragment);
            if (isObject(target)) {
                // Inline the resolved schema directly into the node,
                // replacing the $ref with the resolved content.
                delete node.$ref;
                for (const [key, value] of Object.entries(target)) {
                    node[key] = value;
                }
            }
        }
    }

    // Recurse into child objects and arrays
    for (const value of Object.values(node)) {
        if (isObject(value)) {
            await walkAndInline(value, uriCache, resolver);
        } else if (Array.isArray(value)) {
            for (const item of value) {
                await walkAndInline(item, uriCache, resolver);
            }
        }
    }
}

/**
 * Resolve a JSON Pointer fragment within a document.
 */
function resolveFragment(
    doc: Record<string, unknown>,
    fragment: string
): Record<string, unknown> | undefined {
    if (fragment === "#" || fragment === "") return doc;
    if (!fragment.startsWith("#/")) return undefined;

    const parts = fragment.slice(2).split("/");
    let current: unknown = doc;

    for (const part of parts) {
        if (!isObject(current)) return undefined;
        const decoded = part.replace(/~1/g, "/").replace(/~0/g, "~");
        current = current[decoded];
    }

    return isObject(current) ? current : undefined;
}
