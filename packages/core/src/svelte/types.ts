/**
 * Svelte 5 adapter type surface for schema-components.
 *
 * Mirrors the shape of `core/renderer.ts`'s React-flavoured
 * {@link "../core/renderer.ts".RenderProps} but adapts it for Svelte's
 * compile-time component model: renderers are not plain functions
 * returning VNodes — they are component constructors. The dispatcher
 * therefore packages each "render this field" call as a
 * {@link SvelteRenderDescriptor} pairing the component with the props
 * it should be instantiated against; downstream the active container
 * component (e.g. `Object.svelte`) materialises the descriptor via
 * `<svelte:component this={component} {...props} />`.
 *
 * The shapes intentionally diverge from the React adapter on two axes:
 *
 *   1. `renderChild` returns a {@link SvelteRenderDescriptor} rather
 *      than a `ReactNode`. Svelte cannot directly embed an object
 *      synthesised at render time the way React embeds a JSX node — but
 *      it can `<svelte:component>` a `{ component, props }` pair.
 *   2. There is no synthetic event system, so `onChange` is plumbed
 *      directly into the per-field props and invoked from raw DOM
 *      handlers (`onchange`, `oninput`) inside each `.svelte` file.
 *
 * The public consumer pattern is `<SchemaComponent schema value onChange?\>` —
 * Svelte's `bind:value` ergonomics are deliberately not forced.
 * The function-style `onChange` callback was chosen so the
 * adapter behaves identically across server-rendered (`SchemaView`),
 * controlled-input, and uncontrolled-input call sites; consumers that
 * prefer `bind:value` can wire it externally:
 *
 * ```svelte
 * <SchemaComponent {schema} bind:value />
 * ```
 *
 * which Svelte transparently translates into an `onChange` that mutates
 * the bound rune-backed reference.
 *
 * @group Framework Adapters
 */

import type { Component } from "svelte";
import type {
    BaseFieldProps,
    BaseRenderProps,
    RenderFunction,
} from "../core/renderer.ts";
import type { WalkedField } from "../core/types.ts";

/**
 * Descriptor produced by {@link SvelteRenderProps.renderChild} and by
 * the dispatcher when materialising a single field. Pairs the Svelte
 * component constructor with the props it should be instantiated
 * against so a parent renderer can mount it via
 * `<svelte:component this={component} {...props} />`.
 *
 * Returning a descriptor (rather than a rendered DOM node) keeps the
 * adapter compatible with Svelte's compile-time component model — the
 * dispatcher does not own a DOM mount point and cannot fabricate
 * rendered output the way React's `renderField` returns a `ReactNode`.
 *
 * `null` indicates "render nothing" — used for empty arrays in
 * read-only mode and for the recursion-cap sentinel placeholder when
 * the caller opts to suppress it.
 */
export interface SvelteRenderDescriptor {
    /** Svelte component constructor to mount. */
    readonly component: SvelteComponentConstructor;
    /** Props to pass to the component instance. */
    readonly props: SvelteRenderProps;
}

/**
 * The raw Svelte 5 component constructor type. Aliased so consumers
 * have a single name to import — `Component<SvelteRenderProps>` is
 * exact, but reading {@link SvelteComponentConstructor} at call sites
 * keeps the framework dependency localised to this module.
 */
export type SvelteComponentConstructor = Component<SvelteRenderProps>;

/**
 * Props passed to every Svelte 5 renderer component.
 *
 * Specialisation of {@link BaseRenderProps} with
 * `Output = SvelteRenderDescriptor | null`. Each renderer receives
 * these as `$props()` — the per-field data, the editability flags,
 * the constraint bundle, and the `renderChild` factory it should
 * invoke for nested structures (object fields, array elements, union
 * options, …).
 *
 * Mirrors the React {@link "../core/renderer.ts".RenderProps} shape
 * — `onChange` for value propagation, four-argument `renderChild`
 * for recursive descent.
 */
export interface SvelteRenderProps extends BaseRenderProps<SvelteRenderDescriptor | null> {
    /** Callback to update the field value. */
    onChange: (value: unknown) => void;
    /**
     * Render a child field. Container renderers (object, array,
     * tuple, record, union, discriminated union, conditional,
     * negation) call this and mount the returned descriptor via
     * `<svelte:component this={component} {...props} />`.
     *
     * @param tree - The walked field tree for the child.
     * @param value - The child's current value.
     * @param onChange - Callback receiving the child's next value.
     * @param pathSuffix - Path segment from the parent (e.g. "city",
     *   "[0]"). Joined to the parent's path with a dot, or
     *   substituted when the parent acts as a transparent wrapper
     *   (union options). Required for every container — without it
     *   children inherit no path and `fieldDomId()` will throw.
     */
    renderChild: (
        tree: WalkedField,
        value: unknown,
        onChange: (v: unknown) => void,
        pathSuffix?: string
    ) => SvelteRenderDescriptor | null;
}

/**
 * Signature for a render function attached to a
 * {@link SvelteComponentResolver}.
 *
 * Unlike React — where `RenderFunction` directly produces a
 * `ReactNode` — the Svelte equivalent produces a
 * {@link SvelteRenderDescriptor}. The descriptor pairs a component
 * constructor with the per-field props and is mounted by the parent
 * renderer via `<svelte:component>`. This indirection is the price
 * of Svelte's compile-time component model: the dispatcher cannot
 * fabricate rendered DOM at runtime, so it returns a recipe for the
 * parent to mount.
 *
 * Specialisation of the generic
 * {@link "../core/renderer.ts".RenderFunction | RenderFunction} from
 * `core/renderer.ts` with
 * `Output = SvelteRenderDescriptor | null` and
 * `Props = SvelteRenderProps`.
 */
export type SvelteRenderFunction = RenderFunction<
    SvelteRenderDescriptor | null,
    SvelteRenderProps
>;

/**
 * Helper: wrap a Svelte component constructor into the
 * "render function" shape consumed by the dispatcher. Pairs the
 * supplied component with the per-field props.
 *
 * Used by {@link "./headless.ts".headlessSvelteResolver} to register
 * one constructor per schema type, and exposed publicly so theme
 * adapter authors can compose their own resolver from `.svelte`
 * files without re-implementing the wrapper.
 *
 * @param component - A Svelte 5 component constructor accepting
 *   {@link SvelteRenderProps}.
 * @returns A {@link SvelteRenderFunction} that, given props, returns
 *   the descriptor `{ component, props }`.
 */
export function makeSvelteRenderer(
    component: SvelteComponentConstructor
): SvelteRenderFunction {
    return (props) => ({ component, props });
}

/**
 * Theme adapter — maps every schema field type to a Svelte
 * {@link SvelteRenderFunction}. Unset keys fall back to the headless
 * resolver.
 *
 * Pass to {@link "./contexts.ts".resolverContext} (via the
 * `SchemaProvider` Svelte component) so a single theme drives every
 * schema render in a subtree.
 *
 * Structurally parallel to
 * {@link "../core/renderer.ts".ComponentResolver} for React, but
 * each value is a {@link SvelteRenderFunction} returning a
 * {@link SvelteRenderDescriptor} rather than a render function
 * returning a `ReactNode`.
 */
export interface SvelteComponentResolver {
    string?: SvelteRenderFunction;
    number?: SvelteRenderFunction;
    boolean?: SvelteRenderFunction;
    null?: SvelteRenderFunction;
    enum?: SvelteRenderFunction;
    object?: SvelteRenderFunction;
    array?: SvelteRenderFunction;
    tuple?: SvelteRenderFunction;
    record?: SvelteRenderFunction;
    union?: SvelteRenderFunction;
    discriminatedUnion?: SvelteRenderFunction;
    conditional?: SvelteRenderFunction;
    negation?: SvelteRenderFunction;
    literal?: SvelteRenderFunction;
    file?: SvelteRenderFunction;
    never?: SvelteRenderFunction;
    unknown?: SvelteRenderFunction;
}

/**
 * Widget map — maps component hints (from `.meta({ component })`) to
 * Svelte {@link SvelteRenderFunction}s. Mirrors the React
 * {@link "../core/renderer.ts".WidgetMap} but each value is a
 * Svelte-flavoured render function (typically produced via
 * {@link makeSvelteRenderer}).
 *
 * Scoped at three levels in the Svelte adapter:
 *
 *   1. **Per-instance** — `widgets` prop on `<SchemaComponent>`
 *   2. **Context-scoped** — `widgets` prop on `<SchemaProvider>`
 *   3. **Global** — `registerWidget()` (app-wide defaults)
 */
export type SvelteWidgetMap = ReadonlyMap<string, SvelteRenderFunction>;

/**
 * Compile-time assertion that {@link SvelteRenderFunction} is a
 * specialisation of the generic {@link RenderFunction} contract from
 * `core/renderer.ts`. Exercised by the type-level test in
 * `tests/svelte/typeTest.svelte.unit.test.ts` — a regression on the
 * alignment fails compilation rather than silently producing
 * incompatible adapters.
 *
 * @internal
 */
export type __SvelteRenderFunctionMatchesGenericRenderFunction =
    SvelteRenderFunction extends RenderFunction<
        SvelteRenderDescriptor | null,
        SvelteRenderProps
    >
        ? true
        : false;

/**
 * Re-export of {@link BaseFieldProps} so consumers writing custom
 * Svelte renderers can import a single type covering the schema-data
 * shape without crossing the framework adapter boundary.
 */
export type { BaseFieldProps };
