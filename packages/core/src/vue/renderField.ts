/**
 * Vue-flavoured wrapper around the framework-agnostic
 * `dispatchRenderField` from `core/renderField.ts`.
 *
 * Constructs a Vue-shaped {@link DispatchConfig} (widget lookup against
 * the instance → context → global chain, recursion sentinel as a Vue
 * `<fieldset>` {@link VNode}, fallback as a `<span>`-wrapped value) and
 * forwards the call. Used by the `<SchemaComponent>` and `<SchemaView>`
 * SFCs and exported so other Vue surfaces (future API operation
 * components, etc.) can dispatch into the same fallback chain.
 *
 * The widget-lookup contract matches the React adapter exactly:
 * instance map first, then context map, then global registry. The
 * dispatcher itself remains agnostic to how widget maps are scoped —
 * the resolution chain is expressed here in the `lookupWidget`
 * closure.
 */

import { h, isVNode, type VNode } from "vue";
import { dispatchRenderField } from "../core/renderField.ts";
import type { WalkedField } from "../core/types.ts";
import { EM_DASH } from "../core/cssClasses.ts";
import { getVueRenderFunction, mergeVueResolvers } from "./resolver.ts";
import { headlessVueResolver } from "./headless.ts";
import type {
    VueComponentResolver,
    VueRenderProps,
    VueWidgetMap,
} from "./types.ts";
import { lookupGlobalWidget } from "./widget.ts";

/**
 * Build the {@link VueRenderProps} object handed to a Vue render
 * function or widget. Mirrors `buildRenderProps` in `core/renderer.ts`
 * but emits Vue's `VNode`-returning `renderChild` signature directly so
 * the dispatcher does not need to cross-cast between React and Vue
 * shapes at the resolver boundary.
 */
function buildVueRenderProps(
    tree: WalkedField,
    value: unknown,
    onChange: (next: unknown) => void,
    renderChild: VueRenderProps["renderChild"],
    path: string
): VueRenderProps {
    const isReadOnly = tree.editability === "presentation";
    const isWriteOnly = tree.editability === "input";
    const props: VueRenderProps = {
        value,
        onChange,
        readOnly: isReadOnly,
        writeOnly: isWriteOnly,
        meta: tree.meta,
        constraints: tree.constraints,
        path,
        tree,
        renderChild,
    };
    if (tree.examples !== undefined) props.examples = tree.examples;
    return props;
}

/**
 * Render a single walked field through the resolved widget / resolver
 * / headless pipeline.
 *
 * Thin Vue-flavoured wrapper around {@link dispatchRenderField}: it
 * constructs a Vue-shaped {@link DispatchConfig} and returns the
 * dispatcher's {@link VNode} output.
 *
 * @param tree - The walked field tree node to render.
 * @param value - The current value at this position.
 * @param onChange - Callback invoked when the field emits a change. For
 *   read-only renders (e.g. `<SchemaView>`) pass a noop.
 * @param userResolver - User-supplied resolver, or `undefined` to use
 *   the headless resolver alone.
 * @param renderChild - Recursive child renderer threaded through
 *   the {@link VueRenderProps} `renderChild` field.
 * @param path - Dot-separated structural path; non-empty.
 * @param instanceWidgets - Per-instance widget map (highest priority).
 * @param contextWidgets - Context-scoped widget map (middle priority).
 * @param depth - Recursion depth used by the depth cap in
 *   {@link dispatchRenderField}.
 */
export function vueRenderField(
    tree: WalkedField,
    value: unknown,
    onChange: (v: unknown) => void,
    userResolver: VueComponentResolver | undefined,
    renderChild: VueRenderProps["renderChild"],
    path: string,
    instanceWidgets?: VueWidgetMap,
    contextWidgets?: VueWidgetMap,
    depth = 0
): VNode {
    if (path.length === 0) {
        throw new Error(
            "vueRenderField requires a non-empty path. Pass the root path " +
                "(derived from `idPrefix` or `useId()`) for the root field, " +
                "and use renderChild's pathSuffix to derive child paths."
        );
    }

    // Build the merged resolver once per dispatch — user overrides on
    // top of the headless fallback, mirroring the historic React
    // behaviour.
    const resolver: VueComponentResolver =
        userResolver !== undefined
            ? mergeVueResolvers(userResolver, headlessVueResolver)
            : headlessVueResolver;

    return dispatchRenderField<VueRenderProps, VNode, VueComponentResolver>({
        tree,
        value,
        path,
        depth,
        resolver,
        config: {
            buildProps: (fieldTree, fieldPath) =>
                buildVueRenderProps(
                    fieldTree,
                    value,
                    onChange,
                    renderChild,
                    fieldPath
                ),
            lookupRenderFn: (type, mergedResolver) =>
                getVueRenderFunction(type, mergedResolver),
            // Widget lookup follows the canonical Vue resolution
            // order: instance → context → global. Pulled out as a
            // closure so the dispatcher remains agnostic to how
            // widget maps are scoped.
            lookupWidget: (name) =>
                instanceWidgets?.get(name) ??
                contextWidgets?.get(name) ??
                lookupGlobalWidget(name),
            recursionSentinel: (fieldTree) => {
                const label =
                    typeof fieldTree.meta.description === "string"
                        ? fieldTree.meta.description
                        : "schema";
                return h("fieldset", undefined, [
                    h("em", undefined, `↻ ${label} (recursive)`),
                ]);
            },
            fallback: (_fieldTree, fieldValue) => {
                if (fieldValue === undefined || fieldValue === null)
                    return h("span", undefined, EM_DASH);
                return h(
                    "span",
                    undefined,
                    typeof fieldValue === "string"
                        ? fieldValue
                        : JSON.stringify(fieldValue)
                );
            },
            coerceResult: (result, step) => {
                if (step === "widget") {
                    if (result === undefined || result === null)
                        return undefined;
                    if (isVNode(result)) return result;
                    // Widget returned a value but not in a Vue-renderable
                    // shape — wrap it in a span so the output remains a
                    // valid VNode rather than falling through to the
                    // resolver.
                    if (
                        typeof result === "string" ||
                        typeof result === "number"
                    )
                        return h("span", undefined, String(result));
                    return h("span");
                }
                if (result === undefined || result === null)
                    return h("span", { style: { display: "none" } });
                if (isVNode(result)) return result;
                if (typeof result === "string" || typeof result === "number")
                    return h("span", undefined, String(result));
                return undefined;
            },
        },
    });
}
