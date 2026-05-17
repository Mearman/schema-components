/**
 * Component resolver interfaces — shared between React and HTML renderers.
 *
 * `BaseFieldProps` defines the 13 properties every render function receives,
 * regardless of output format. `RenderProps` and `HtmlRenderProps` extend it
 * with their respective `renderChild` signatures and (for React) `onChange`.
 *
 * This eliminates the duplication where `RenderProps` and `HtmlRenderProps`
 * previously declared the same 13 fields independently.
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
    /** For enums: the allowed values. */
    enumValues?: (string | number | boolean | null)[];
    /** For arrays: the element schema. */
    element?: WalkedField;
    /** For tuples: positional element schemas from prefixItems. */
    prefixItems?: WalkedField[];
    /** For conditionals: the if/then/else sub-schemas. */
    ifClause?: WalkedField;
    thenClause?: WalkedField;
    elseClause?: WalkedField;
    /** For negations: the negated sub-schema. */
    negated?: WalkedField;
    /** For recursive fields: the $ref string that would create the cycle. */
    refTarget?: string;
    /** For objects: map of field name → WalkedField. */
    fields?: Record<string, WalkedField>;
    /** For unions: the option schemas. */
    options?: WalkedField[];
    /** For discriminated unions: the discriminator key. */
    discriminator?: string;
    /** For records: key and value schemas. */
    keyType?: WalkedField;
    valueType?: WalkedField;
    /** For literals: the literal value(s). */
    literalValues?: (string | number | boolean | null)[];
    /** Example values from the schema's `examples` keyword. */
    examples?: unknown[];
    /** Walked field tree for recursive rendering. */
    tree: WalkedField;
}

// ---------------------------------------------------------------------------
// React render props
// ---------------------------------------------------------------------------

/**
 * Props for React render functions. Extends BaseFieldProps with:
 * - `onChange` — callback to propagate value changes back to state
 * - `renderChild` — recursively renders a child field, threading onChange
 */
export interface RenderProps extends BaseFieldProps {
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
 * Props for HTML render functions. Extends BaseFieldProps with:
 * - `renderChild` — recursively renders a child field to HTML string
 *
 * No `onChange` — HTML rendering is pure output with no event handling.
 */
export interface HtmlRenderProps extends BaseFieldProps {
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
// ComponentResolver — the React theme adapter interface
// ---------------------------------------------------------------------------

export type RenderFunction = (props: RenderProps) => unknown;

export interface ComponentResolver {
    string?: RenderFunction;
    number?: RenderFunction;
    boolean?: RenderFunction;
    enum?: RenderFunction;
    object?: RenderFunction;
    array?: RenderFunction;
    tuple?: RenderFunction;
    record?: RenderFunction;
    union?: RenderFunction;
    discriminatedUnion?: RenderFunction;
    conditional?: RenderFunction;
    negation?: RenderFunction;
    recursive?: RenderFunction;
    literal?: RenderFunction;
    file?: RenderFunction;
    unknown?: RenderFunction;
}

// ---------------------------------------------------------------------------
// HtmlResolver — the HTML theme adapter interface
// ---------------------------------------------------------------------------

/** An HTML render function returns a string. */
export type HtmlRenderFunction = (props: HtmlRenderProps) => string;

/**
 * HTML resolver — maps schema types to HTML string renderers.
 * Structurally mirrors ComponentResolver but produces strings.
 */
export interface HtmlResolver {
    string?: HtmlRenderFunction;
    number?: HtmlRenderFunction;
    boolean?: HtmlRenderFunction;
    enum?: HtmlRenderFunction;
    object?: HtmlRenderFunction;
    array?: HtmlRenderFunction;
    tuple?: HtmlRenderFunction;
    record?: HtmlRenderFunction;
    union?: HtmlRenderFunction;
    discriminatedUnion?: HtmlRenderFunction;
    conditional?: HtmlRenderFunction;
    negation?: HtmlRenderFunction;
    recursive?: HtmlRenderFunction;
    literal?: HtmlRenderFunction;
    file?: HtmlRenderFunction;
    unknown?: HtmlRenderFunction;
}

// ---------------------------------------------------------------------------
// Resolver lookup
// ---------------------------------------------------------------------------

export const RESOLVER_KEYS = [
    "string",
    "number",
    "boolean",
    "enum",
    "object",
    "array",
    "tuple",
    "record",
    "union",
    "discriminatedUnion",
    "conditional",
    "negation",
    "recursive",
    "literal",
    "file",
    "unknown",
] as const;

type ResolverKey = (typeof RESOLVER_KEYS)[number];

/**
 * Map a schema type to the resolver key that handles it.
 * `discriminatedUnion` → `union`. Unknown types → `unknown`.
 */
export function typeToKey(type: WalkedField["type"]): ResolverKey {
    switch (type) {
        case "string":
        case "number":
        case "boolean":
        case "enum":
        case "object":
        case "array":
        case "tuple":
        case "record":
        case "union":
        case "discriminatedUnion":
        case "conditional":
        case "negation":
        case "recursive":
        case "literal":
        case "file":
        case "unknown":
            return type;
        default:
            return "unknown";
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
