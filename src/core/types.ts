/**
 * Core types for schema-components.
 *
 * These types define the vocabulary shared between the schema walker,
 * component resolver, and React components.
 */

// ---------------------------------------------------------------------------
// Schema types — JSON Schema object
// ---------------------------------------------------------------------------

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
    // Property-level overrides always win. Check for explicit presence
    // of the key — `readOnly: false` means "not read-only", overriding
    // a higher-level `readOnly: true`.
    if (propertyMeta !== undefined && "readOnly" in propertyMeta) {
        if (propertyMeta.readOnly) return "presentation";
        // readOnly: false — not presentation, check writeOnly
    }
    if (propertyMeta !== undefined && "writeOnly" in propertyMeta) {
        if (propertyMeta.writeOnly) return "input";
        // writeOnly: false — not input, fall through
    }
    // If property explicitly set readOnly or writeOnly (even to false),
    // that overrides higher levels — the field is editable.
    if (
        propertyMeta !== undefined &&
        ("readOnly" in propertyMeta || "writeOnly" in propertyMeta)
    ) {
        return "editable";
    }

    // Component-level (rendering context)
    if (componentMeta !== undefined && "readOnly" in componentMeta) {
        if (componentMeta.readOnly) return "presentation";
    }
    if (componentMeta !== undefined && "writeOnly" in componentMeta) {
        if (componentMeta.writeOnly) return "input";
    }
    if (
        componentMeta !== undefined &&
        ("readOnly" in componentMeta || "writeOnly" in componentMeta)
    ) {
        return "editable";
    }

    // Schema root (fallback default)
    if (rootMeta !== undefined && "readOnly" in rootMeta) {
        if (rootMeta.readOnly) return "presentation";
    }
    if (rootMeta !== undefined && "writeOnly" in rootMeta) {
        if (rootMeta.writeOnly) return "input";
    }
    if (
        rootMeta !== undefined &&
        ("readOnly" in rootMeta || "writeOnly" in rootMeta)
    ) {
        return "editable";
    }

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

export type {
    ComponentResolver,
    RenderFunction,
    RenderProps,
} from "./renderer.ts";

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
    ? Spec["components"] extends Record<string, unknown>
        ? Spec["components"]["schemas"] extends Record<string, unknown>
            ? Name extends keyof Spec["components"]["schemas"]
                ? FromJSONSchema<Spec["components"]["schemas"][Name]>
                : unknown
            : unknown
        : unknown
    : Ref extends `${string}/${string}`
      ? unknown // Path-based ref resolution is too deep to type statically
      : unknown;

// ---------------------------------------------------------------------------
// Type-level OpenAPI path traversal (for as const literals)
// ---------------------------------------------------------------------------

/** Navigate to a path item in an OpenAPI document. */
type PathItemOf<Doc, Path extends string> = Doc extends {
    paths: Record<string, unknown>;
}
    ? Path extends keyof Doc["paths"]
        ? Doc["paths"][Path]
        : unknown
    : unknown;

/** Navigate to an operation within a path item. */
type OperationOf<PathItem, Method extends string> =
    PathItem extends Record<string, unknown>
        ? Method extends keyof PathItem
            ? PathItem[Method]
            : unknown
        : unknown;

/** Extract the schema from request body content. */
type RequestBodySchemaOf<Op> = Op extends {
    requestBody: { content: { "application/json": { schema: infer S } } };
}
    ? S
    : Op extends {
            requestBody: { content: Record<string, { schema: infer S }> };
        }
      ? S
      : unknown;

/** Extract the schema from response content. */
type ResponseSchemaOf<Op, Status extends string> = Op extends {
    responses: Record<string, unknown>;
}
    ? Status extends keyof Op["responses"]
        ? Op["responses"][Status] extends {
              content: { "application/json": { schema: infer S } };
          }
            ? S
            : Op["responses"][Status] extends {
                    content: Record<string, { schema: infer S }>;
                }
              ? S
              : unknown
        : unknown
    : unknown;

/** Resolve a schema that may be a $ref pointer. */
type ResolveMaybeRef<Doc, S> = S extends { $ref: infer R extends string }
    ? ResolveOpenAPIRef<Doc & Record<string, unknown>, R>
    : S extends Record<string, unknown>
      ? FromJSONSchema<S>
      : unknown;

/** Extract parameter names from an operation. */
type ParameterNamesOf<Doc, Path extends string, Method extends string> =
    OperationOf<PathItemOf<Doc, Path>, Method> extends {
        parameters: readonly unknown[];
    }
        ? OperationOf<
              PathItemOf<Doc, Path>,
              Method
          >["parameters"][number] extends {
              name: infer N;
          }
            ? N extends string
                ? N
                : never
            : never
        : never;

/**
 * Infer the TypeScript type of an OpenAPI operation's request body.
 */
export type OpenAPIRequestBodyType<
    Doc,
    Path extends string,
    Method extends string,
> = ResolveMaybeRef<
    Doc,
    RequestBodySchemaOf<OperationOf<PathItemOf<Doc, Path>, Method>>
>;

/**
 * Infer the TypeScript type of an OpenAPI operation's response.
 */
export type OpenAPIResponseType<
    Doc,
    Path extends string,
    Method extends string,
    Status extends string,
> = ResolveMaybeRef<
    Doc,
    ResponseSchemaOf<OperationOf<PathItemOf<Doc, Path>, Method>, Status>
>;

/**
 * Infer the fields prop type for ApiRequestBody.
 * Falls back to Record<string, FieldOverride> for runtime documents.
 */
export type InferRequestBodyFields<
    Doc,
    Path extends string,
    Method extends string,
> =
    unknown extends OpenAPIRequestBodyType<Doc, Path, Method>
        ? Record<string, FieldOverride>
        : FieldOverrides<OpenAPIRequestBodyType<Doc, Path, Method>>;

/**
 * Infer the fields prop type for ApiResponse.
 * Falls back to Record<string, FieldOverride> for runtime documents.
 */
export type InferResponseFields<
    Doc,
    Path extends string,
    Method extends string,
    Status extends string,
> =
    unknown extends OpenAPIResponseType<Doc, Path, Method, Status>
        ? Record<string, FieldOverride>
        : FieldOverrides<OpenAPIResponseType<Doc, Path, Method, Status>>;

/**
 * Infer the overrides prop type for ApiParameters.
 * Falls back to Record<string, FieldOverride> for runtime documents.
 */
export type InferParameterOverrides<
    Doc,
    Path extends string,
    Method extends string,
> =
    string extends ParameterNamesOf<Doc, Path, Method>
        ? Record<string, FieldOverride>
        : Partial<Record<ParameterNamesOf<Doc, Path, Method>, FieldOverride>>;

// ---------------------------------------------------------------------------
// Type-level path utilities for SchemaField
// ---------------------------------------------------------------------------

/**
 * Check if T is a "narrow" type (not wide like object, Record, or unknown).
 * Used to determine if we can enumerate keys for path inference.
 */
type IsNarrowObject<T> = T extends
    | string
    | number
    | boolean
    | null
    | undefined
    | unknown[]
    ? false
    : T extends object
      ? Record<string, never> extends T
          ? false
          : true
      : false;

/**
 * Extract all valid dot-separated paths from an object type.
 * Produces paths like "name" | "address.city" | "address.postcode".
 * Stops at leaf types (string, number, boolean, null) and arrays.
 * Returns `string` for wide types (object, Record, unknown).
 * Handles optional/nullable fields by unwrapping T | undefined.
 */
export type PathOfType<T, Prefix extends string = ""> =
    IsNarrowObject<T> extends true
        ? {
              [K in keyof T & string]: T[K] extends
                  | string
                  | number
                  | boolean
                  | null
                  | undefined
                  ? `${Prefix}${K}`
                  : T[K] extends unknown[]
                    ? `${Prefix}${K}`
                    : T[K] extends object | undefined
                      ?
                            | PathOfType<
                                  Exclude<T[K], undefined>,
                                  `${Prefix}${K}.`
                              >
                            | `${Prefix}${K}`
                      : `${Prefix}${K}`;
          }[keyof T & string]
        : string;

/**
 * Extract the type at a given dot-separated path.
 * PathOfType<T> produces valid paths; TypeAtPath resolves the leaf type.
 */
export type TypeAtPath<
    T,
    P extends string,
> = P extends `${infer Key}.${infer Rest}`
    ? Key extends keyof T
        ? TypeAtPath<T[Key], Rest>
        : unknown
    : P extends keyof T
      ? T[P]
      : unknown;
