/**
 * Framework-generic render-field dispatcher.
 *
 * Centralises the dispatch loop shared by the React `SchemaComponent` /
 * `SchemaView` renderers, the synchronous HTML renderer in
 * `renderToHtml`, the streaming HTML renderer in `streamRenderers.ts`
 * (for its leaf path — see "Streaming integration" below), and (in
 * the future) Vue / Solid / Svelte / Lit adapters. The dispatcher is
 * intentionally framework-agnostic: it neither imports React nor
 * produces HTML strings directly. Each adapter supplies a small
 * {@link DispatchConfig} describing how to build per-field props, how
 * to handle a successful or absent resolver lookup, and (optionally)
 * how to handle widget overrides and the recursion-depth cap.
 *
 * The dispatch order is fixed and matches the historic React-side
 * behaviour so the React, HTML, and future adapters all observe the
 * same resolution chain:
 *
 *   1. Depth cap — when `depth >= MAX_RENDER_DEPTH`, return the
 *      adapter's recursion sentinel without invoking any renderer.
 *   2. Widget override — if a `.meta({ component })` hint matches a
 *      registered widget, call it. A non-empty result short-circuits.
 *   3. Resolver render function — look up `tree.type` in the supplied
 *      resolver and call it. Render-time errors are wrapped via
 *      {@link DispatchConfig.wrapRenderError} so every adapter routes
 *      thrown errors through the same {@link SchemaRenderError} path.
 *   4. Fallback — when no renderer produced output, return the
 *      adapter's `fallback` output.
 *
 * The helpers that find render functions, merge resolvers, and build
 * the per-field props live in {@link "./renderer.ts"} and are reused
 * here — `core/renderField.ts` is purely the dispatch shell.
 *
 * # Streaming integration (design choice B)
 *
 * The streaming HTML renderer (`html/streamRenderers.ts` +
 * `html/renderToHtmlStream.ts`) consumes this dispatcher for leaf
 * field types — `string`, `number`, `boolean`, `enum`, `literal`,
 * `file`, `unknown` — and for variants without a dedicated streaming
 * generator (`null`, `tuple`, `conditional`, `negation`, `never`).
 * Container types (`object`, `array`, `record`, `union`,
 * `discriminatedUnion`) keep bespoke generator implementations
 * because the dispatcher's single-output contract cannot express the
 * "yield opening tag → recurse into children → yield closing tag"
 * chunk-boundary semantics that streaming depends on.
 *
 * We deliberately chose this approach (the Phase 1 agent's "option
 * B" — leaves dispatch through the shared loop, containers keep their
 * own iteration) over the alternative of building a generator-output
 * mode into the dispatcher itself. Approach B preserves the existing
 * chunk boundaries byte-for-byte while still eliminating the duplicate
 * resolver-lookup logic that previously lived in `renderLeaf`. A
 * generator-aware dispatcher would require either a parallel "stream
 * resolver" shape or a unified return type wide enough to cover both
 * single-output and iterable cases — neither of which is justified by
 * the small amount of dispatch logic the leaf path needs.
 *
 * The streaming `streamField` function performs its own depth check
 * before invoking the dispatcher for leaf paths. The check appears
 * textually in both places (streamField and this dispatcher) but at
 * runtime fires exactly once per recursion step: streamField's guard
 * filters the streaming path, and the dispatcher's guard remains in
 * place for the sync HTML and React callers that do not pre-filter
 * depth themselves. See `html/streamRenderers.ts` for the matching
 * commentary.
 */

import { MAX_RENDER_DEPTH } from "./limits.ts";
import { SchemaRenderError } from "./errors.ts";
import type { WalkedField } from "./types.ts";
import type { RenderFunction } from "./renderer.ts";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/**
 * Per-adapter configuration consumed by {@link dispatchRenderField}.
 *
 * Each adapter (React, HTML, future Vue / Solid / Svelte / Lit) supplies
 * one of these to plug its own per-field-props shape, output type, and
 * fallback/error behaviour into the shared dispatch loop without having
 * the dispatcher hardcode any framework-specific imports.
 *
 * @typeParam Props - The shape of the per-field props passed to render
 *   functions and widgets (e.g. `RenderProps` for React,
 *   `HtmlRenderProps` for HTML).
 * @typeParam Output - The type each render function and widget emits
 *   for a single field (e.g. `unknown` / `ReactNode` for React,
 *   `string` for HTML).
 * @typeParam Resolver - The resolver shape that maps schema types to
 *   render functions (e.g. `ComponentResolver` for React,
 *   `HtmlResolver` for HTML).
 */
export interface DispatchConfig<Props, Output, Resolver> {
    /**
     * Build the per-field props handed to the render function or widget
     * when it is about to be invoked. Called at most once per dispatch
     * — adapters that need the same props for both the widget lookup
     * and the resolver lookup may call it twice through the
     * `dispatchRenderField` boundary.
     */
    buildProps: (tree: WalkedField, path: string) => Props;
    /**
     * Look up a render function for `tree.type` in the resolver. Each
     * adapter wires this to its own `getRenderFunction` /
     * `getHtmlRenderFn` lookup so the dispatcher does not need to know
     * which resolver shape applies.
     *
     * The returned render function's output is typed `unknown` rather
     * than `Output` so adapters whose render functions historically
     * returned a broader type (React's
     * `RenderFunction\<unknown, RenderProps\>`) compose naturally. The
     * dispatcher hands the `unknown` return value to
     * {@link DispatchConfig.coerceResult}, which narrows it to
     * `Output` once per dispatch.
     */
    lookupRenderFn: (
        type: WalkedField["type"],
        resolver: Resolver
    ) => RenderFunction<unknown, Props> | undefined;
    /**
     * Produce the output emitted when the dispatcher hits
     * {@link MAX_RENDER_DEPTH}. Adapters return their own sentinel
     * (React: a `<fieldset>` element; HTML: the `recursionSentinelHtml`
     * string; etc.) so the caller decides how to mark recursive
     * positions in the rendered output.
     */
    recursionSentinel: (tree: WalkedField) => Output;
    /**
     * Produce the output emitted when no widget or resolver render
     * function handled the field. Most adapters either return a
     * `<span>` of the stringified value (React) or throw — the
     * dispatcher does not interpret the return value, only forwards
     * it.
     */
    fallback: (tree: WalkedField, value: unknown, path: string) => Output;
    /**
     * Coerce the raw `unknown` return value of a render function or
     * widget into the adapter's `Output` type, or `undefined` if the
     * result should be discarded (so the dispatcher falls through to
     * the next step).
     *
     * The `step` argument identifies which dispatch stage produced
     * the result — `"widget"` for a `.meta({ component })` match,
     * `"resolver"` for the per-type render function. The two cases
     * historically differed in how they treated `null` /
     * `undefined` returns (widget falls through; resolver
     * short-circuits with `null` so empty-array suppressions render
     * nothing), and adapters can preserve that asymmetry by
     * branching on `step`.
     *
     * Each adapter applies its own validity check here — React
     * narrows via `isValidElement`/string/number, HTML treats every
     * string as valid, etc. Returning `undefined` makes the
     * dispatcher behave as if no renderer produced output.
     */
    coerceResult: (
        result: unknown,
        step: "widget" | "resolver"
    ) => Output | undefined;
    /**
     * Optional widget-lookup hook. When present, the dispatcher
     * consults it before the resolver lookup. Called once per
     * dispatch with the value of `tree.meta.component`; should
     * return the registered render function or `undefined` if no
     * widget matches. The returned function's output type matches
     * the resolver lookup (`unknown`) — see
     * {@link DispatchConfig.lookupRenderFn}.
     */
    lookupWidget?: (name: string) => RenderFunction<unknown, Props> | undefined;
    /**
     * Wrap a render-time error in a {@link SchemaRenderError} (or a
     * caller-specified subclass) so every adapter routes thrown
     * errors through the same structured path. Called only for
     * errors thrown by the resolver render function — widget errors
     * propagate without wrapping, matching the historic React
     * behaviour where widgets are user code at the application
     * boundary.
     */
    wrapRenderError?: (err: unknown, tree: WalkedField, path: string) => Error;
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

/**
 * Arguments accepted by {@link dispatchRenderField}.
 *
 * @typeParam Props - The per-field props shape.
 * @typeParam Output - The adapter's per-field output type.
 * @typeParam Resolver - The resolver shape mapping schema types to
 *   render functions.
 */
export interface DispatchArgs<Props, Output, Resolver> {
    /** The walked field to render. */
    tree: WalkedField;
    /** The data value at this position in the tree. */
    value: unknown;
    /** Dot-separated path from the schema root. */
    path: string;
    /** Recursion depth — incremented by callers as they descend. */
    depth: number;
    /** The merged resolver to look up the per-type render function on. */
    resolver: Resolver;
    /** The dispatch configuration for the active adapter. */
    config: DispatchConfig<Props, Output, Resolver>;
}

/**
 * Framework-agnostic dispatch loop shared by the React, HTML, and
 * future adapters. See the module-level documentation for the fixed
 * dispatch order.
 *
 * The dispatcher itself is intentionally side-effect free — it never
 * imports React, never builds HTML strings, and never reads any global
 * state. Adapter-specific work (widget registry lookup, recursion
 * sentinel construction, result coercion, error wrapping) is supplied
 * via the {@link DispatchConfig} argument.
 *
 * @typeParam Props - The per-field props shape.
 * @typeParam Output - The adapter's per-field output type.
 * @typeParam Resolver - The resolver shape.
 * @returns The output produced by the matched widget, render function,
 *   or fallback — exactly one of the four dispatch steps always emits
 *   a value.
 */
export function dispatchRenderField<Props, Output, Resolver>(
    args: DispatchArgs<Props, Output, Resolver>
): Output {
    const { tree, value, path, depth, resolver, config } = args;

    // Step 1 — depth cap. Cyclic walked-field graphs (z.lazy, mutually
    // recursive $ref) would otherwise overflow the stack.
    if (depth >= MAX_RENDER_DEPTH) {
        return config.recursionSentinel(tree);
    }

    // Step 2 — widget override. Resolution order (instance → context →
    // global) lives in the adapter's `lookupWidget` so the dispatcher
    // remains agnostic to how widget maps are scoped.
    const componentHint = tree.meta.component;
    if (
        config.lookupWidget !== undefined &&
        typeof componentHint === "string"
    ) {
        const widget = config.lookupWidget(componentHint);
        if (widget !== undefined) {
            const props = config.buildProps(tree, path);
            const rawResult: unknown = widget(props);
            const coerced = config.coerceResult(rawResult, "widget");
            if (coerced !== undefined) return coerced;
        }
    }

    // Step 3 — resolver render function. Errors are routed through the
    // adapter's `wrapRenderError` so every adapter surfaces failures as
    // a {@link SchemaRenderError} (or subclass) rather than the raw
    // user-supplied throw.
    const renderFn = config.lookupRenderFn(tree.type, resolver);
    if (renderFn !== undefined) {
        let rawResult: unknown;
        try {
            rawResult = renderFn(config.buildProps(tree, path));
        } catch (err: unknown) {
            if (config.wrapRenderError !== undefined) {
                throw config.wrapRenderError(err, tree, path);
            }
            throw new SchemaRenderError(
                err instanceof Error
                    ? err.message
                    : `Render function threw for type "${tree.type}"`,
                tree,
                tree.type,
                err
            );
        }
        const coerced = config.coerceResult(rawResult, "resolver");
        if (coerced !== undefined) return coerced;
    }

    // Step 4 — fallback for unhandled types. Adapters decide whether to
    // emit a placeholder (React) or throw (strict HTML).
    return config.fallback(tree, value, path);
}
