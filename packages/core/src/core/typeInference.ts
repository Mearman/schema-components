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

import type { z } from "zod";
import type { FieldOverride, FieldOverrides } from "./types.ts";

// ---------------------------------------------------------------------------
// Static rejection of unrepresentable Zod 4 types
// ---------------------------------------------------------------------------

/**
 * Zod 4 types that `z.toJSONSchema()` rejects at runtime because they
 * have no JSON Schema representation. The runtime adapter
 * (`packages/core/src/core/adapter.ts` lines 106-116) catches the
 * thrown error and surfaces it as a `SchemaNormalisationError` with
 * kind `zod-type-unrepresentable` — but the failure only happens on
 * first render. Statically rejecting these types at the props boundary
 * gives the same diagnostic at compile time.
 *
 * SOURCE-OF-TRUTH: list mirrors `UNREPRESENTABLE_ZOD_TYPES` in
 * `adapter.ts`. Add or remove entries here whenever the runtime list
 * changes.
 */
export type UnrepresentableZodType =
    | z.ZodBigInt
    | z.ZodDate
    | z.ZodMap
    | z.ZodSet
    | z.ZodSymbol
    | z.ZodFunction
    | z.ZodUndefined
    | z.ZodVoid
    | z.ZodNaN
    | z.ZodCodec;

/**
 * Brand returned in place of a rejected Zod input. The descriptive
 * literal is what TypeScript displays when the rejection fires, so
 * developers see why their schema is incompatible.
 */
export interface UnrepresentableZodSchemaError {
    readonly __schemaComponentsError: "Zod 4 type has no JSON Schema representation. See SchemaNormalisationError code 'zod-type-unrepresentable'.";
}

/**
 * Recursively unwrap Zod 4 wrappers that hold an inner schema —
 * `ZodOptional`, `ZodNullable`, `ZodReadonly`, `ZodLazy`, and `ZodPipe`.
 *
 * The runtime conversion still throws for `z.optional(z.bigint())`,
 * `z.lazy(() => z.bigint())`, `z.nullable(z.bigint())`,
 * `z.bigint().readonly()`, and `z.bigint().pipe(z.bigint())` because
 * `z.toJSONSchema()` walks into the wrapped schema before reporting the
 * unrepresentable type. The compile-time rejection must therefore peel
 * those wrappers off before checking against the rejection list, or the
 * brand would never surface for wrapped inputs.
 *
 * `ZodCodec` is short-circuited at the top because it is itself listed
 * in {@link UnrepresentableZodType}. It extends `ZodPipe` structurally,
 * so without the early exit the `ZodPipe` branch would unwrap a bare
 * codec into its two sides and the rejection would no longer fire for
 * `z.codec(...)`.
 *
 * `ZodPipe` (non-codec) has two slots (`in` and `out`); both are
 * unwrapped into a union so a single unrepresentable side surfaces via
 * {@link AnyMemberIsUnrepresentable}.
 */
type UnwrapZodWrapper<T> = T extends z.ZodCodec
    ? T
    : T extends z.ZodOptional<infer Inner>
      ? UnwrapZodWrapper<Inner>
      : T extends z.ZodNullable<infer Inner>
        ? UnwrapZodWrapper<Inner>
        : T extends z.ZodReadonly<infer Inner>
          ? UnwrapZodWrapper<Inner>
          : T extends z.ZodLazy<infer Inner>
            ? UnwrapZodWrapper<Inner>
            : T extends z.ZodPipe<infer InnerIn, infer InnerOut>
              ? UnwrapZodWrapper<InnerIn> | UnwrapZodWrapper<InnerOut>
              : T;

/**
 * True when any member of the (possibly unioned) input extends one of
 * the unrepresentable Zod types. Distribution over the union ensures a
 * single unrepresentable member triggers true — matching runtime
 * semantics for `ZodPipe`, whose two sides expand to a union via
 * {@link UnwrapZodWrapper}.
 */
type AnyMemberIsUnrepresentable<T> = (
    T extends UnrepresentableZodType ? true : false
) extends false
    ? false
    : true;

/**
 * Reject Zod 4 inputs whose runtime conversion is known to throw.
 *
 * - When `T` (or any inner schema wrapped by `ZodOptional`,
 *   `ZodNullable`, `ZodReadonly`, `ZodLazy`, or `ZodPipe`) is one of
 *   the {@link UnrepresentableZodType} variants, the resolved type is
 *   {@link UnrepresentableZodSchemaError}, which is not assignable from
 *   any legitimate Zod / JSON Schema / OpenAPI input — so the prop
 *   fails to typecheck.
 * - Anything else (Zod 4 schemas that DO convert, JSON Schema literals,
 *   OpenAPI documents, `unknown` for runtime inputs) passes through
 *   unchanged.
 */
export type RejectUnrepresentableZod<T> =
    AnyMemberIsUnrepresentable<UnwrapZodWrapper<T>> extends true
        ? UnrepresentableZodSchemaError
        : T;

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
    Depth extends readonly unknown[] = [],
> =
    MergeRootDefs<S, Defs> extends infer MergedDefs extends Record<
        string,
        unknown
    >
        ? S extends { nullable: true }
            ? /**
               * OpenAPI 3.0 `nullable: true` — surface the keyword wherever it
               * appears (not just inside `ResolveMaybeRef`). The runtime path
               * rewrites this to `anyOf: [T, { type: "null" }]` via
               * `normaliseOpenApi30Node` (`openapi30.ts`). Mirroring at the
               * `FromJSONSchema` level means nested fields inside refs preserve
               * nullability when resolved.
               */
              FromJSONSchema<Omit<S, "nullable">, MergedDefs, Depth> | null
            : S extends { $ref: infer R extends string }
              ? ResolveSchemaRef<R, MergedDefs, Depth>
              : S extends { $recursiveRef: string }
                ? /** $recursiveRef: TypeScript cannot express recursive types. */
                  unknown
                : S extends { $dynamicRef: infer R extends string }
                  ? ResolveSchemaRef<R, MergedDefs, Depth>
                  : S extends { allOf: infer A }
                    ? AllOfToType<A, MergedDefs, Depth>
                    : S extends { anyOf: infer A }
                      ? UnionOfMembers<A, MergedDefs, Depth>
                      : S extends { oneOf: infer A }
                        ? UnionOfMembers<A, MergedDefs, Depth>
                        : S extends { if: unknown }
                          ? /** if/then/else: infer base schema without conditionals. */
                            FromJSONSchema<
                                Omit<S, "if" | "then" | "else">,
                                MergedDefs,
                                Depth
                            >
                          : S extends { not: unknown }
                            ? /** not: TypeScript cannot negate types. */
                              unknown
                            : S extends { const: infer V }
                              ? V
                              : S extends { enum: infer E }
                                ? ArrayToUnion<E>
                                : S extends { type: infer T }
                                  ? TypeToTs<T, S, MergedDefs, Depth>
                                  : S extends readonly (infer E)[]
                                    ? E
                                    : unknown
        : unknown;

/**
 * Merge `$defs` / `definitions` declared at the current schema position with
 * the caller-supplied `Defs` map BEFORE the ref/allOf/anyOf/oneOf dispatch.
 *
 * SOURCE-OF-TRUTH: parity with the runtime walker, which uses `rootDocument`
 * (see `packages/core/src/core/ref.ts` line 91) to resolve any `$ref` against
 * the full document — including sibling definitions colocated with the
 * reference. Without this merge, a legal schema like
 * `{ $ref: "#/definitions/Foo", definitions: { Foo: {...} } }` would lose
 * its sibling defs because the ref branch fires before `ExtractDefs` runs
 * inside `ObjectSchemaToTs`.
 *
 * Merge semantics (per-key resolution via {@link CollisionSafeMerge}):
 * - Parent-only keys: parent value wins
 * - Local-only keys: local value wins
 * - Shared keys: parent value wins (caller / inherited context takes
 *   precedence over a deeper redeclaration)
 *
 * When the current schema declares no local defs (`HasLocalDefs<S>` is
 * `false`), `ParentDefs` is returned unchanged so the inherited context
 * is never poisoned by the empty index-signature sentinel.
 */
type MergeRootDefs<S, ParentDefs extends Record<string, unknown>> =
    HasLocalDefs<S> extends true
        ? ExtractRawDefs<S> extends infer RawDefs extends Record<
              string,
              unknown
          >
            ? CollisionSafeMerge<
                  CollisionSafeMerge<RawDefs, ExtractAnchors<RawDefs>>,
                  ParentDefs
              >
            : ParentDefs
        : ParentDefs;

/**
 * Merge two record-shaped types where keys present in `B` always take
 * precedence over the same key in `A`.
 *
 * The empty default `Record<string, never>` is detected explicitly via
 * {@link IsEmptyDefs}: when either side is the sentinel, the other side
 * is returned unchanged. This avoids two pitfalls of the naive
 * `Omit<A, keyof B> & B` approach:
 *
 * 1. `keyof Record<string, never>` is the entire `string` type, so
 *    `Omit<A, string>` would strip every key from `A`.
 * 2. Iterating a mapped type over `keyof A | keyof B` where either side
 *    contributes `string` collapses every entry to the index-signature
 *    value (`never` in the sentinel), wiping the literal keys from the
 *    other side.
 *
 * Only when both sides hold concrete literal keys does the per-key
 * mapped merge run.
 */
type CollisionSafeMerge<A, B> =
    IsEmptyDefs<A> extends true
        ? B
        : IsEmptyDefs<B> extends true
          ? A
          : {
                [K in keyof A | keyof B]: K extends keyof B
                    ? B[K]
                    : K extends keyof A
                      ? A[K]
                      : never;
            };

/**
 * True for the empty-default `Record<string, never>` sentinel used as the
 * initial `Defs` map — i.e. an open index signature `[string]: never`
 * with no literal keys. Distinguished from a record with at least one
 * literal key by checking that `string extends keyof T`.
 */
type IsEmptyDefs<T> = [keyof T] extends [never]
    ? true
    : string extends keyof T
      ? true
      : false;

/**
 * True when the schema declares `$defs` or `definitions` as an object,
 * false otherwise. Used by {@link MergeRootDefs} and {@link ExtractDefs}
 * to avoid intersecting the parent context with an empty
 * index-signature sentinel.
 */
type HasLocalDefs<S> = S extends { $defs: Record<string, unknown> }
    ? true
    : S extends { definitions: Record<string, unknown> }
      ? true
      : false;

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
 * `any`/`unknown` silently. This number is the runtime walker's parallel
 * — see `resolveRef` in `packages/core/src/core/ref.ts` (line 119), whose
 * default `maxDepth` is `64`. Matching the runtime bound here means a
 * schema that the runtime resolves successfully is never silently dropped
 * to `__SchemaInferenceFellBack` at compile time purely because the
 * type-level limit was lower.
 *
 * A fixed bound is used here rather than a derived one because the type
 * system has no way to count distinct strings across a recursive `Defs`
 * map without itself recursing — which is the problem the bound exists
 * to solve. Real-world OpenAPI documents (Stripe, GitHub, AWS) routinely
 * contain 30-100+ distinct `$ref` strings, so a low ceiling would mask
 * legitimate references. Deeper graphs surface as
 * `__SchemaInferenceFellBack` so consumers can detect the limit
 * explicitly.
 */
export type DEFAULT_MAX_DEPTH = 64;

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
 * - `#/components/schemas/Name` (OpenAPI 3.x component schemas)
 * - `#SomeName` ($anchor, $dynamicAnchor resolved from definitions)
 *
 * `#/components/schemas/` is resolved here for parity with the runtime's
 * `dereference` (`ref.ts` line 217), which walks any `#/...` JSON Pointer
 * uniformly. When the runtime walker encounters an inline `$ref` inside
 * a Zod-converted or hand-written JSON Schema that points into the
 * OpenAPI component tree, this branch produces the corresponding type.
 */
type ResolveSchemaRef<
    R extends string,
    Defs extends Record<string, unknown>,
    Depth extends readonly unknown[] = [],
> = Depth["length"] extends DEFAULT_MAX_DEPTH
    ? __SchemaInferenceFellBack
    : R extends "#"
      ? unknown
      : R extends `#/$defs/${infer Name}`
        ? Name extends keyof Defs
            ? DetectRecursiveFallback<
                  FromJSONSchema<Defs[Name], Defs, [unknown, ...Depth]>
              >
            : unknown
        : R extends `#/definitions/${infer Name}`
          ? Name extends keyof Defs
              ? DetectRecursiveFallback<
                    FromJSONSchema<Defs[Name], Defs, [unknown, ...Depth]>
                >
              : unknown
          : R extends `#/components/schemas/${infer Name}`
            ? Name extends keyof Defs
                ? DetectRecursiveFallback<
                      FromJSONSchema<Defs[Name], Defs, [unknown, ...Depth]>
                  >
                : unknown
            : R extends `#${infer AnchorName}`
              ? AnchorName extends keyof Defs
                  ? DetectRecursiveFallback<
                        FromJSONSchema<
                            Defs[AnchorName],
                            Defs,
                            [unknown, ...Depth]
                        >
                    >
                  : unknown
              : unknown;

/**
 * Merge an allOf array into an intersection type.
 */
type AllOfToType<
    A,
    Defs extends Record<string, unknown>,
    Depth extends readonly unknown[] = [],
> = A extends readonly unknown[]
    ? UnionToIntersection<FromJSONSchema<A[number], Defs, Depth>>
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
    Depth extends readonly unknown[] = [],
> = A extends readonly unknown[]
    ? HasNullMember<A> extends true
        ? Exclude<FromJSONSchema<A[number], Defs, Depth>, null> | null
        : FromJSONSchema<A[number], Defs, Depth>
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
type TypeToTs<
    T,
    S,
    Defs extends Record<string, unknown>,
    Depth extends readonly unknown[] = [],
> = T extends "string"
    ? string
    : T extends "number" | "integer"
      ? number
      : T extends "boolean"
        ? boolean
        : T extends "null"
          ? null
          : T extends "array"
            ? ArraySchemaToTs<S, Defs, Depth>
            : T extends "object"
              ? ObjectSchemaToTs<S, Defs, Depth>
              : T extends readonly (infer E)[]
                ? TypeArrayToTs<E, S, Defs, Depth>
                : unknown;

/**
 * Handle `type` as an array (Draft 04-07): `["string", "null"]`.
 * Filters out "null" and makes the result nullable.
 */
type TypeArrayToTs<
    E,
    S,
    Defs extends Record<string, unknown>,
    Depth extends readonly unknown[] = [],
> = E extends "null"
    ? null
    : E extends "string"
      ? NullableResult<string, S>
      : E extends "number" | "integer"
        ? NullableResult<number, S>
        : E extends "boolean"
          ? NullableResult<boolean, S>
          : E extends "array"
            ? NullableResult<
                  ArraySchemaToTs<OmitArrayHelpers<S>, Defs, Depth>,
                  S
              >
            : E extends "object"
              ? NullableResult<
                    ObjectSchemaToTs<OmitArrayHelpers<S>, Defs, Depth>,
                    S
                >
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
type ArraySchemaToTs<
    S,
    Defs extends Record<string, unknown>,
    Depth extends readonly unknown[] = [],
> = S extends {
    prefixItems: infer P;
}
    ? PrefixItemsToTuple<P, Defs, Depth>
    : S extends { items: infer I extends readonly unknown[] }
      ? /** Draft 04 tuple-form items: rewrite to a tuple at the type level. */
        PrefixItemsToTuple<I, Defs, Depth>
      : S extends { items: infer I }
        ? FromJSONSchema<I, Defs, Depth>[]
        : unknown[];

/**
 * Convert a prefixItems array to a TypeScript tuple type.
 */
type PrefixItemsToTuple<
    P,
    Defs extends Record<string, unknown>,
    Depth extends readonly unknown[] = [],
> = P extends readonly [infer First, ...infer Rest]
    ? [
          FromJSONSchema<First, Defs, Depth>,
          ...PrefixItemsToTuple<Rest, Defs, Depth>,
      ]
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
type ObjectSchemaToTs<
    S,
    Defs extends Record<string, unknown>,
    Depth extends readonly unknown[] = [],
> = S extends {
    type: "object";
    properties: infer P;
}
    ? ExtractDefs<S, Defs> extends infer D extends Record<string, unknown>
        ? MergePatternProps<
              {
                  [K in keyof P as K extends RequiredKeysOf<S>
                      ? K
                      : never]: FromJSONSchema<P[K], D, Depth>;
              } & {
                  [K in keyof P as K extends RequiredKeysOf<S>
                      ? never
                      : K]?: FromJSONSchema<P[K], D, Depth>;
              },
              S,
              D,
              Depth
          >
        : never
    : S extends { additionalProperties: infer V }
      ? Record<string, FromJSONSchema<V, Defs, Depth>>
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
    Depth extends readonly unknown[] = [],
> = S extends { patternProperties: infer PP }
    ? PP extends Record<string, unknown>
        ? Base & Record<string, UnionOfPatternValues<PP, Defs, Depth>>
        : Base
    : Base;

/**
 * Extract the union of all pattern property value types.
 */
type UnionOfPatternValues<
    PP extends Record<string, unknown>,
    Defs extends Record<string, unknown>,
    Depth extends readonly unknown[] = [],
> = { [K in keyof PP]: FromJSONSchema<PP[K], Defs, Depth> }[keyof PP];

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
 * Also indexes schemas with `$anchor` or `$dynamicAnchor` by their anchor
 * name, enabling `#SomeName` ref resolution.
 *
 * Shares merge semantics with {@link MergeRootDefs}: caller-supplied
 * (`ParentDefs`) entries win on key collision, the empty-default
 * sentinel is detected so it does not poison the parent context, and the
 * `HasLocalDefs` guard short-circuits when the current node declares no
 * defs of its own.
 */
type ExtractDefs<S, ParentDefs extends Record<string, unknown>> =
    HasLocalDefs<S> extends true
        ? ExtractRawDefs<S> extends infer RawDefs extends Record<
              string,
              unknown
          >
            ? CollisionSafeMerge<
                  CollisionSafeMerge<RawDefs, ExtractAnchors<RawDefs>>,
                  ParentDefs
              >
            : ParentDefs
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
 * Scans each definition value for `$anchor`, `$dynamicAnchor`, or the
 * Draft 2019-09 `$recursiveAnchor` keyword and creates entries like
 * `{ Tree: <schema-with-$anchor-Tree> }`.
 *
 * SOURCE-OF-TRUTH: mirrors `normaliseDraft201909NodeWithContext` in
 * `packages/core/src/core/normalise.ts` (lines 638-650), which rewrites
 * `$recursiveAnchor: true` to `$anchor: "__recursive__"` and a string
 * `$recursiveAnchor: "name"` to `$anchor: "name"`. The corresponding
 * `$recursiveRef: "#"` therefore resolves through the same `Defs` map
 * as a modern `$ref: "#__recursive__"`.
 */
type ExtractAnchors<D extends Record<string, unknown>> = {
    [K in keyof D as D[K] extends { $anchor: infer A extends string }
        ? A
        : D[K] extends { $dynamicAnchor: infer A extends string }
          ? A
          : D[K] extends { $recursiveAnchor: infer A extends string }
            ? A
            : D[K] extends { $recursiveAnchor: true }
              ? "__recursive__"
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
 * Splits on `/` and navigates the document tree, decoding JSON Pointer
 * tilde escapes (`~1` -> `/`, `~0` -> `~`) on every segment.
 *
 * SOURCE-OF-TRUTH: mirrors runtime `dereference` in
 * `packages/core/src/core/ref.ts` (line 226), which applies the same
 * `~1` -> `/`, `~0` -> `~` substitutions per RFC 6901 §4. The runtime
 * uses ordered string replacement; the type-level mirror does the same
 * via {@link DecodeJsonPointerSegment}.
 */
type ResolvePathBasedRef<
    Spec extends Record<string, unknown>,
    PathRest extends string,
> =
    Spec["paths"] extends Record<string, unknown>
        ? ResolvePathSegments<Spec["paths"], SplitPath<PathRest>>
        : unknown;

/**
 * Replace every occurrence of `From` with `To` inside `S`.
 *
 * Pure type-level alternative to `String.prototype.replaceAll` used for
 * JSON Pointer escape decoding. Terminates when no further match is
 * found in the tail.
 */
type ReplaceAll<
    S extends string,
    From extends string,
    To extends string,
> = S extends `${infer Head}${From}${infer Tail}`
    ? `${Head}${To}${ReplaceAll<Tail, From, To>}`
    : S;

/**
 * Decode a single JSON Pointer reference token per RFC 6901 §4:
 * apply `~1` -> `/` first, then `~0` -> `~`. The order matters — an
 * encoded `~` containing a literal `1` (e.g. `~01`) must remain `~1`
 * after decoding, which only works when `~1` is processed first.
 */
type DecodeJsonPointerSegment<S extends string> = ReplaceAll<
    ReplaceAll<S, "~1", "/">,
    "~0",
    "~"
>;

/**
 * Split a path string on `/` into a tuple of segments.
 * The first segment is the path key (may be empty for `/pets` -> `""` / `"pets"`).
 */
type SplitPath<S extends string> = S extends `${infer Head}/${infer Tail}`
    ? [Head, ...SplitPath<Tail>]
    : [S];

/**
 * Recursively navigate into a document object by path segments. Each
 * segment is JSON-Pointer-decoded before indexing so encoded forms such
 * as `~1pets` correctly resolve to the `"/pets"` key.
 */
type ResolvePathSegments<Doc, Segs extends string[]> = Segs extends [
    infer Head extends string,
    ...infer Rest extends string[],
]
    ? Doc extends Record<string, unknown>
        ? DecodeJsonPointerSegment<Head> extends infer Decoded extends string
            ? Rest extends []
                ? Doc[Decoded]
                : ResolvePathSegments<Doc[Decoded], Rest>
            : unknown
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

/**
 * Extract the schema from request body content (any media type).
 *
 * `Record<string, { schema: infer S }>` already subsumes the previous
 * `application/json`-specific branch — if the JSON content matches the
 * specific shape it also matches the general index-signature pattern.
 * The narrower branch was therefore unreachable and has been removed.
 */
type RequestBodySchemaOf<Op> = Op extends {
    requestBody: { content: Record<string, { schema: infer S }> };
}
    ? S
    : unknown;

/**
 * Extract the schema from response content (any media type).
 *
 * Same rationale as `RequestBodySchemaOf`: the index-signature branch
 * subsumes the `application/json` branch, which was unreachable.
 */
type ResponseSchemaOf<Op, Status extends string> = Op extends {
    responses: Record<string, unknown>;
}
    ? Status extends keyof Op["responses"]
        ? Op["responses"][Status] extends {
              content: Record<string, { schema: infer S }>;
          }
            ? S
            : unknown
        : unknown
    : unknown;

/**
 * Resolve a schema that may be a `$ref` pointer.
 *
 * The `nullable: true` handling lives inside `FromJSONSchema` so it
 * applies uniformly to direct schemas, refs, and nested fields. This
 * helper only dispatches between ref-resolution and plain inference.
 */
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
 * Detect whether a document is Swagger 2.0 (OpenAPI 2.0).
 *
 * SOURCE-OF-TRUTH: mirrors runtime `isSwagger2` in
 * `packages/core/src/core/version.ts` (line 305), which parses the
 * `swagger` field via `detectOpenApiVersion` (line 264) and returns true
 * for any document whose major version is `2`. Runtime therefore accepts
 * `"2.0"`, `"2.0.0"`, `"2.1"`, and any other `2.x` form — so the
 * type-level detector must too.
 *
 * Type-level Swagger 2.0 documents cannot be fully normalised at compile
 * time — the rewrite reorders the document tree (definitions →
 * components/schemas, body parameters → requestBody, etc.) in ways
 * TypeScript's mapped-type machinery cannot express. Detecting the
 * version is tractable, so we surface `__SchemaInferenceFellBack`
 * deliberately rather than silently producing `unknown`.
 *
 * Two shapes are accepted:
 * - `{ swagger: "2.<anything>" }` — the on-the-wire string form
 * - `{ swagger: { major: 2, ... } }` — the parsed `OpenApiVersionInfo`
 *   object form, mirroring the runtime's tolerance for pre-parsed
 *   version metadata
 */
type IsSwagger2Doc<Doc> = Doc extends { swagger: `2.${string}` }
    ? true
    : Doc extends { swagger: { major: 2 } }
      ? true
      : false;

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
> =
    IsSwagger2Doc<Doc> extends true
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
> =
    IsSwagger2Doc<Doc> extends true
        ? __SchemaInferenceFellBack
        : ResolveMaybeRef<
              Doc,
              ResponseSchemaOf<
                  OperationOf<PathItemOf<Doc, Path>, Method>,
                  Status
              >
          >;

/**
 * Convert a resolved request/response type into the corresponding
 * `fields` prop type used by ApiRequestBody / ApiResponse:
 *
 * - `__SchemaInferenceFellBack` (Swagger 2.0, depth-exceeded refs) is
 *   preserved verbatim so callers can detect the brand.
 * - `unknown` (no schema found at the supplied path/status) falls back
 *   to the loose `Record<string, FieldOverride>` shape so runtime
 *   documents still typecheck.
 * - Any other concrete type is mapped through `FieldOverrides`.
 *
 * The brand check intentionally precedes the `unknown` check. The brand
 * is a structural object type and is therefore NOT assignable to
 * `unknown extends T` — checking that first would always short-circuit
 * to the loose `Record` fallback and the brand would never surface.
 */
type FieldsFromInferred<T> = [T] extends [__SchemaInferenceFellBack]
    ? __SchemaInferenceFellBack
    : unknown extends T
      ? Record<string, FieldOverride>
      : FieldOverrides<T>;

/**
 * Infer the fields prop type for ApiRequestBody.
 *
 * Surfaces `__SchemaInferenceFellBack` for Swagger 2.0 documents and
 * for schemas whose $ref chains exceed type-level depth limits. Falls
 * back to `Record<string, FieldOverride>` for runtime documents whose
 * shape cannot be inferred at compile time.
 */
export type InferRequestBodyFields<
    Doc,
    Path extends string,
    Method extends string,
> = FieldsFromInferred<OpenAPIRequestBodyType<Doc, Path, Method>>;

/**
 * Infer the fields prop type for ApiResponse.
 *
 * Surfaces `__SchemaInferenceFellBack` for Swagger 2.0 documents and
 * for schemas whose $ref chains exceed type-level depth limits. Falls
 * back to `Record<string, FieldOverride>` for runtime documents whose
 * shape cannot be inferred at compile time.
 */
export type InferResponseFields<
    Doc,
    Path extends string,
    Method extends string,
    Status extends string,
> = FieldsFromInferred<OpenAPIResponseType<Doc, Path, Method, Status>>;

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
