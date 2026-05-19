/**
 * Vue-flavoured render-prop and resolver shapes.
 *
 * Mirrors the React adapter's `RenderProps` / `RenderFunction` /
 * `ComponentResolver` trio, parameterised over Vue's {@link VNode}
 * output type. Built on top of the framework-agnostic generic
 * `BaseRenderProps` and `RenderFunction` from `core/renderer.ts` so the
 * Vue adapter shares a single source of truth for the per-field props
 * shape with React, HTML, and any future framework adapter.
 *
 * The `onChange` callback semantics are deliberately kept identical to
 * the React adapter — see the design note in `vue/SchemaComponent.vue`.
 * Vue authors who prefer `v-model` / emit-based wiring use the
 * top-level `<SchemaComponent>` and `<SchemaView>` SFCs (which translate
 * the Vue-idiomatic surface back to the imperative `onChange`); the
 * inner render functions consume the imperative shape directly so the
 * dispatcher contract is uniform across adapters.
 */

import type { VNode } from "vue";
import type { BaseRenderProps, RenderFunction } from "../core/renderer.ts";
import type { WalkedField } from "../core/types.ts";

// ---------------------------------------------------------------------------
// VueRenderProps — per-field props passed to every Vue render function
// ---------------------------------------------------------------------------

/**
 * Props for Vue render functions. Extends {@link BaseRenderProps} with:
 *
 * - `onChange` — imperative callback to propagate value changes back to
 *   the host component. The top-level `<SchemaComponent>` SFC bridges
 *   this to a `change` emit / `v-model` update, so consumers writing
 *   pure render functions still operate against the same imperative
 *   contract as the React adapter.
 * - `renderChild` — recursively renders a child field, threading
 *   `onChange` through the four-argument signature inherited from
 *   `RenderProps` so theme adapters (or future widget code) can share
 *   helpers between React and Vue with minimal adaptation.
 */
export interface VueRenderProps extends BaseRenderProps<VNode> {
    /**
     * Callback to update the field value. Wired to the Vue
     * `@change` / `v-model` surface by the `<SchemaComponent>` SFC.
     */
    onChange: (value: unknown) => void;
    /**
     * Render a child field. Theme adapters call this to recursively
     * render nested structures (object fields, array elements, union
     * options).
     *
     * @param tree - The walked field tree for the child.
     * @param value - The child's current value.
     * @param onChange - Callback receiving the child's next value.
     * @param pathSuffix - Path segment from the parent (e.g. `"city"`,
     *   `"[0]"`). Joined to the parent's path with a dot, or
     *   substituted when the parent acts as a transparent wrapper
     *   (union options). Required for every container — without it
     *   children inherit no path and `fieldDomId()` will throw.
     */
    renderChild: (
        tree: WalkedField,
        value: unknown,
        onChange: (v: unknown) => void,
        pathSuffix?: string
    ) => VNode;
}

// ---------------------------------------------------------------------------
// VueRenderFunction — render function signature
// ---------------------------------------------------------------------------

/**
 * Signature for a Vue render function. Specialisation of the generic
 * {@link RenderFunction} with `Output = VNode` and
 * `Props = VueRenderProps`.
 *
 * Composes cleanly with the generic dispatch in `core/renderField.ts`:
 *
 * ```ts
 * const r: VueRenderFunction = (props) => h("input", { value: props.value });
 * const generic: RenderFunction<VNode, VueRenderProps> = r;  // assignable
 * ```
 */
export type VueRenderFunction = RenderFunction<VNode, VueRenderProps>;

// ---------------------------------------------------------------------------
// VueComponentResolver — theme adapter interface for Vue
// ---------------------------------------------------------------------------

/**
 * Vue theme adapter — maps every schema field type to its Vue
 * {@link VueRenderFunction}. Structurally mirrors the React
 * `ComponentResolver` but produces `VNode`s.
 *
 * Unset keys fall back to the headless resolver. Pass to the
 * `<SchemaProvider>` SFC or directly to a `<SchemaComponent>`'s
 * `resolver` prop to drive every schema-driven render with a specific
 * theme.
 */
export interface VueComponentResolver {
    string?: VueRenderFunction;
    number?: VueRenderFunction;
    boolean?: VueRenderFunction;
    null?: VueRenderFunction;
    enum?: VueRenderFunction;
    object?: VueRenderFunction;
    array?: VueRenderFunction;
    tuple?: VueRenderFunction;
    record?: VueRenderFunction;
    union?: VueRenderFunction;
    discriminatedUnion?: VueRenderFunction;
    conditional?: VueRenderFunction;
    negation?: VueRenderFunction;
    literal?: VueRenderFunction;
    file?: VueRenderFunction;
    never?: VueRenderFunction;
    unknown?: VueRenderFunction;
}

// ---------------------------------------------------------------------------
// VueWidgetMap — scoped widget registry
// ---------------------------------------------------------------------------

/**
 * Widget map — maps component hints (from `.meta({ component })`) to
 * {@link VueRenderFunction}s. Parallels the React `WidgetMap` but
 * produces `VNode`s.
 *
 * Scoped at three levels:
 *
 * 1. **Per-instance** — `widgets` prop on `<SchemaComponent>`
 * 2. **Context-scoped** — provided via {@link VueWidgetsContext}
 * 3. **Global** — `registerWidget()` (app-wide defaults)
 *
 * Resolution order: instance → context → global → resolver → headless,
 * mirroring the React resolution chain so dual-target consumers see
 * identical fallback behaviour.
 */
export type VueWidgetMap = ReadonlyMap<string, VueRenderFunction>;
