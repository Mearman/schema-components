/**
 * Core types for schema-components.
 *
 * These types define the vocabulary shared between the schema walker,
 * component resolver, and React components.
 */

// ---------------------------------------------------------------------------
// Schema types — Zod schema and JSON Schema object
// ---------------------------------------------------------------------------

/** Zod schema — Zod 4 or Zod 3. Represented as a generic record since we
 * inspect ._zod.def dynamically rather than relying on Zod's type hierarchy. */
export type ZodSchema = Record<string, unknown>;

/** A raw JSON object (JSON Schema or OpenAPI document). */
export type JsonObject = Record<string, unknown>;

// ---------------------------------------------------------------------------
// SchemaMeta — metadata that controls rendering behaviour
// ---------------------------------------------------------------------------

/**
 * Metadata attached to schemas via `.meta()` or passed as props to
 * `<SchemaComponent>`. Every field is also available as a top-level
 * prop on `<SchemaComponent>` (with TypeScript-enforced exclusivity
 * between prop and `meta`).
 */
export interface SchemaMeta {
    readOnly?: boolean;
    writeOnly?: boolean;
    description?: string;
    title?: string;
    deprecated?: boolean;
    /** Component hint — resolved before theme adapter. */
    component?: string;
    /** Arbitrary UI hints passed through to theme adapters. */
    [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Editability — resolved per-field from three sources
// ---------------------------------------------------------------------------

export type Editability = "presentation" | "input" | "editable";

/**
 * Resolved editability state for a single field.
 *
 * Priority (highest wins):
 * 1. Property-level readOnly → presentation
 * 2. Property-level writeOnly → input
 * 3. Component-level readOnly → presentation
 * 4. Component-level writeOnly → input
 * 5. Schema root readOnly → presentation
 * 6. Schema root writeOnly → input
 * 7. Neither → editable
 */
export function resolveEditability(
    propertyMeta: SchemaMeta | undefined,
    componentMeta: SchemaMeta | undefined,
    rootMeta: SchemaMeta | undefined
): Editability {
    if (propertyMeta?.readOnly) return "presentation";
    if (propertyMeta?.writeOnly) return "input";
    if (componentMeta?.readOnly) return "presentation";
    if (componentMeta?.writeOnly) return "input";
    if (rootMeta?.readOnly) return "presentation";
    if (rootMeta?.writeOnly) return "input";
    return "editable";
}

// ---------------------------------------------------------------------------
// FieldOverrides — type-safe nested overrides for the `fields` prop
// ---------------------------------------------------------------------------

/**
 * Recursive mapped type that mirrors a schema's shape for per-field
 * meta overrides. Each leaf is `Partial<SchemaMeta>`, objects recurse
 * and also accept their own `SchemaMeta`.
 */
export type FieldOverrides<T> = {
    [K in keyof T]?: T[K] extends object
        ? FieldOverrides<T[K]> & Partial<SchemaMeta>
        : Partial<SchemaMeta>;
};

/**
 * Fallback type for runtime schemas (no compile-time shape).
 */
export type FieldOverride = Partial<SchemaMeta>;

// ---------------------------------------------------------------------------
// Walker types — what the walker produces for each schema node
// ---------------------------------------------------------------------------

export type SchemaType =
    | "string"
    | "number"
    | "boolean"
    | "null"
    | "enum"
    | "literal"
    | "object"
    | "array"
    | "record"
    | "union"
    | "discriminatedUnion"
    | "optional"
    | "nullable"
    | "default"
    | "readonly"
    | "pipe"
    | "lazy"
    | "file"
    | "unknown";

export interface WalkedField {
    type: SchemaType;
    editability: Editability;
    meta: SchemaMeta;
    /** For objects: map of field name → WalkedField. */
    fields?: Record<string, WalkedField>;
    /** For arrays: the element schema. */
    element?: WalkedField;
    /** For enums: the allowed values. */
    enumValues?: string[];
    /** For unions/discriminated unions: the options. */
    options?: WalkedField[] | undefined;
    discriminator?: string | undefined;
    /** For records: key and value schemas. */
    keyType?: WalkedField;
    valueType?: WalkedField;
    /** For literals: the literal value(s). */
    literalValues?: (string | number | boolean | null)[];
    /** Whether the field is optional. */
    isOptional?: boolean;
    /** Whether the field is nullable. */
    isNullable?: boolean;
    /** Default value if present on the schema. */
    defaultValue?: unknown;
    /** Constraints from Zod checks (min, max, pattern, etc.). */
    constraints: FieldConstraints;
}

export interface FieldConstraints {
    minLength?: number;
    maxLength?: number;
    minimum?: number;
    maximum?: number;
    pattern?: string;
    format?: string;
    mimeTypes?: string[] | undefined;
    minItems?: number;
    maxItems?: number;
}

// ---------------------------------------------------------------------------
// Component resolver — the theme adapter interface
// ---------------------------------------------------------------------------

export interface RenderContext {
    editability: Editability;
    meta: SchemaMeta;
    constraints: FieldConstraints;
    /** The full path to this field from the root (e.g. "address.city"). */
    path: string;
}

export type RenderFunction = (context: RenderContext) => unknown;

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
// Type-level JSON Schema parser (for `as const` literals)
// ---------------------------------------------------------------------------

/**
 * Maps a JSON Schema structure to a TypeScript type.
 * Works with `as const` literals — provides full autocomplete for `fields`.
 */
export type FromJSONSchema<S> = S extends { type: "string" }
    ? string
    : S extends { type: "number" | "integer" }
      ? number
      : S extends { type: "boolean" }
        ? boolean
        : S extends { type: "null" }
          ? null
          : S extends { type: "array"; items: infer I }
            ? FromJSONSchema<I>[]
            : S extends {
                    type: "object";
                    properties: infer P;
                    required?: infer R;
                }
              ? {
                    [K in keyof P]: K extends R
                        ? FromJSONSchema<P[K]>
                        : FromJSONSchema<P[K]> | undefined;
                }
              : unknown;

/**
 * Resolves an OpenAPI `ref` string to its JSON Schema, then parses it.
 */
export type ResolveOpenAPIRef<
    Spec extends Record<string, unknown>,
    Ref extends string,
> = Ref extends `#/components/schemas/${infer Name}`
    ? Name extends keyof Spec["components"]
        ? FromJSONSchema<Spec["components"][Name]>
        : unknown
    : Ref extends `${string}/${string}`
      ? unknown // Path-based ref resolution is too deep to type statically
      : unknown;
