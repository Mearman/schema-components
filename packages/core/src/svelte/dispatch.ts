/**
 * Svelte-flavoured wrappers around `core/renderField.ts`'s
 * framework-agnostic dispatcher.
 *
 * The dispatcher is the same one used by the React adapter — see
 * `core/renderField.ts`. This module supplies the Svelte-specific
 * {@link "../core/renderField.ts".DispatchConfig | DispatchConfig}:
 * the `buildProps` factory, the `lookupRenderFn` against a
 * {@link SvelteComponentResolver}, the per-step result coercion,
 * and the recursion-cap sentinel.
 *
 * Centralising the wiring lets both `SchemaComponent.svelte` and
 * `SchemaView.svelte` plug into the dispatcher without duplicating
 * the closures, and keeps the dispatch order (depth cap → widget →
 * resolver → fallback) identical across editable and read-only call
 * sites.
 */

import {
    buildRenderProps,
    RESOLVER_KEYS,
    type RenderProps,
} from "../core/renderer.ts";
import { dispatchRenderField } from "../core/renderField.ts";
import { SchemaRenderError } from "../core/errors.ts";
import type { WalkedField } from "../core/types.ts";
import { headlessSvelteResolver } from "./headless.ts";
import { lookupGlobalWidget } from "./widget.ts";
import type {
    SvelteComponentConstructor,
    SvelteComponentResolver,
    SvelteRenderDescriptor,
    SvelteRenderProps,
    SvelteWidgetMap,
} from "./types.ts";

/**
 * Merge a user-supplied {@link SvelteComponentResolver} on top of
 * the headless resolver. Mirrors `core/renderer.ts`'s
 * `mergeResolvers` for the Svelte-flavoured resolver shape — user
 * values win, fallback fills gaps.
 *
 * Implemented directly rather than delegating to the generic
 * `mergeResolvers` because the latter is typed against
 * `ComponentResolver` — the React-flavoured resolver whose values
 * are typed `RenderFunction\<unknown, RenderProps\>`. The per-key
 * behaviour is identical: each
 * {@link RESOLVER_KEYS} entry is taken from `user` if defined,
 * otherwise from `fallback`. The single source of truth on which
 * keys exist is {@link RESOLVER_KEYS}, so adding a new
 * `WalkedField` variant in `core/types.ts` automatically threads
 * through the Svelte merge.
 */
export function mergeSvelteResolvers(
    user: SvelteComponentResolver,
    fallback: SvelteComponentResolver
): SvelteComponentResolver {
    const merged: SvelteComponentResolver = {};
    for (const key of RESOLVER_KEYS) {
        const fn = user[key] ?? fallback[key];
        if (fn !== undefined) {
            merged[key] = fn;
        }
    }
    return merged;
}

/**
 * Dispatch a single field through the Svelte dispatch chain.
 *
 * Looks up the matching {@link SvelteRenderFunction} in the supplied
 * resolver (with the headless resolver as fallback), invokes it with
 * the per-field props, and returns the resulting
 * {@link SvelteRenderDescriptor} for the parent renderer to mount.
 *
 * Widget overrides (`.meta({ component: name })`) are resolved
 * against the supplied instance → context → global chain before the
 * resolver. The dispatch order matches the React adapter exactly:
 *
 *   1. Depth cap (`MAX_RENDER_DEPTH`) — returns the recursion
 *      sentinel descriptor.
 *   2. Widget override — instance map → context map → global
 *      registry.
 *   3. Resolver render function for `tree.type`.
 *   4. Fallback — emits an em-dash / stringified-value descriptor.
 */
export function renderFieldSvelte(
    tree: WalkedField,
    value: unknown,
    onChange: (v: unknown) => void,
    userResolver: SvelteComponentResolver | undefined,
    renderChild: SvelteRenderProps["renderChild"],
    path: string,
    instanceWidgets: SvelteWidgetMap | undefined,
    contextWidgets: SvelteWidgetMap | undefined,
    depth: number,
    fallbackComponent: SvelteComponentConstructor,
    sentinelComponent: SvelteComponentConstructor
): SvelteRenderDescriptor | null {
    if (path.length === 0) {
        throw new Error(
            "renderFieldSvelte requires a non-empty path. Pass the root " +
                "path for the root field and use renderChild's pathSuffix " +
                "to derive child paths."
        );
    }

    const resolver: SvelteComponentResolver =
        userResolver !== undefined
            ? mergeSvelteResolvers(userResolver, headlessSvelteResolver)
            : headlessSvelteResolver;

    return dispatchRenderField<
        SvelteRenderProps,
        SvelteRenderDescriptor | null,
        SvelteComponentResolver
    >({
        tree,
        value,
        path,
        depth,
        resolver,
        config: {
            buildProps: (fieldTree, fieldPath) => {
                // The React-flavoured `buildRenderProps` returns
                // `RenderProps`. Svelte's `SvelteRenderProps` shares
                // every field except the `renderChild` return type
                // (which is `SvelteRenderDescriptor | null` here vs.
                // `unknown` for React). Adapt by re-wrapping the
                // child render function we hold to satisfy the
                // structural shape `buildRenderProps` expects, then
                // re-cast on output. The cast is contained to this
                // one boundary; no runtime reshaping required.
                const reactShapedChild: RenderProps["renderChild"] = (
                    childTree,
                    childValue,
                    childOnChange,
                    pathSuffix
                ) =>
                    renderChild(
                        childTree,
                        childValue,
                        childOnChange,
                        pathSuffix
                    );
                const reactProps = buildRenderProps(
                    fieldTree,
                    value,
                    onChange,
                    reactShapedChild,
                    fieldPath
                );
                // Re-shape onto SvelteRenderProps. The structural
                // overlap with `RenderProps` is total apart from the
                // `renderChild` return type; we substitute the
                // Svelte-shaped function so consumers receive the
                // proper output narrowing.
                const svelteProps: SvelteRenderProps = {
                    ...reactProps,
                    renderChild,
                };
                return svelteProps;
            },
            lookupRenderFn: (type, mergedResolver) => mergedResolver[type],
            ...(instanceWidgets !== undefined || contextWidgets !== undefined
                ? {
                      lookupWidget: (name: string) =>
                          instanceWidgets?.get(name) ??
                          contextWidgets?.get(name) ??
                          lookupGlobalWidget(name),
                  }
                : {
                      lookupWidget: (name: string) => lookupGlobalWidget(name),
                  }),
            recursionSentinel: (fieldTree) => ({
                component: sentinelComponent,
                props: buildSentinelProps(
                    fieldTree,
                    value,
                    onChange,
                    path,
                    renderChild
                ),
            }),
            fallback: (fieldTree, fieldValue) => ({
                component: fallbackComponent,
                props: buildSentinelProps(
                    fieldTree,
                    fieldValue,
                    onChange,
                    path,
                    renderChild
                ),
            }),
            coerceResult: (result, step) => {
                // Widget step — undefined / null falls through to
                // the resolver. Anything else is treated as a
                // descriptor (or null short-circuit).
                if (step === "widget") {
                    if (result === undefined || result === null)
                        return undefined;
                    if (isDescriptor(result)) return result;
                    return undefined;
                }
                // Resolver step — undefined falls through to the
                // fallback; null short-circuits with "render
                // nothing" (matches React's empty-array suppression
                // path).
                if (result === undefined) return undefined;
                if (result === null) return null;
                if (isDescriptor(result)) return result;
                return undefined;
            },
            wrapRenderError: (err, fieldTree, fieldPath) =>
                new SchemaRenderError(
                    err instanceof Error
                        ? err.message
                        : `Render function threw for type "${fieldTree.type}" at "${fieldPath}"`,
                    fieldTree,
                    fieldTree.type,
                    err
                ),
        },
    });
}

/**
 * Build the per-field props passed to the recursion-sentinel /
 * fallback Svelte components. Both stages need the full
 * {@link SvelteRenderProps} shape (so the component can read
 * `value`, `meta`, etc.) so the helper centralises the construction.
 */
function buildSentinelProps(
    tree: WalkedField,
    value: unknown,
    onChange: (v: unknown) => void,
    path: string,
    renderChild: SvelteRenderProps["renderChild"]
): SvelteRenderProps {
    return {
        value,
        readOnly: tree.editability === "presentation",
        writeOnly: tree.editability === "input",
        meta: tree.meta,
        constraints: tree.constraints,
        path,
        tree,
        onChange,
        renderChild,
        ...(tree.examples !== undefined ? { examples: tree.examples } : {}),
    };
}

/**
 * Type guard narrowing an unknown widget / resolver return value to
 * a {@link SvelteRenderDescriptor}. The shape check is structural:
 * any object with a callable `component` and a `props` field passes.
 *
 * Strict enough that an accidentally-returned `ReactNode` or HTML
 * string is rejected before the dispatcher hands it to `<Mount>`.
 */
function isDescriptor(value: unknown): value is SvelteRenderDescriptor {
    if (typeof value !== "object" || value === null) return false;
    if (!("component" in value)) return false;
    if (!("props" in value)) return false;
    return typeof value.component === "function";
}
