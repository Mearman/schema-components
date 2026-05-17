/**
 * Type-level JSON Schema and OpenAPI parser.
 *
 * Compile-time types that map `as const` schema literals to TypeScript types.
 * Provides autocomplete for `fields` and `overrides` props on React components.
 *
 * Supports all JSON Schema draft versions (04-2020-12) and OpenAPI 3.x / Swagger 2.0.
 *
 * Known limitations:
 * - Recursive schemas ($recursiveRef) -> unknown (TS cannot express recursive types)
 * - `not` -> unknown (TS cannot negate types)
 * - `if`/`then`/`else` -> base schema without conditionals (TS cannot evaluate conditions)
 * - `propertyNames` -> ignored (TS cannot validate key shapes)
 * - `dependentSchemas` / `dependentRequired` -> ignored (runtime-only conditionals)
 * - `unevaluatedProperties` -> ignored (runtime-only)
 * - `contains` / `minContains` / `maxContains` -> element type unchanged (runtime constraints)
 * - OpenAPI path-based refs -> uses existing path traversal types where possible
 */

import type { FieldOverride, FieldOverrides } from "./types.ts";

// ---------------------------------------------------------------------------
// Type-level JSON Schema parser (for `as const` literals)
// ---------------------------------------------------------------------------

/**
 * Convert a readonly tuple/array of values to a union type.
 * Handles both `as const` readonly tuples and mutable arrays.
 */
type ArrayToUnion<A> = A extends readonly unknown[] ? A[number] : never;

/**
 * Maps a JSON Schema structure to a TypeScript type.
 * Works with `as const` literals -- provides full autocomplete for `fields`.
 *
 * Supports all JSON Schema draft versions (04-2020-12) and OpenAPI 3.x:
 * - Primitive types: string, number, integer, boolean, null
 * - type as array: `["string", "null"]` -> `string | null` (nullable)
 * - enum -> union of literal types
 * - const -> literal type
 * - object with properties/required -> specific object type
 * - object with additionalProperties -> Record<string, T>
 * - array with items -> T[]
 * - array with prefixItems -> tuple type
 * - allOf -> intersection type
 * - anyOf -> union type
 * - oneOf -> union type
 * - $ref -> resolved via $defs/definitions/$anchor context
 * - $dynamicRef -> resolved via $dynamicAnchor in definitions
 * - $recursiveRef -> unknown (recursive types not expressible in TS)
 * - if/then/else -> base schema (conditionals not expressible in TS)
 * - not -> unknown (negation not expressible in TS)
 * - patternProperties -> merged into loose index signature
 */
export type FromJSONSchema<
    S,
    Defs extends Record<string, unknown> = Record<string, never>,
> = S extends { $ref: infer R extends string }
    ? ResolveSchemaRef<R, Defs>
    : S extends { $recursiveRef: string }
      ? /** $recursiveRef: TypeScript cannot express recursive types. */
        unknown
      : S extends { $dynamicRef: infer R extends string }
        ? ResolveSchemaRef<R, Defs>
        : S extends { allOf: infer A }
          ? AllOfToType<A, Defs>
          : S extends { anyOf: infer A }
            ? UnionOfMembers<A, Defs>
            : S extends { oneOf: infer A }
              ? UnionOfMembers<A, Defs>
              : S extends { if: unknown }
                ? /** if/then/else: infer base schema without conditionals. */
                  FromJSONSchema<Omit<S, "if" | "then" | "else">, Defs>
                : S extends { not: unknown }
                  ? /** not: TypeScript cannot negate types. */
                    unknown
                  : S extends { const: infer V }
                    ? V
                    : S extends { enum: infer E }
                      ? ArrayToUnion<E>
                      : S extends { type: infer T }
                        ? TypeToTs<T, S, Defs>
                        : S extends readonly (infer E)[]
                          ? E
                          : unknown;

/**
 * Marker type emitted when OpenAPI $ref resolution hits the type-level
 * recursion depth limit. Instead of silently falling back to
 * `Record<string, FieldOverride>`, produces this branded type so
 * consumers can detect it via conditional types.
 *
 * Usage:
 * ```ts
 * type Fields = InferRequestBodyFields<Doc, "/users", "post">;
 * type IsFallback = Fields extends __SchemaInferenceFellBack ? true : false;
 * ```
 */
export interface __SchemaInferenceFellBack {
    readonly __schemaInferenceFallback: unique symbol;
}

/**
 * Escape hatch for recursive schemas where type-level inference
 * cannot proceed. Typed as `Record<string, FieldOverride>` but
 * explicitly branded so callers know they are using the unsafe path.
 *
 * JSDoc trade-off note: This bypasses field-level type safety.
 * Prefer restructuring the schema to avoid deep $ref chains
 * when possible.
 */
export type UnsafeFields = Record<string, FieldOverride> & {
    /** Marks this as the unsafe fallback for recursive schemas. */
    readonly __unsafe?: true;
};

/**
 * Convert a `FromJSONSchema` result to `unknown` when recursion is detected.
 * Returns the original type when the schema is non-recursive.
 */
type DetectRecursiveFallback<T> = unknown extends T
    ? __SchemaInferenceFellBack
    : T;

/**
 * Type-level recursion bound for $ref resolution.
 *
 * The TypeScript type system imposes its own recursion limit; without an
 * explicit bound a cyclic schema graph would exhaust it and degrade to
 * `any`/`unknown` silently. Ten levels is the runtime walker's parallel
 * — see `countDistinctRefs` in `ref.ts` (lines 52-55), which derives its
 * bound from the number of distinct `$ref` strings in the document.
 *
 * A fixed bound is used here rather than a derived one because the type
 * system has no way to count distinct strings across a recursive `Defs`
 * map without itself recursing — which is the problem the bound exists
 * to solve. Ten covers every realistic schema graph encountered in
 * practice; deeper graphs surface as `__SchemaInferenceFellBack` so
 * consumers can detect the limit explicitly.
 */
export type DEFAULT_MAX_DEPTH = 10;

/**
 * Resolve a $ref against the local definitions context.
 *
 * SOURCE-OF-TRUTH: mirrors runtime `resolveRef` in
 * `packages/core/src/core/ref.ts` (line 90). Any change to the runtime
 * ref-resolution rules (new ref forms, different cycle handling) must be
 * reflected here and pinned in
 * `packages/core/tests/typeInference-walker-parity.test.ts`.
 *
 * Supports:
 * - `#` (root)
 * - `#/$defs/Name` and `#/definitions/Name` (named definitions)
 * - `#SomeName` ($anchor, $dynamicAnchor resolved from definitions)
 */
type ResolveSchemaRef<
    R extends string,
    Defs extends Record<string, unknown>,
    Depth extends number = 0,
> = Depth extends DEFAULT_MAX_DEPTH
    ? __SchemaInferenceFellBack
    : R extends "#"
      ? unknown
      : R extends `#/$defs/${infer Name}`
        ? Name extends keyof Defs
            ? DetectRecursiveFallback<FromJSONSchema<Defs[Name], Defs>>
            : unknown
        : R extends `#/definitions/${infer Name}`
          ? Name extends keyof Defs
              ? DetectRecursiveFallback<FromJSONSchema<Defs[Name], Defs>>
              : unknown
          : R extends `#${infer AnchorName}`
            ? AnchorName extends keyof Defs
                ? DetectRecursiveFallback<
                      FromJSONSchema<Defs[AnchorName], Defs>
                  >
                : unknown
            : unknown;

/**
 * Merge an allOf array into an intersection type.
 */
type AllOfToType<
    A,
    Defs extends Record<string, unknown>,
> = A extends readonly unknown[]
    ? UnionToIntersection<FromJSONSchema<A[number], Defs>>
    : unknown;

/**
 * Convert an anyOf/oneOf array into a union type.
 *
 * SOURCE-OF-TRUTH: mirrors runtime `walkUnion` (and the
 * `walkDiscriminatedUnion` fast path) in
 * `packages/core/src/core/walker.ts` (lines 723-752), together with
 * `detectDiscriminated` and `normaliseAnyOf` in
 * `packages/core/src/core/merge.ts` (lines 190-260).
 *
 * Deliberate divergence: the walker collapses qualifying `oneOf` members
 * into a `discriminatedUnion` field at runtime. The type-level helper
 * produces a plain TypeScript union because a discriminated union and a
 * plain union over the same members are structurally indistinguishable
 * at the type level. Parity is pinned in
 * `packages/core/tests/typeInference-walker-parity.test.ts`.
 *
 * Filters out `{ type: "null" }` members and instead makes the result
 * nullable when at least one null member is present — mirrors the
 * walker's `normaliseAnyOf`.
 */
type UnionOfMembers<
    A,
    Defs extends Record<string, unknown>,
> = A extends readonly unknown[]
    ? HasNullMember<A> extends true
        ? Exclude<FromJSONSchema<A[number], Defs>, null> | null
        : FromJSONSchema<A[number], Defs>
    : unknown;

/**
 * Check whether an anyOf/oneOf array contains a `{ type: "null" }` member.
 *
 * SOURCE-OF-TRUTH: mirrors runtime `normaliseAnyOf` in
 * `packages/core/src/core/merge.ts` (lines 190-209). Both implementations
 * only recognise schema-shaped null members (`{ type: "null" }`); a bare
 * `null` literal in the array is treated as non-nullable. Parity is
 * pinned in `packages/core/tests/typeInference-walker-parity.test.ts`.
 */
type HasNullMember<A> = A extends readonly unknown[]
    ? null extends A[number]
        ? false // bare null literal, not a schema object
        : { type: "null" } extends A[number]
          ? true
          : false
    : false;

/**
 * Dispatch on a `type` value -- handles single types, type arrays,
 * and delegates to the appropriate type-specific resolver.
 */
type TypeToTs<T, S, Defs extends Record<string, unknown>> = T extends "string"
    ? string
    : T extends "number" | "integer"
      ? number
      : T extends "boolean"
        ? boolean
        : T extends "null"
          ? null
          : T extends "array"
            ? ArraySchemaToTs<S, Defs>
            : T extends "object"
              ? ObjectSchemaToTs<S, Defs>
              : T extends readonly (infer E)[]
                ? TypeArrayToTs<E, S, Defs>
                : unknown;

/**
 * Handle `type` as an array (Draft 04-07): `["string", "null"]`.
 * Filters out "null" and makes the result nullable.
 */
type TypeArrayToTs<
    E,
    S,
    Defs extends Record<string, unknown>,
> = E extends "null"
    ? null
    : E extends "string"
      ? NullableResult<string, S>
      : E extends "number" | "integer"
        ? NullableResult<number, S>
        : E extends "boolean"
          ? NullableResult<boolean, S>
          : E extends "array"
            ? NullableResult<ArraySchemaToTs<OmitArrayHelpers<S>, Defs>, S>
            : E extends "object"
              ? NullableResult<ObjectSchemaToTs<OmitArrayHelpers<S>, Defs>, S>
              : unknown;

/**
 * Make a type nullable if the original schema `type` array includes "null".
 * Detects nullable from the type array directly.
 */
type NullableResult<Base, S> = S extends { type: readonly (infer T)[] }
    ? "null" extends T
        ? Base | null
        : Base
    : Base;

/**
 * Omit array-utility keys that interfere with object/array matching
 * when re-parsing a schema for a single type from a type array.
 */
type OmitArrayHelpers<S> = Omit<
    S,
    "prefixItems" | "items" | "additionalProperties"
>;

/**
 * Parse an array schema: prefixItems -> tuple, items -> T[], or unknown[].
 *
 * Draft 04 used tuple-form `items` (an array of schemas) for tuple typing;
 * Draft 2020-12 renamed this to `prefixItems`. The runtime normaliser in
 * `packages/core/src/core/normalise.ts` (lines 526-534) rewrites the legacy
 * form to `prefixItems` before the walker sees it. We mirror that rewrite
 * here so `as const` literals using the legacy form infer the same tuple
 * type at compile time.
 *
 * `contains` / `minContains` / `maxContains` constrain elements at runtime
 * but don't change the compile-time array element type.
 */
type ArraySchemaToTs<S, Defs extends Record<string, unknown>> = S extends {
    prefixItems: infer P;
}
    ? PrefixItemsToTuple<P, Defs>
    : S extends { items: infer I extends readonly unknown[] }
      ? /** Draft 04 tuple-form items: rewrite to a tuple at the type level. */
        PrefixItemsToTuple<I, Defs>
      : S extends { items: infer I }
        ? FromJSONSchema<I, Defs>[]
        : unknown[];

/**
 * Convert a prefixItems array to a TypeScript tuple type.
 */
type PrefixItemsToTuple<
    P,
    Defs extends Record<string, unknown>,
> = P extends readonly [infer First, ...infer Rest]
    ? [FromJSONSchema<First, Defs>, ...PrefixItemsToTuple<Rest, Defs>]
    : [];

/**
 * Parse an object schema: properties + required -> specific object,
 * additionalProperties -> Record, or empty object.
 *
 * Handles:
 * - `properties` + `required` -> specific object type with required/optional keys
 * - `additionalProperties` as schema -> Record<string, T>
 * - `patternProperties` -> merged into a loose index signature alongside specific props
 *   (TypeScript cannot express regex-keyed properties)
 * - `propertyNames` -> ignored at type level (TS cannot validate key shapes)
 * - `dependentSchemas` / `dependentRequired` -> ignored (runtime-only conditionals)
 * - `unevaluatedProperties` -> ignored (runtime-only)
 */
type ObjectSchemaToTs<S, Defs extends Record<string, unknown>> = S extends {
    type: "object";
    properties: infer P;
}
    ? ExtractDefs<S, Defs> extends infer D extends Record<string, unknown>
        ? MergePatternProps<
              {
                  [K in keyof P as K extends RequiredKeysOf<S>
                      ? K
                      : never]: FromJSONSchema<P[K], D>;
              } & {
                  [K in keyof P as K extends RequiredKeysOf<S>
                      ? never
                      : K]?: FromJSONSchema<P[K], D>;
              },
              S,
              D
          >
        : never
    : S extends { additionalProperties: infer V }
      ? Record<string, FromJSONSchema<V, Defs>>
      : Record<string, unknown>;

/**
 * If the schema has `patternProperties`, intersect the base object type
 * with a `Record<string, T>` index signature covering all pattern values.
 * If no `patternProperties`, return the base type unchanged.
 */
type MergePatternProps<
    Base,
    S,
    Defs extends Record<string, unknown>,
> = S extends { patternProperties: infer PP }
    ? PP extends Record<string, unknown>
        ? Base & Record<string, UnionOfPatternValues<PP, Defs>>
        : Base
    : Base;

/**
 * Extract the union of all pattern property value types.
 */
type UnionOfPatternValues<
    PP extends Record<string, unknown>,
    Defs extends Record<string, unknown>,
> = { [K in keyof PP]: FromJSONSchema<PP[K], Defs> }[keyof PP];

/**
 * Extract the `required` array from a schema as a union of string literals.
 * Handles both readonly `as const` arrays and mutable arrays.
 */
type RequiredKeysOf<S> = S extends { required: infer R }
    ? R extends readonly string[]
        ? R[number]
        : never
    : never;

/**
 * Extract $defs / definitions from a schema for $ref resolution context.
 * Also indexes schemas with `$anchor` or `$dynamicAnchor` by their anchor name,
 * enabling `#SomeName` ref resolution.
 * Merges with the existing Defs context from parent schemas.
 */
type ExtractDefs<S, ParentDefs extends Record<string, unknown>> =
    ExtractRawDefs<S> extends infer RawDefs extends Record<string, unknown>
        ? RawDefs & ParentDefs & ExtractAnchors<RawDefs>
        : ParentDefs;

/** Extract raw $defs / definitions maps. */
type ExtractRawDefs<S> = S extends { $defs: infer D }
    ? D extends Record<string, unknown>
        ? D
        : Record<string, never>
    : S extends { definitions: infer D }
      ? D extends Record<string, unknown>
          ? D
          : Record<string, never>
      : Record<string, never>;

/**
 * Build a map of `$anchor` name -> schema from a definitions block.
 * Scans each definition value for `$anchor` or `$dynamicAnchor` and
 * creates entries like `{ Tree: <schema-with-$anchor-Tree> }`.
 */
type ExtractAnchors<D extends Record<string, unknown>> = {
    [K in keyof D as D[K] extends { $anchor: infer A extends string }
        ? A
        : D[K] extends { $dynamicAnchor: infer A extends string }
          ? A
          : never]: D[K];
};

// ---------------------------------------------------------------------------
// Type-level utilities
// ---------------------------------------------------------------------------

/**
 * Convert a union to an intersection.
 * `A | B` -> `A & B`. Used for allOf merging.
 */
type UnionToIntersection<U> = (
    U extends unknown ? (k: U) => void : never
) extends (k: infer I) => void
    ? I
    : never;

/**
 * Resolves an OpenAPI `ref` string to its JSON Schema, then parses it.
 *
 * SOURCE-OF-TRUTH: mirrors runtime `resolveRef` in
 * `packages/core/src/core/ref.ts` (line 90), which is invoked by the
 * walker entry point in `packages/core/src/core/walker.ts` (lines
 * 144-154) for OpenAPI documents. Any change to the runtime ref-resolution
 * rules (new ref forms, different cycle handling, JSON Pointer decoding)
 * must be reflected here and pinned in
 * `packages/core/tests/typeInference-walker-parity.test.ts`.
 *
 * Handles:
 * - `#/components/schemas/Name` (OpenAPI 3.x)
 * - `#/definitions/Name` (Swagger 2.0)
 * - `#/paths/...` (path-based refs, navigating the document tree)
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
    : Ref extends `#/definitions/${infer Name}`
      ? Spec["definitions"] extends Record<string, unknown>
          ? Name extends keyof Spec["definitions"]
              ? FromJSONSchema<Spec["definitions"][Name]>
              : unknown
          : unknown
      : Ref extends `#/paths/${infer PathRest}`
        ? ResolvePathBasedRef<Spec, PathRest>
        : unknown;

/**
 * Resolve a path-based $ref after the `#/paths/` prefix.
 * Splits on `/` and navigates the document tree.
 *
 * Note: JSON Pointer tilde encoding (~1 for /, ~0 for ~) is not decoded
 * at the type level. For `as const` literals, use the literal path
 * character directly (e.g. `#/paths//pets/get/...`).
 */
type ResolvePathBasedRef<
    Spec extends Record<string, unknown>,
    PathRest extends string,
> =
    Spec["paths"] extends Record<string, unknown>
        ? ResolvePathSegments<Spec["paths"], SplitPath<PathRest>>
        : unknown;

/**
 * Split a path string on `/` into a tuple of segments.
 * The first segment is the path key (may be empty for `/pets` -> `""` / `"pets"`).
 */
type SplitPath<S extends string> = S extends `${infer Head}/${infer Tail}`
    ? [Head, ...SplitPath<Tail>]
    : [S];

/**
 * Recursively navigate into a document object by path segments.
 */
type ResolvePathSegments<Doc, Segs extends string[]> = Segs extends [
    infer Head extends string,
    ...infer Rest extends string[],
]
    ? Doc extends Record<string, unknown>
        ? Rest extends []
            ? Doc[Head]
            : ResolvePathSegments<Doc[Head], Rest>
        : unknown
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

/** Extract the schema from request body content (any media type). */
type RequestBodySchemaOf<Op> = Op extends {
    requestBody: { content: Record<string, { schema: infer S }> };
}
    ? S
    : Op extends {
            requestBody: {
                content: { "application/json": { schema: infer S } };
            };
        }
      ? S
      : unknown;

/** Extract the schema from response content (any media type). */
type ResponseSchemaOf<Op, Status extends string> = Op extends {
    responses: Record<string, unknown>;
}
    ? Status extends keyof Op["responses"]
        ? Op["responses"][Status] extends {
              content: Record<string, { schema: infer S }>;
          }
            ? S
            : Op["responses"][Status] extends {
                    content: { "application/json": { schema: infer S } };
                }
              ? S
              : unknown
        : unknown
    : unknown;

/** Resolve a schema that may be a $ref pointer. */
type ResolveMaybeRef<Doc, S> = S extends { $ref: infer R extends string }
    ? ResolveOpenAPIRef<Doc & Record<string, unknown>, R>
    : S extends { nullable: true } & Record<string, unknown>
      ? FromJSONSchema<Omit<S, "nullable">> | null
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
 * Detect whether a document is Swagger 2.0 (OpenAPI 2.0).
 *
 * SOURCE-OF-TRUTH: mirrors runtime `isSwagger2` in
 * `packages/core/src/core/version.ts`, which checks for `swagger: "2.0"`.
 * The runtime path also recognises top-level `definitions` / parameters in
 * the body location, but `swagger: "2.0"` is the canonical marker.
 *
 * Type-level Swagger 2.0 documents cannot be fully normalised at compile
 * time — the rewrite reorders the document tree (definitions →
 * components/schemas, body parameters → requestBody, etc.) in ways
 * TypeScript's mapped-type machinery cannot express. Detecting the
 * version is tractable, so we surface `__SchemaInferenceFellBack`
 * deliberately rather than silently producing `unknown`.
 */
type IsSwagger2Doc<Doc> = Doc extends { swagger: "2.0" } ? true : false;

/**
 * Infer the TypeScript type of an OpenAPI operation's request body.
 *
 * Swagger 2.0 documents are not normalised at the type level. When the
 * input is Swagger 2.0, this returns `__SchemaInferenceFellBack` so
 * callers can detect the fallback explicitly via a conditional type.
 */
export type OpenAPIRequestBodyType<
    Doc,
    Path extends string,
    Method extends string,
> = IsSwagger2Doc<Doc> extends true
    ? __SchemaInferenceFellBack
    : ResolveMaybeRef<
          Doc,
          RequestBodySchemaOf<OperationOf<PathItemOf<Doc, Path>, Method>>
      >;

/**
 * Infer the TypeScript type of an OpenAPI operation's response.
 *
 * Swagger 2.0 documents are not normalised at the type level. When the
 * input is Swagger 2.0, this returns `__SchemaInferenceFellBack` so
 * callers can detect the fallback explicitly via a conditional type.
 */
export type OpenAPIResponseType<
    Doc,
    Path extends string,
    Method extends string,
    Status extends string,
> = IsSwagger2Doc<Doc> extends true
    ? __SchemaInferenceFellBack
    : ResolveMaybeRef<
          Doc,
          ResponseSchemaOf<OperationOf<PathItemOf<Doc, Path>, Method>, Status>
      >;

/**
 * Infer the fields prop type for ApiRequestBody.
 * Surfaces `__SchemaInferenceFellBack` when the schema contains
 * recursive $ref chains that exceed type-level depth limits.
 * Falls back to `Record<string, FieldOverride>` for runtime documents.
 */
export type InferRequestBodyFields<
    Doc,
    Path extends string,
    Method extends string,
> =
    unknown extends OpenAPIRequestBodyType<Doc, Path, Method>
        ? OpenAPIRequestBodyType<
              Doc,
              Path,
              Method
          > extends __SchemaInferenceFellBack
            ? __SchemaInferenceFellBack
            : Record<string, FieldOverride>
        : FieldOverrides<OpenAPIRequestBodyType<Doc, Path, Method>>;

/**
 * Infer the fields prop type for ApiResponse.
 * Surfaces `__SchemaInferenceFellBack` when the schema contains
 * recursive $ref chains that exceed type-level depth limits.
 * Falls back to `Record<string, FieldOverride>` for runtime documents.
 */
export type InferResponseFields<
    Doc,
    Path extends string,
    Method extends string,
    Status extends string,
> =
    unknown extends OpenAPIResponseType<Doc, Path, Method, Status>
        ? OpenAPIResponseType<
              Doc,
              Path,
              Method,
              Status
          > extends __SchemaInferenceFellBack
            ? __SchemaInferenceFellBack
            : Record<string, FieldOverride>
        : FieldOverrides<OpenAPIResponseType<Doc, Path, Method, Status>>;

/**
 * Infer the overrides prop type for ApiParameters.
 * Falls back to `Record<string, FieldOverride>` for runtime documents.
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
