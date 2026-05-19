/**
 * Solid-flavoured renderer types.
 *
 * Mirrors the React adapter's `RenderProps` / `RenderFunction` /
 * `ComponentResolver` triple, but specialised for Solid:
 *
 * - The renderer's output type is `JSX.Element` from `solid-js`.
 * - There is no synthetic event system in Solid — `onChange` receives the
 *   next value directly, exactly as on React.
 * - There are no per-render hooks; renderers consume their props through
 *   ordinary destructuring or `props.x` access.
 *
 * Per-type schema data lives on the discriminated `tree` (mirroring
 * core/renderer.ts) — renderers narrow on `tree.type` and read from the
 * matching variant.
 */

import type { JSX } from "solid-js";
import type {
    AllConstraints,
    BaseFieldProps,
    RenderFunction,
} from "../core/renderer.ts";
import type { WalkedField } from "../core/types.ts";

// `AllConstraints` is re-exported through the renderer surface so the
// Solid layer doesn't need a parallel definition; importing it explicitly
// here is documentation only.
export type { AllConstraints };

/**
 * Per-field props handed to a Solid render function.
 *
 * Mirrors React's `RenderProps` shape (the contract is identical at the
 * data layer) but the `renderChild` return type is Solid's `JSX.Element`
 * rather than React's `ReactNode`. The walker, path threading,
 * constraint extraction, and union heuristics are all shared with the
 * React adapter.
 */
export interface SolidRenderProps extends BaseFieldProps {
    /** Callback to update the field value. */
    onChange: (value: unknown) => void;
    /**
     * Render a child field. Theme adapters call this to recursively
     * render nested structures (object fields, array elements, union
     * options). The Solid resolver and rendering context are already
     * wired in.
     *
     * @param tree - The walked field tree for the child.
     * @param value - The child's current value.
     * @param onChange - Callback receiving the child's next value.
     * @param pathSuffix - Path segment from the parent (e.g. `"city"`,
     *   `"[0]"`). Joined to the parent's path with a dot, or
     *   substituted when the parent acts as a transparent wrapper
     *   (union options). Required for every container — without it
     *   children inherit no path and `fieldDomId()` returns the bare
     *   prefix.
     */
    renderChild: (
        tree: WalkedField,
        value: unknown,
        onChange: (v: unknown) => void,
        pathSuffix?: string
    ) => JSX.Element;
}

/**
 * Signature for a Solid render function attached to a
 * {@link SolidComponentResolver}. Specialises the generic
 * {@link RenderFunction} from `core/renderer.ts` with Solid's `JSX.Element`
 * output and the Solid-flavoured {@link SolidRenderProps} props.
 *
 * The compile-time relationship
 *
 * ```ts
 * type Check = SolidRenderFunction extends RenderFunction<JSX.Element, SolidRenderProps>
 *     ? true
 *     : false; // → true
 * ```
 *
 * holds by construction — the Solid renderer plugs into the generic
 * core contract without any per-framework escape hatch.
 */
export type SolidRenderFunction = RenderFunction<JSX.Element, SolidRenderProps>;

/**
 * Theme adapter — maps every schema field type to its Solid renderer.
 * Unset keys fall back to the headless resolver (see
 * `solid/headless.ts`). Pass to `<SchemaProvider resolver={...}>` to
 * drive every schema-driven render with a specific theme.
 *
 * Structurally mirrors React's `ComponentResolver` from
 * `core/renderer.ts` — Solid and React share the renderer key matrix
 * because both consume the same `WalkedField` discriminated union.
 */
export interface SolidComponentResolver {
    string?: SolidRenderFunction;
    number?: SolidRenderFunction;
    boolean?: SolidRenderFunction;
    null?: SolidRenderFunction;
    enum?: SolidRenderFunction;
    object?: SolidRenderFunction;
    array?: SolidRenderFunction;
    tuple?: SolidRenderFunction;
    record?: SolidRenderFunction;
    union?: SolidRenderFunction;
    discriminatedUnion?: SolidRenderFunction;
    conditional?: SolidRenderFunction;
    negation?: SolidRenderFunction;
    literal?: SolidRenderFunction;
    file?: SolidRenderFunction;
    never?: SolidRenderFunction;
    unknown?: SolidRenderFunction;
}

/**
 * Widget map for Solid — maps `.meta({ component: <name> })` hints to
 * per-instance render functions. Identical contract to the React widget
 * map; only the per-frame element type differs.
 */
export type SolidWidgetMap = ReadonlyMap<string, SolidRenderFunction>;
