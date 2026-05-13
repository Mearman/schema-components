/**
 * Component resolver interface and headless default descriptor renderer.
 *
 * The ComponentResolver maps schema types to render functions. Theme adapters
 * implement this interface. The headless default produces descriptor objects
 * (not React elements) — the React module converts these or replaces them
 * entirely with its own rendering.
 *
 * The render function returns `unknown` so that different view layers can
 * produce their own output types. The React module casts to ReactNode.
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

export function getRenderFunction(
    type: WalkedField["type"],
    resolver: ComponentResolver
): RenderFunction | undefined {
    switch (type) {
        case "string":
            return resolver.string;
        case "number":
            return resolver.number;
        case "boolean":
            return resolver.boolean;
        case "enum":
            return resolver.enum;
        case "object":
            return resolver.object;
        case "array":
            return resolver.array;
        case "record":
            return resolver.record;
        case "union":
        case "discriminatedUnion":
            return resolver.union;
        case "literal":
            return resolver.literal;
        case "file":
            return resolver.file;
        default:
            return resolver.unknown;
    }
}
