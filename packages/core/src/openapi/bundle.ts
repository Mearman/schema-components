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
import { isPrototypePollutingKey } from "../core/uri.ts";

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
 * schema, inlines it into `components.schemas` under a synthesised name, and
 * rewrites the original $ref to point at the new internal location
 * (`#/components/schemas/<name>`).
 *
 * Identical external refs share a single entry — the second occurrence of
 * the same `(uri, fragment)` pair reuses the name produced for the first.
 * Name collisions between different refs are resolved by suffixing a counter.
 *
 * The resolver is called once per unique URI and the result is cached.
 *
 * Returns a deep-cloned document with all external refs replaced by internal
 * refs. The original document is never mutated.
 */
export async function bundleOpenApiDoc(
    doc: Record<string, unknown>,
    resolver: BundleResolver
): Promise<Record<string, unknown>> {
    const result: Record<string, unknown> = structuredClone(doc);
    const uriCache = new Map<string, Record<string, unknown>>();
    const inlineCache = new Map<string, string>();

    // Ensure components.schemas exists so we have a destination for inlines.
    if (!isObject(result.components)) {
        result.components = {};
    }
    const components = result.components;
    if (!isObject(components)) {
        // Unreachable: we just assigned a fresh object above. The guard is
        // here purely to narrow `components` for the next access.
        throw new Error("bundleOpenApiDoc: components is not an object");
    }
    if (!isObject(components.schemas)) {
        components.schemas = {};
    }
    const schemasNode = components.schemas;
    if (!isObject(schemasNode)) {
        throw new Error(
            "bundleOpenApiDoc: components.schemas is not an object"
        );
    }

    await walkAndInline(result, schemasNode, uriCache, inlineCache, resolver);

    return result;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Walk a document tree, find external $ref strings, resolve them,
 * inline the targets into `components.schemas`, and rewrite each $ref
 * to point at the new internal location.
 */
async function walkAndInline(
    node: unknown,
    schemasNode: Record<string, unknown>,
    uriCache: Map<string, Record<string, unknown>>,
    inlineCache: Map<string, string>,
    resolver: BundleResolver
): Promise<void> {
    if (!isObject(node)) return;

    if (typeof node.$ref === "string" && !node.$ref.startsWith("#")) {
        const ref = node.$ref;
        const hashIndex = ref.indexOf("#");
        const uri = hashIndex >= 0 ? ref.slice(0, hashIndex) : ref;
        const fragment = hashIndex >= 0 ? ref.slice(hashIndex) : "#";

        let externalDoc = uriCache.get(uri);
        if (externalDoc === undefined) {
            const resolved = await resolver(uri);
            if (isObject(resolved)) {
                externalDoc = resolved;
                uriCache.set(uri, externalDoc);
            }
        }

        if (externalDoc !== undefined) {
            const cacheKey = `${uri}${fragment}`;
            let inlinedName = inlineCache.get(cacheKey);

            if (inlinedName === undefined) {
                const target = resolveFragment(externalDoc, fragment);
                if (isObject(target)) {
                    inlinedName = registerInline(
                        schemasNode,
                        uri,
                        fragment,
                        target
                    );
                    inlineCache.set(cacheKey, inlinedName);

                    // Recurse into the newly inlined copy so any nested
                    // external refs inside it are also bundled.
                    await walkAndInline(
                        schemasNode[inlinedName],
                        schemasNode,
                        uriCache,
                        inlineCache,
                        resolver
                    );
                }
            }

            if (inlinedName !== undefined) {
                node.$ref = `#/components/schemas/${inlinedName}`;
            }
        }

        // OpenAPI 3.1 / JSON Schema 2020-12: a node containing `$ref` is a
        // reference object. Non-spec-defined siblings are tolerated but are
        // not processed as schemas, so we must not walk into them here.
        return;
    }

    for (const value of Object.values(node)) {
        if (isObject(value)) {
            await walkAndInline(
                value,
                schemasNode,
                uriCache,
                inlineCache,
                resolver
            );
        } else if (Array.isArray(value)) {
            for (const item of value) {
                await walkAndInline(
                    item,
                    schemasNode,
                    uriCache,
                    inlineCache,
                    resolver
                );
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
        // Reject prototype-polluting segments (`__proto__`, `constructor`,
        // `prototype`). Walking into any of these reads `Object.prototype`
        // and lets a crafted `$ref` smuggle properties from the runtime
        // prototype chain into the inlined bundle.
        if (isPrototypePollutingKey(decoded)) return undefined;
        current = current[decoded];
    }

    return isObject(current) ? current : undefined;
}

/**
 * Derive a candidate identifier for an inlined external schema. Prefers
 * the last meaningful segment of the JSON Pointer fragment; falls back
 * to the URI's filename (sans extension), then to a generic prefix.
 */
function deriveCandidateName(uri: string, fragment: string): string {
    if (fragment.startsWith("#/")) {
        const parts = fragment.slice(2).split("/");
        const last = parts.at(-1);
        if (last !== undefined && last.length > 0) {
            return sanitiseName(last);
        }
    }

    // Strip query/hash, take the final path segment, drop the extension.
    const pathOnly = uri.split(/[?#]/)[0] ?? uri;
    const lastSlash = pathOnly.lastIndexOf("/");
    const filename = lastSlash >= 0 ? pathOnly.slice(lastSlash + 1) : pathOnly;
    const dot = filename.lastIndexOf(".");
    const stem = dot > 0 ? filename.slice(0, dot) : filename;

    if (stem.length > 0) {
        return sanitiseName(stem);
    }
    return "ExternalSchema";
}

/**
 * Sanitise a string into a JSON Pointer-safe identifier: alphanumerics
 * and underscores only. An empty result falls back to "Schema".
 */
function sanitiseName(raw: string): string {
    const cleaned = raw.replace(/[^A-Za-z0-9_]/g, "_");
    return cleaned.length > 0 ? cleaned : "Schema";
}

/**
 * Place the resolved target into `components.schemas` under a unique
 * name derived from the ref, and return the chosen name. Collisions
 * with existing entries are resolved by suffixing a counter.
 */
function registerInline(
    schemasNode: Record<string, unknown>,
    uri: string,
    fragment: string,
    target: Record<string, unknown>
): string {
    const base = deriveCandidateName(uri, fragment);
    let name = base;
    let counter = 2;
    while (name in schemasNode) {
        name = `${base}_${String(counter)}`;
        counter++;
    }
    schemasNode[name] = structuredClone(target);
    return name;
}
