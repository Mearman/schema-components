/**
 * Lit / Web Components adapter — render-function and resolver contracts.
 *
 * Mirrors the shape of `ComponentResolver` (React) and `HtmlResolver`
 * (HTML-string) defined in `core/renderer.ts`, but specialised over Lit's
 * `TemplateResult`. The contract is intentionally parallel so a new schema
 * field variant added to the walker surfaces in every renderer surface
 * (React, HTML, Lit) as a missing-key compile error in the matching
 * resolver type.
 *
 * @packageDocumentation
 */

import type { TemplateResult } from "lit";
import type { AllConstraints } from "../core/renderer.ts";
import type { SchemaMeta, WalkedField } from "../core/types.ts";

// ---------------------------------------------------------------------------
// Render props
// ---------------------------------------------------------------------------

/**
 * Props handed to a Lit render function.
 *
 * Shares the same per-field data as `RenderProps` (React) and
 * `HtmlRenderProps` (HTML-string) but with a `renderChild` typed
 * over Lit's {@link TemplateResult}. Editable fields receive a
 * `change` callback that emits a Custom Event up the DOM tree —
 * unlike React's prop-callback model, Custom Elements communicate via
 * DOM events, so the renderer wires the input event to a
 * `dispatchEvent(new CustomEvent("sc-change", { detail: { value } }))`
 * on the host element.
 *
 * Renderers narrow on `tree.type` for per-variant data
 * (object fields, array element schema, union options, etc.) — the
 * walker's discriminated union enforces type-correct access.
 */
export interface LitRenderProps {
    /** Current field value. */
    value: unknown;
    /** Whether to render as read-only display. */
    readOnly: boolean;
    /** Whether to render as an empty input. */
    writeOnly: boolean;
    /** Schema metadata for this field. */
    meta: SchemaMeta;
    /** Constraints from schema checks. */
    constraints: AllConstraints;
    /** Dot-separated path from root (e.g. "address.city"). */
    path: string;
    /** Example values from the schema's `examples` keyword. */
    examples?: unknown[];
    /** Walked field tree for recursive rendering. */
    tree: WalkedField;
    /**
     * Callback to propagate the next value back to the host element.
     *
     * Renderers wire DOM events (`@input`, `@change`, `@click` on add /
     * remove controls) to this callback. The host element catches the
     * resulting change and emits a `change` Custom Event on itself so
     * framework consumers can observe via standard `addEventListener`.
     */
    change: (value: unknown) => void;
    /**
     * Render a child field. Resolver overrides call this to recursively
     * render nested structures (object fields, array elements, union
     * options) without re-running the resolver dispatch loop.
     *
     * @param tree - The walked field tree for the child
     * @param value - The child's current value
     * @param change - Callback receiving the child's next value
     * @param pathSuffix - Path segment from the parent (e.g. `city` for
     *   an object key, `[0]` for an array index). Required for every
     *   container — without it children inherit no path and DOM id
     *   derivation throws.
     */
    renderChild: (
        tree: WalkedField,
        value: unknown,
        change: (next: unknown) => void,
        pathSuffix?: string
    ) => TemplateResult;
}

// ---------------------------------------------------------------------------
// Render function
// ---------------------------------------------------------------------------

/**
 * Signature for a Lit render function attached to a
 * {@link LitComponentResolver}. Receives the per-field
 * {@link LitRenderProps} built by the walker and returns a Lit
 * {@link TemplateResult} for direct interpolation into the host
 * element's `render()` method.
 *
 * The return type is `TemplateResult`, the type produced by
 * the `html`-tagged template literal. Unlike `RenderFunction` (React)
 * which returns `unknown` so React elements, primitive children, and
 * arbitrary value types can flow through, Lit templates have a single
 * canonical type — narrowing makes the resolver dispatch loop simpler
 * and forces every renderer to return a structurally compatible value.
 */
export type LitRenderFunction = (props: LitRenderProps) => TemplateResult;

// ---------------------------------------------------------------------------
// Resolver
// ---------------------------------------------------------------------------

/**
 * Theme adapter — maps every schema field type to its Lit renderer.
 *
 * Structurally mirrors `ComponentResolver` (React) and `HtmlResolver`
 * (HTML-string) so the resolver-key tuple in `core/renderer.ts`
 * (`RESOLVER_KEYS`) drives every dispatch surface from a single
 * source-of-truth list.
 *
 * Unset keys fall through to the default Lit resolver
 * (`defaultLitResolver` in `lit/renderers/registry.ts`). The default
 * resolver is composed from the built-in `<sc-*>` Custom Elements
 * registered by {@link registerSchemaComponents} — overriding a key
 * here lets a consumer bypass the Custom Element registry for a
 * specific schema type without unregistering the element.
 */
export interface LitComponentResolver {
    string?: LitRenderFunction;
    number?: LitRenderFunction;
    boolean?: LitRenderFunction;
    null?: LitRenderFunction;
    enum?: LitRenderFunction;
    object?: LitRenderFunction;
    array?: LitRenderFunction;
    tuple?: LitRenderFunction;
    record?: LitRenderFunction;
    union?: LitRenderFunction;
    discriminatedUnion?: LitRenderFunction;
    conditional?: LitRenderFunction;
    negation?: LitRenderFunction;
    literal?: LitRenderFunction;
    file?: LitRenderFunction;
    never?: LitRenderFunction;
    unknown?: LitRenderFunction;
}

// ---------------------------------------------------------------------------
// Type test — Lit render function composes with the core RenderFunction
// shape, parameterised over output type.
// ---------------------------------------------------------------------------

/**
 * Compile-time witness that {@link LitRenderFunction} is a
 * `(props: P) => O` shape exactly matching the parallel signatures
 * carried by `core/renderer.ts`. The walker's dispatch loop is
 * parameterised over `O` (React's `unknown`, HTML's `string`, Lit's
 * `TemplateResult`) and `P` (the matching per-renderer props), so this
 * alias documents the contract without forcing `core/renderer.ts` to
 * import Lit.
 *
 * @internal
 */
export type _LitFunctionShapeAssertion = LitRenderFunction extends (
    props: LitRenderProps
) => TemplateResult
    ? true
    : false;
