/**
 * Vue resolver helpers — resolver-key lookup and resolver merging.
 *
 * Mirrors the React adapter's `getRenderFunction` / `mergeResolvers`
 * pair, parameterised over {@link VueComponentResolver} and
 * {@link VueRenderFunction}. Reuses {@link RESOLVER_KEYS} and
 * {@link typeToKey} from `core/renderer.ts` so the per-type → key
 * mapping has one canonical definition shared by every adapter.
 */

import { RESOLVER_KEYS, typeToKey } from "../core/renderer.ts";
import type { WalkedField } from "../core/types.ts";
import type { VueComponentResolver, VueRenderFunction } from "./types.ts";

/**
 * Look up the {@link VueRenderFunction} for a schema type in a
 * {@link VueComponentResolver}. Returns `undefined` when the resolver
 * has no entry for the type — the caller (typically the dispatcher in
 * `core/renderField.ts`) then falls through to the headless resolver.
 */
export function getVueRenderFunction(
    type: WalkedField["type"],
    resolver: VueComponentResolver
): VueRenderFunction | undefined {
    return resolver[typeToKey(type)];
}

/**
 * Merge two {@link VueComponentResolver}s — user values take priority,
 * fallback fills gaps. Iterates {@link RESOLVER_KEYS} so every field
 * variant the walker can emit has a deterministic resolution path.
 */
export function mergeVueResolvers(
    user: VueComponentResolver,
    fallback: VueComponentResolver
): VueComponentResolver {
    const merged: VueComponentResolver = {};
    for (const key of RESOLVER_KEYS) {
        const fn = user[key] ?? fallback[key];
        if (fn !== undefined) {
            merged[key] = fn;
        }
    }
    return merged;
}
