/**
 * Component resolver interface — shared between React and HTML renderers.
 *
 * The resolver maps schema types to render functions. Theme adapters
 * implement this interface. The return type of render functions is
 * `unknown` so that different view layers can produce their own output.
 *
 * `RenderProps` carries the data and callbacks every render function needs.
 * `renderChild` on RenderProps enables recursive rendering without the
 * theme adapter needing to know about the resolver.
 */

import type { FieldConstraints, SchemaMeta, WalkedField } from "./types.ts";

// ---------------------------------------------------------------------------
// Render props — what every render function receives
// ---------------------------------------------------------------------------

export interface RenderProps {
    /** Current field value. Undefined for Input editability. */
    value: unknown;
    /** Callback to update the field value. */
    onChange: (value: unknown) => void;
    /** Resolved editability for this field. */
    readOnly: boolean;
    writeOnly: boolean;
    /** Schema metadata for this field. */
    meta: SchemaMeta;
    /** Constraints from Zod checks. */
    constraints: FieldConstraints;
    /** Dot-separated path from root (e.g. "address.city"). */
    path: string;
    /** For enums: the allowed values. */
    enumValues?: string[];
    /** For arrays: the element schema. */
    element?: WalkedField;
    /** For objects: map of field name → WalkedField. */
    fields?: Record<string, WalkedField>;
    /** For unions: the option schemas. */
    options?: WalkedField[];
    /** For discriminated unions: the discriminator key. */
    discriminator?: string;
    /** For records: key and value schemas. */
    keyType?: WalkedField;
    valueType?: WalkedField;
    /** Walked field tree for recursive rendering. */
    tree: WalkedField;
    /**
     * Render a child field. Theme adapters call this to recursively render
     * nested structures (object fields, array elements, union options).
     * The resolver and rendering context are already wired in.
     */
    renderChild: (
        tree: WalkedField,
        value: unknown,
        onChange: (v: unknown) => void
    ) => unknown;
}

// ---------------------------------------------------------------------------
// ComponentResolver — the theme adapter interface
// ---------------------------------------------------------------------------

export type RenderFunction = (props: RenderProps) => unknown;

export interface ComponentResolver {
    string?: RenderFunction;
    number?: RenderFunction;
    boolean?: RenderFunction;
    enum?: RenderFunction;
    object?: RenderFunction;
    array?: RenderFunction;
    record?: RenderFunction;
    union?: RenderFunction;
    literal?: RenderFunction;
    file?: RenderFunction;
    unknown?: RenderFunction;
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
    "record",
    "union",
    "literal",
    "file",
    "unknown",
] as const;

type ResolverKey = (typeof RESOLVER_KEYS)[number];

/**
 * Map a schema type to the resolver key that handles it.
 * `discriminatedUnion` → `union`. Unknown types → `unknown`.
 * Exported so HTML and React resolvers can share the mapping
 * without duplicating the switch.
 */
export function typeToKey(type: WalkedField["type"]): ResolverKey {
    switch (type) {
        case "string":
        case "number":
        case "boolean":
        case "enum":
        case "object":
        case "array":
        case "record":
        case "union":
        case "literal":
        case "file":
        case "unknown":
            return type;
        case "discriminatedUnion":
            return "union";
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

// HTML resolver merge is in the html module — the HtmlResolver type
// has (props: HtmlRenderProps) => string which is incompatible with
// a generic (props: unknown) => unknown due to exactOptionalPropertyTypes.
