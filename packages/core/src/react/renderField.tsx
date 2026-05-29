/**
 * React-side `renderField` dispatcher and global widget registry.
 *
 * Extracted from `react/SchemaComponent.tsx` so that `openapi/components.tsx`
 * can import the dispatcher without depending on the full SchemaComponent
 * module (which includes React context, hooks, and the component tree). The
 * public API at `react/SchemaComponent` re-exports everything here so
 * consumers importing via the historic path continue to work unchanged.
 */

import { isValidElement, type ReactNode } from "react";
import {
    buildRenderProps,
    getRenderFunction,
    mergeResolvers,
} from "../core/renderer.ts";
import type {
    ComponentResolver,
    RenderProps,
    WidgetMap,
} from "../core/renderer.ts";
import { dispatchRenderField } from "../core/renderField.ts";
import type { WalkedField } from "../core/types.ts";
import { headlessResolver } from "./headless.tsx";

// ---------------------------------------------------------------------------
// Widget registry
// ---------------------------------------------------------------------------

/**
 * Global widget registry — app-wide defaults.
 *
 * Exported so `react/SchemaComponent.tsx` can define `registerWidget` and
 * `__clearGlobalWidgets` as direct exports (not re-exports, which the
 * `custom/no-re-exports` rule bans in non-index files) while sharing the
 * same Map with `renderField`.
 *
 * @internal — callers outside this module should use `registerWidget`.
 */
export const globalWidgets = new Map<string, (props: RenderProps) => unknown>();

// ---------------------------------------------------------------------------
// Field rendering
// ---------------------------------------------------------------------------

/**
 * Render a single walked field through the resolved widget /
 * resolver / headless pipeline. Used internally by
 * {@link SchemaComponent} and {@link SchemaField}, exported so other
 * React-side components (e.g. the OpenAPI renderers) can dispatch
 * into the same fallback chain.
 *
 * Thin React-flavoured wrapper around the framework-agnostic
 * `dispatchRenderField` (from `core/renderField`): it constructs a
 * React-shaped `DispatchConfig` (widget lookup against the
 * instance → context → global chain, recursion sentinel as a React
 * `<fieldset>`, fallback as a `<span>`-wrapped value) and forwards
 * the call.
 */
export function renderField(
    tree: WalkedField,
    value: unknown,
    onChange: (v: unknown) => void,
    userResolver: ComponentResolver | undefined,
    renderChild: (
        tree: WalkedField,
        value: unknown,
        onChange: (v: unknown) => void,
        pathSuffix?: string
    ) => ReactNode,
    path: string,
    instanceWidgets?: WidgetMap,
    contextWidgets?: WidgetMap,
    depth = 0
): ReactNode {
    if (path.length === 0) {
        throw new Error(
            "renderField requires a non-empty path. Pass the root path " +
                "(derived from `idPrefix` or `useId()`) for the root field, " +
                "and use renderChild's pathSuffix to derive child paths."
        );
    }

    const resolver =
        userResolver !== undefined
            ? mergeResolvers(userResolver, headlessResolver)
            : headlessResolver;

    return dispatchRenderField<RenderProps, ReactNode, ComponentResolver>({
        tree,
        value,
        path,
        depth,
        resolver,
        config: {
            buildProps: (fieldTree, fieldPath) =>
                buildRenderProps(
                    fieldTree,
                    value,
                    onChange,
                    renderChild,
                    fieldPath
                ),
            lookupRenderFn: (type, mergedResolver) =>
                getRenderFunction(type, mergedResolver),
            lookupWidget: (name) =>
                instanceWidgets?.get(name) ??
                contextWidgets?.get(name) ??
                globalWidgets.get(name),
            recursionSentinel: (fieldTree) => {
                const label =
                    typeof fieldTree.meta.description === "string"
                        ? fieldTree.meta.description
                        : "schema";
                return (
                    <fieldset>
                        <em>↻ {label} (recursive)</em>
                    </fieldset>
                );
            },
            fallback: (_fieldTree, fieldValue) => {
                if (fieldValue === undefined || fieldValue === null)
                    return <span>—</span>;
                return (
                    <span>
                        {typeof fieldValue === "string"
                            ? fieldValue
                            : JSON.stringify(fieldValue)}
                    </span>
                );
            },
            coerceResult: (result, step) => {
                if (step === "widget") {
                    if (result === undefined || result === null)
                        return undefined;
                    if (isValidElement(result)) return result;
                    if (
                        typeof result === "string" ||
                        typeof result === "number"
                    )
                        return result;
                    return null;
                }
                if (result === undefined || result === null) return null;
                if (isValidElement(result)) return result;
                if (typeof result === "string" || typeof result === "number")
                    return result;
                return undefined;
            },
        },
    });
}
