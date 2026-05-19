/**
 * Component resolver interfaces — shared between React, HTML, and
 * future framework adapters (Vue, Solid, Svelte, Preact, Lit).
 *
 * `BaseFieldProps` defines the data properties every render function
 * receives, regardless of output format. `BaseRenderProps<Output>` adds a
 * framework-agnostic `renderChild` returning `Output`. Per-framework
 * variants (`RenderProps` for React, `HtmlRenderProps` for HTML) extend
 * `BaseRenderProps` with the framework-specific bits — `onChange` for
 * editable React, the narrower three-argument `renderChild` for HTML —
 * so a new adapter can layer its own props on top of the same base.
 *
 * Per-type schema data (enum values, object fields, array element
 * schema, union options, etc.) is read directly from the discriminated
 * `tree` — renderers narrow on `tree.type` and access the matching
 * variant.
 */

import type {
    StringConstraints,
    NumberConstraints,
    ArrayConstraints,
    ObjectConstraints,
    FileConstraints,
    SchemaMeta,
    WalkedField,
} from "./types.ts";

/**
 * Flat intersection of all constraint types.
 * Used in renderer props where the render function receives the union
 * but knows (by resolver key) which subset applies.
 *
 * The walker's discriminated WalkedField enforces type-correct constraints
 * at construction time; the renderer consumes them as this flat type.
 */
export type AllConstraints = StringConstraints &
    NumberConstraints &
    ArrayConstraints &
    ObjectConstraints &
    FileConstraints;

// ---------------------------------------------------------------------------
// Base field props — shared by all renderers
// ---------------------------------------------------------------------------

/**
 * Properties available on every schema field, regardless of rendering target.
 * Both React and HTML renderers receive these.
 *
 * Per-type schema data — enum values, object fields, array element schema,
 * union options, record key/value types, tuple `prefixItems`, conditional
 * if/then/else clauses, negation `negated`, recursive `refTarget`, literal
 * values — lives on the discriminated `tree`. Renderers narrow on
 * `tree.type` and read from the matching variant; there are no duplicate
 * sibling fields on these props.
 */
export interface BaseFieldProps {
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
}

// ---------------------------------------------------------------------------
// Generic render props — shared between React, HTML, and future adapters
// ---------------------------------------------------------------------------

/**
 * Framework-agnostic base for the props passed to every render
 * function. Extends {@link BaseFieldProps} with a `renderChild`
 * callable whose return type is parameterised over `Output` — the type
 * the framework adapter emits per field (typically `unknown` /
 * `ReactNode` for React, `string` for HTML, framework-specific for
 * future Vue / Solid / Svelte / Lit adapters).
 *
 * The base `renderChild` is declared with a `...args: never[]` rest
 * parameter so derived adapter interfaces can override it with a
 * richer signature carrying extra required arguments (React's
 * `onChange`, HTML's `pathSuffix`, etc.). The `never[]` rest makes the
 * base callable signature the bottom of the function-subtype lattice:
 * every adapter's concrete `renderChild` is assignable to it because
 * `never` accepts any parameter type contravariantly. The base
 * therefore documents the shared shape — "given a `WalkedField` and a
 * value, produce an `Output`" — without preventing adapters from
 * adding required parameters.
 *
 * @typeParam Output - The type the framework adapter emits per field
 *   (e.g. `ReactNode` / `unknown` for React, `string` for HTML).
 */
export interface BaseRenderProps<Output = unknown> extends BaseFieldProps {
    /**
     * Render a child field. Theme adapters call this to recursively
     * render nested structures (object fields, array elements, union
     * options). Each adapter narrows the signature in its specialised
     * variant ({@link RenderProps}, {@link HtmlRenderProps}, …) to
     * match its native rendering primitives.
     */
    renderChild: (...args: never[]) => Output;
}

// ---------------------------------------------------------------------------
// React render props
// ---------------------------------------------------------------------------

/**
 * Props for React render functions. Extends {@link BaseRenderProps} with:
 * - `onChange` — callback to propagate value changes back to state
 * - `renderChild` — recursively renders a child field, threading
 *   `onChange` through the four-argument React signature
 */
export interface RenderProps extends BaseRenderProps {
    /** Callback to update the field value. */
    onChange: (value: unknown) => void;
    /**
     * Render a child field. Theme adapters call this to recursively render
     * nested structures (object fields, array elements, union options).
     * The resolver and rendering context are already wired in.
     *
     * @param tree - The walked field tree for the child
     * @param value - The child's current value
     * @param onChange - Callback receiving the child's next value
     * @param pathSuffix - Path segment from the parent (e.g. "city",
     *   "[0]"). Joined to the parent's path with a dot, or substituted
     *   when the parent acts as a transparent wrapper (union options).
     *   Required for every container — without it children inherit no
     *   path and `inputId()` will throw.
     */
    renderChild: (
        tree: WalkedField,
        value: unknown,
        onChange: (v: unknown) => void,
        pathSuffix?: string
    ) => unknown;
}

// ---------------------------------------------------------------------------
// HTML render props
// ---------------------------------------------------------------------------

/**
 * Props for HTML render functions. Extends {@link BaseRenderProps} with
 * a narrower three-argument `renderChild` and no `onChange` — HTML
 * rendering is pure output with no event handling.
 */
export interface HtmlRenderProps extends BaseRenderProps<string> {
    /**
     * Render a child field to an HTML string. Theme adapters call this
     * to recursively render nested structures.
     *
     * @param tree - The walked field tree for the child
     * @param value - The child's current value
     * @param pathSuffix - Path segment from the parent (e.g. "city",
     *   "[0]"). When omitted, the child's description is used as fallback.
     */
    renderChild: (
        tree: WalkedField,
        value: unknown,
        pathSuffix?: string
    ) => string;
}

// ---------------------------------------------------------------------------
// Render-props builder — shared between SchemaView and SchemaComponent
// ---------------------------------------------------------------------------

/** No-op onChange used when callers render in read-only mode. */
function noopOnChange(): void {
    /* intentional no-op */
}

/**
 * Build the `RenderProps` object handed to a resolver render function or a
 * widget. Used by both the server-side `<SchemaView>` (which has no
 * `onChange`) and the client-side `<SchemaComponent>` (which threads an
 * `onChange` callback).
 *
 * When `onChange` is `undefined` the caller is rendering in read-only mode:
 * a noop `onChange` is wired up, `readOnly` is forced to `true`, and
 * `writeOnly` is forced to `false`. Otherwise the editability is taken
 * from `tree.editability`.
 */
export function buildRenderProps(
    tree: WalkedField,
    value: unknown,
    onChange: ((next: unknown) => void) | undefined,
    renderChild: RenderProps["renderChild"],
    path: string
): RenderProps {
    const isReadOnly =
        onChange === undefined || tree.editability === "presentation";
    const isWriteOnly = onChange !== undefined && tree.editability === "input";

    const props: RenderProps = {
        value,
        onChange: onChange ?? noopOnChange,
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

// ---------------------------------------------------------------------------
// ComponentResolver — the React theme adapter interface
// ---------------------------------------------------------------------------

/**
 * Generic render-function signature parameterised over the output type
 * (`Output`) and the per-framework props shape (`Props`).
 *
 * The React adapter uses {@link RenderProps} with `unknown` output — see
 * the default specialisation below — and the HTML adapter uses
 * {@link HtmlRenderFunction} (an alias for
 * `RenderFunction\<string, HtmlRenderProps\>`). Future framework
 * adapters (Vue, Solid, Svelte, Lit) pick their own pairing.
 *
 * The default `Output = unknown, Props = RenderProps` keeps the historic
 * React-flavoured signature compatible — any caller writing
 * `RenderFunction` without type arguments gets exactly the previous
 * `(props: RenderProps) =\> unknown` shape.
 */
export type RenderFunction<Output = unknown, Props = RenderProps> = (
    props: Props
) => Output;

/**
 * Widget map — maps component hints (from `.meta({ component })`) to render
 * functions. A per-render bag consumed by every renderer surface that
 * dispatches widget overrides; conceptually parallel to
 * {@link ComponentResolver} but keyed by user-supplied hint names rather
 * than schema types.
 *
 * Scoped at three levels in the React renderer:
 *
 * 1. **Per-instance** — `widgets` prop on `<SchemaComponent>`
 * 2. **Context-scoped** — `widgets` prop on `<SchemaProvider>`
 * 3. **Global** — `registerWidget()` (app-wide defaults)
 *
 * Resolution order: instance → context → global → resolver → headless.
 */
export type WidgetMap = ReadonlyMap<string, RenderFunction>;

/**
 * Theme adapter — maps every schema field type to its React renderer.
 * Unset keys fall back to the headless resolver. Pass to
 * `SchemaProvider` (or `SchemaView.resolver`) to drive every
 * schema-driven render with a specific theme.
 */
export interface ComponentResolver {
    string?: RenderFunction;
    number?: RenderFunction;
    boolean?: RenderFunction;
    null?: RenderFunction;
    enum?: RenderFunction;
    object?: RenderFunction;
    array?: RenderFunction;
    tuple?: RenderFunction;
    record?: RenderFunction;
    union?: RenderFunction;
    discriminatedUnion?: RenderFunction;
    conditional?: RenderFunction;
    negation?: RenderFunction;
    literal?: RenderFunction;
    file?: RenderFunction;
    never?: RenderFunction;
    unknown?: RenderFunction;
}

// ---------------------------------------------------------------------------
// HtmlResolver — the HTML theme adapter interface
// ---------------------------------------------------------------------------

/**
 * An HTML render function returns a string. Specialisation of the
 * generic {@link RenderFunction} signature with `Output = string` and
 * `Props = HtmlRenderProps`.
 */
export type HtmlRenderFunction = RenderFunction<string, HtmlRenderProps>;

/**
 * HTML resolver — maps schema types to HTML string renderers.
 * Structurally mirrors ComponentResolver but produces strings.
 */
export interface HtmlResolver {
    string?: HtmlRenderFunction;
    number?: HtmlRenderFunction;
    boolean?: HtmlRenderFunction;
    null?: HtmlRenderFunction;
    enum?: HtmlRenderFunction;
    object?: HtmlRenderFunction;
    array?: HtmlRenderFunction;
    tuple?: HtmlRenderFunction;
    record?: HtmlRenderFunction;
    union?: HtmlRenderFunction;
    discriminatedUnion?: HtmlRenderFunction;
    conditional?: HtmlRenderFunction;
    negation?: HtmlRenderFunction;
    literal?: HtmlRenderFunction;
    file?: HtmlRenderFunction;
    never?: HtmlRenderFunction;
    unknown?: HtmlRenderFunction;
}

// ---------------------------------------------------------------------------
// Resolver lookup
// ---------------------------------------------------------------------------

/**
 * Canonical list of resolver keys, one per {@link WalkedField} variant.
 * Iterated by the resolver merge helpers so adding a new key here is the
 * single point of change when a new field variant is introduced.
 */
export const RESOLVER_KEYS = [
    "string",
    "number",
    "boolean",
    "null",
    "enum",
    "object",
    "array",
    "tuple",
    "record",
    "union",
    "discriminatedUnion",
    "conditional",
    "negation",
    "literal",
    "file",
    "never",
    "unknown",
] as const;

type ResolverKey = (typeof RESOLVER_KEYS)[number];

/**
 * Map a schema type to the resolver key that handles it.
 * Every WalkedField variant has a direct resolver key — exhaustive switch
 * ensures new variants surface as a type error rather than silently
 * falling through to "unknown".
 */
export function typeToKey(type: WalkedField["type"]): ResolverKey {
    switch (type) {
        case "string":
        case "number":
        case "boolean":
        case "null":
        case "enum":
        case "object":
        case "array":
        case "tuple":
        case "record":
        case "union":
        case "discriminatedUnion":
        case "conditional":
        case "negation":
        case "literal":
        case "file":
        case "never":
        case "unknown":
            return type;
    }
}

/**
 * Look up the render function for a schema type in a ComponentResolver.
 */
export function getRenderFunction(
    type: WalkedField["type"],
    resolver: ComponentResolver
): RenderFunction | undefined {
    return resolver[typeToKey(type)];
}

/**
 * Look up the render function for a schema type in an HtmlResolver.
 */
export function getHtmlRenderFn(
    type: WalkedField["type"],
    resolver: HtmlResolver
): HtmlRenderFunction | undefined {
    return resolver[typeToKey(type)];
}

// ---------------------------------------------------------------------------
// Resolver merge — user values take priority, fallback fills gaps
// ---------------------------------------------------------------------------

/**
 * Merge two ComponentResolvers — user values take priority, fallback fills gaps.
 */
export function mergeResolvers(
    user: ComponentResolver,
    fallback: ComponentResolver
): ComponentResolver {
    const merged: ComponentResolver = {};
    for (const key of RESOLVER_KEYS) {
        const fn = user[key] ?? fallback[key];
        if (fn !== undefined) {
            merged[key] = fn;
        }
    }
    return merged;
}

/**
 * Merge two HtmlResolvers — user values take priority, fallback fills gaps.
 */
export function mergeHtmlResolvers(
    user: HtmlResolver,
    fallback: HtmlResolver
): HtmlResolver {
    const merged: HtmlResolver = {};
    for (const key of RESOLVER_KEYS) {
        const fn = user[key] ?? fallback[key];
        if (fn !== undefined) {
            merged[key] = fn;
        }
    }
    return merged;
}
