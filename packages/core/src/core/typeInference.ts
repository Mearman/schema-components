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
import type { MaxRefDepth } from "./limits.ts";
import type { FieldOverride, FieldOverrides } from "./types.ts";

// ---------------------------------------------------------------------------
// Static rejection of unrepresentable Zod 4 types
// ---------------------------------------------------------------------------

/**
 * Zod 4 types that have no useful JSON Schema representation and so
 * cannot meaningfully be rendered by schema-components. The runtime
 * adapter (`packages/core/src/core/adapter.ts`, see the
 * `zod-type-unrepresentable` classifier rules) catches the thrown
 * error and surfaces it as a `SchemaNormalisationError` — but for
 * the runtime-throwing variants the failure only happens on first
 * render. Statically rejecting these types at the props boundary
 * gives the same diagnostic at compile time.
 *
 * Two categories are listed:
 *
 * 1. **Runtime-throwing.** `z.toJSONSchema()` itself throws when it
 *    encounters one of these — bigint, date, map, set, symbol,
 *    function, custom, undefined, void, nan, codec. Source-of-truth
 *    is the classifier in `adapter.ts` (search for
 *    `zod-type-unrepresentable`).
 * 2. **Statically rejected by schema-components.** `z.toJSONSchema()`
 *    accepts these without throwing, but the resulting JSON Schema
 *    is either degenerate (`ZodNever` becomes `{ not: {} }`,
 *    contributing nothing renderable) or the async/Promise dimension
 *    is dropped silently (`ZodPromise` is unwrapped to its inner
 *    type with no signal to the consumer). Both surface here so the
 *    rejection is explicit at the type level even though the runtime
 *    is permissive.
 *
 * Names mirror the Zod 4 classic interface exports in
 * `node_modules/zod/v4/classic/schemas.d.cts`.
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
    | z.ZodCodec
    | z.ZodCustom
    | z.ZodNever
    | z.ZodPromise;

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
 * Direction of inference for `FromJSONSchema`.
 *
 * JSON Schema's `readOnly` / `writeOnly` keywords carry directional
 * semantics: a `readOnly` property must not appear in client → server
 * payloads, and a `writeOnly` property must not appear in server →
 * client payloads. Mapping a schema to a TypeScript type therefore
 * requires knowing which direction the value travels.
 *
 * - `"both"` — return every property regardless of `readOnly` /
 *   `writeOnly`. Default, preserves the prior behaviour for callers
 *   that do not care about the distinction.
 * - `"input"` — omit properties marked `readOnly: true`. Use for the
 *   shape consumers may supply (e.g. `onChange` arguments, POST
 *   bodies).
 * - `"output"` — omit properties marked `writeOnly: true`. Use for
 *   the shape the server returns (e.g. rendered `value` props, GET
 *   responses).
 */
export type FromJSONSchemaMode = "input" | "output" | "both";

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
 * - object with properties + additionalProperties -> object & Record<string, V>
 * - object with additionalProperties only -> Record<string, T>
 * - array with items -> T[]
 * - array with prefixItems -> tuple type
 * - allOf -> intersection type
 * - anyOf -> union type
 * - oneOf -> union type (plain union, or tagged union when `discriminator` is set)
 * - $ref -> resolved via $defs/definitions/$anchor context
 * - $dynamicRef -> resolved via $dynamicAnchor in definitions
 * - $recursiveRef -> unknown (recursive types not expressible in TS)
 * - if/then/else -> base schema (conditionals not expressible in TS)
 * - not -> unknown (negation not expressible in TS)
 * - patternProperties -> merged into loose index signature
 *
 * The `Mode` parameter controls how `readOnly` / `writeOnly` keywords
 * influence inferred object properties — see {@link FromJSONSchemaMode}.
 */
export type FromJSONSchema<
    S,
    Defs extends Record<string, unknown> = Record<string, never>,
    Depth extends readonly unknown[] = [],
    Mode extends FromJSONSchemaMode = "both",
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
              FromJSONSchema<
                  Omit<S, "nullable">,
                  MergedDefs,
                  Depth,
                  Mode
              > | null
            : S extends { $ref: infer R extends string }
              ? ResolveSchemaRef<R, MergedDefs, Depth, Mode>
              : S extends { $recursiveRef: string }
                ? /** $recursiveRef: TypeScript cannot express recursive types. */
                  unknown
                : S extends { $dynamicRef: infer R extends string }
                  ? ResolveSchemaRef<R, MergedDefs, Depth, Mode>
                  : S extends { allOf: infer A }
                    ? AllOfToType<A, MergedDefs, Depth, Mode>
                    : S extends { anyOf: infer A }
                      ? UnionOfMembers<A, MergedDefs, Depth, Mode>
                      : S extends {
                              oneOf: infer A;
                              discriminator: {
                                  propertyName: infer DP extends string;
                              };
                          }
                        ? DiscriminatedOneOfToUnion<
                              A,
                              DP,
                              GetDiscriminatorMapping<S>,
                              MergedDefs,
                              Depth,
                              Mode
                          >
                        : S extends { oneOf: infer A }
                          ? UnionOfMembers<A, MergedDefs, Depth, Mode>
                          : S extends { if: unknown }
                            ? /** if/then/else: infer base schema without conditionals. */
                              FromJSONSchema<
                                  Omit<S, "if" | "then" | "else">,
                                  MergedDefs,
                                  Depth,
                                  Mode
                              >
                            : S extends { not: unknown }
                              ? /** not: TypeScript cannot negate types. */
                                unknown
                              : S extends { const: infer V }
                                ? V
                                : S extends { enum: infer E }
                                  ? ArrayToUnion<E>
                                  : S extends { type: infer T }
                                    ? TypeToTs<T, S, MergedDefs, Depth, Mode>
                                    : S extends readonly (infer E)[]
                                      ? E
                                      : unknown
        : unknown;

/**
 * Extract the `discriminator.mapping` map if present, otherwise the
 * empty sentinel. Used by {@link DiscriminatedOneOfToUnion} to inject
 * the discriminator literal into members referenced via $ref.
 */
type GetDiscriminatorMapping<S> = S extends {
    discriminator: { mapping: infer M extends Record<string, string> };
}
    ? M
    : Record<string, never>;

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
 * Merge semantics (per-key resolution via `CollisionSafeMerge`):
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
 * True when the schema declares `$defs`, `definitions`, or
 * `components.schemas` as an object, false otherwise. Used by
 * `MergeRootDefs` and `ExtractDefs` to avoid intersecting
 * the parent context with an empty index-signature sentinel.
 *
 * `components.schemas` is recognised so OpenAPI documents whose root
 * `oneOf`/`anyOf`/`$ref` schemas point into the components tree resolve
 * via the same `Defs` map as `$defs`/`definitions` entries.
 */
type HasLocalDefs<S> = S extends { $defs: Record<string, unknown> }
    ? true
    : S extends { definitions: Record<string, unknown> }
      ? true
      : S extends { components: { schemas: Record<string, unknown> } }
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
 * cannot proceed. Typed as a map from field name (any string except
 * the brand key) to `FieldOverride`, branded with a **required**
 * discriminator so the unsafe path is an explicit opt-in rather than
 * a silent default.
 *
 * Earlier revisions made the brand optional (`__unsafe?: true`).
 * That defeated the brand's purpose: any plain `Record<string,
 * FieldOverride>` literal silently satisfied the type and the
 * "unsafe" intent was invisible to readers and reviewers. Marking
 * the brand required forces callers to write `{ __unsafe: true,
 * ... }`, making the escape-hatch use visible at the call site.
 *
 * The brand key is carved out of the field-name index signature so
 * `__unsafe: true` does not collide with the `FieldOverride` value
 * constraint — an index signature `[string]: FieldOverride` would
 * otherwise reject the boolean literal.
 *
 * JSDoc trade-off note: This bypasses field-level type safety.
 * Prefer restructuring the schema to avoid deep $ref chains
 * when possible.
 */
export interface UnsafeFields {
    /**
     * Required marker — set to `true` to acknowledge that callers
     * are deliberately bypassing field-level inference. The literal
     * value is not used at runtime.
     */
    readonly __unsafe: true;
    /**
     * Field overrides keyed by name. The recursive `Record` exclusion
     * prevents the brand from being assigned through the index
     * signature.
     */
    readonly [field: string]: FieldOverride | true;
}

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
export type DEFAULT_MAX_DEPTH = MaxRefDepth;

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
    Mode extends FromJSONSchemaMode = "both",
> = Depth["length"] extends DEFAULT_MAX_DEPTH
    ? __SchemaInferenceFellBack
    : R extends "#"
      ? unknown
      : R extends `#/$defs/${infer Name}`
        ? Name extends keyof Defs
            ? DetectRecursiveFallback<
                  FromJSONSchema<Defs[Name], Defs, [unknown, ...Depth], Mode>
              >
            : unknown
        : R extends `#/definitions/${infer Name}`
          ? Name extends keyof Defs
              ? DetectRecursiveFallback<
                    FromJSONSchema<Defs[Name], Defs, [unknown, ...Depth], Mode>
                >
              : unknown
          : R extends `#/components/schemas/${infer Name}`
            ? Name extends keyof Defs
                ? DetectRecursiveFallback<
                      FromJSONSchema<
                          Defs[Name],
                          Defs,
                          [unknown, ...Depth],
                          Mode
                      >
                  >
                : unknown
            : R extends `#${infer AnchorName}`
              ? AnchorName extends keyof Defs
                  ? DetectRecursiveFallback<
                        FromJSONSchema<
                            Defs[AnchorName],
                            Defs,
                            [unknown, ...Depth],
                            Mode
                        >
                    >
                  : unknown
              : unknown;

/**
 * Merge an allOf array into an intersection type.
 *
 * KNOWN LIMITATION: when any member of the `allOf` array is itself a
 * union (e.g. produced by an `anyOf` inside one member), distribution
 * across the intersection does not always behave as a hand-written
 * intersection would. `(A | B) & C` distributes to `(A & C) | (B & C)`,
 * but TypeScript's mapped-type machinery — combined with the conditional
 * dispatch above — does not always recover that distribution when the
 * union arises from a `FromJSONSchema` expansion. The pinned regression
 * test `allOf of unions is treated as the intersection of the union
 * members` in `tests/type-inference-issue-fixes.test.ts` documents the
 * current behaviour so future refactors do not silently make it worse.
 * There is no known way to express "distribute every member-side union
 * across the intersection" in TypeScript today without losing the
 * non-union members' information.
 */
type AllOfToType<
    A,
    Defs extends Record<string, unknown>,
    Depth extends readonly unknown[] = [],
    Mode extends FromJSONSchemaMode = "both",
> = A extends readonly unknown[]
    ? UnionToIntersection<FromJSONSchema<A[number], Defs, Depth, Mode>>
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
    Mode extends FromJSONSchemaMode = "both",
> = A extends readonly unknown[]
    ? HasNullMember<A> extends true
        ? Exclude<FromJSONSchema<A[number], Defs, Depth, Mode>, null> | null
        : FromJSONSchema<A[number], Defs, Depth, Mode>
    : unknown;

/**
 * Convert an OpenAPI 3.x `oneOf` + `discriminator` schema into a true
 * tagged union by injecting the discriminator literal value into each
 * member at the property named `PropertyName`.
 *
 * Resolution rules per OpenAPI 3.x §4.7.25 (Discriminator Object):
 *
 * - When the member is a `$ref` and `Mapping` contains an entry whose
 *   value equals the ref string, the entry key is used as the
 *   discriminator literal — this is the explicit mapping form. When
 *   no mapping entry matches, the ref's terminal name (the segment
 *   after the last `/`) is used per the implicit-mapping rule.
 * - When the member is an inline schema and already declares a
 *   `const` value at `PropertyName`, that const is the discriminator
 *   value; the member's parsed type already carries the literal so
 *   no injection is required.
 * - When the member is an inline schema without a `const` at
 *   `PropertyName`, the discriminator value cannot be inferred at
 *   the type level — fall through to the plain union.
 *
 * KNOWN LIMITATION: discriminator mappings whose values are external
 * `$ref`s (e.g. `"#/components/schemas/SomeType"` defined in a
 * different document) cannot be resolved at the type level because
 * `FromJSONSchema` only sees the local `Defs` map. For external
 * mappings the result falls back to the plain union of members.
 */
type DiscriminatedOneOfToUnion<
    A,
    PropertyName extends string,
    Mapping extends Record<string, string>,
    Defs extends Record<string, unknown>,
    Depth extends readonly unknown[],
    Mode extends FromJSONSchemaMode,
> = A extends readonly unknown[]
    ? HasNullMember<A> extends true
        ? Exclude<
              DistributeDiscriminator<
                  A[number],
                  PropertyName,
                  Mapping,
                  Defs,
                  Depth,
                  Mode
              >,
              null
          > | null
        : DistributeDiscriminator<
              A[number],
              PropertyName,
              Mapping,
              Defs,
              Depth,
              Mode
          >
    : unknown;

/**
 * For each member of the discriminated `oneOf`, parse the member via
 * `FromJSONSchema` and intersect with the discriminator literal when
 * one can be derived from the mapping table or the implicit ref name.
 */
type DistributeDiscriminator<
    M,
    PropertyName extends string,
    Mapping extends Record<string, string>,
    Defs extends Record<string, unknown>,
    Depth extends readonly unknown[],
    Mode extends FromJSONSchemaMode,
> = M extends { $ref: infer R extends string }
    ? FromJSONSchema<M, Defs, Depth, Mode> &
          Record<PropertyName, DiscriminatorLiteralFor<R, Mapping>>
    : FromJSONSchema<M, Defs, Depth, Mode>;

/**
 * Resolve the literal discriminator value for a `$ref` string. First
 * checks the explicit `Mapping` for any entry whose value equals the
 * ref; falls back to the trailing path segment if no mapping match is
 * found. `[K] extends [never]` short-circuits the empty-mapping case
 * without colliding with the `K = never` distribution rules.
 */
type DiscriminatorLiteralFor<
    R extends string,
    Mapping extends Record<string, string>,
> = [LookupMappingKey<R, Mapping>] extends [never]
    ? RefTerminalName<R>
    : LookupMappingKey<R, Mapping>;

/**
 * Find the key in `Mapping` whose value equals `R`. Returns the union
 * of matching keys, or `never` when no key matches.
 */
type LookupMappingKey<
    R extends string,
    Mapping extends Record<string, string>,
> = {
    [K in keyof Mapping]: Mapping[K] extends R ? K : never;
}[keyof Mapping];

/** Last `/`-delimited segment of a ref string, or the ref itself. */
type RefTerminalName<R extends string> = R extends `${string}/${infer Rest}`
    ? RefTerminalName<Rest>
    : R;

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
    Mode extends FromJSONSchemaMode = "both",
> = T extends "string"
    ? string
    : T extends "number" | "integer"
      ? number
      : T extends "boolean"
        ? boolean
        : T extends "null"
          ? null
          : T extends "array"
            ? ArraySchemaToTs<S, Defs, Depth, Mode>
            : T extends "object"
              ? ObjectSchemaToTs<S, Defs, Depth, Mode>
              : T extends readonly (infer E)[]
                ? TypeArrayToTs<E, S, Defs, Depth, Mode>
                : unknown;

/**
 * Handle `type` as an array (Draft 04-07): `["string", "null"]`.
 * Filters out "null" and makes the result nullable.
 *
 * Earlier revisions ran the array / object branches through
 * `OmitArrayHelpers` to strip `prefixItems`, `items`, and
 * `additionalProperties` before re-parsing. That was a bug: the strip
 * stopped the type-array form from carrying any element / property
 * information, so `{ type: ["array", "null"], items: { type: "string" } }`
 * collapsed to `unknown[] | null` instead of `string[] | null`. The
 * helper still parses the same schema, only without the unnecessary
 * key removal. The regression is pinned in
 * `tests/type-inference-issue-fixes.test.ts` via the
 * `type: ["array", "null"] preserves items` case.
 */
type TypeArrayToTs<
    E,
    S,
    Defs extends Record<string, unknown>,
    Depth extends readonly unknown[] = [],
    Mode extends FromJSONSchemaMode = "both",
> = E extends "null"
    ? null
    : E extends "string"
      ? NullableResult<string, S>
      : E extends "number" | "integer"
        ? NullableResult<number, S>
        : E extends "boolean"
          ? NullableResult<boolean, S>
          : E extends "array"
            ? NullableResult<ArraySchemaToTs<S, Defs, Depth, Mode>, S>
            : E extends "object"
              ? NullableResult<ObjectSchemaToTs<S, Defs, Depth, Mode>, S>
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
    Mode extends FromJSONSchemaMode = "both",
> = S extends {
    prefixItems: infer P;
}
    ? PrefixItemsToTuple<P, Defs, Depth, Mode>
    : S extends { items: infer I extends readonly unknown[] }
      ? /** Draft 04 tuple-form items: rewrite to a tuple at the type level. */
        PrefixItemsToTuple<I, Defs, Depth, Mode>
      : S extends { items: infer I }
        ? FromJSONSchema<I, Defs, Depth, Mode>[]
        : unknown[];

/**
 * Convert a prefixItems array to a TypeScript tuple type.
 */
type PrefixItemsToTuple<
    P,
    Defs extends Record<string, unknown>,
    Depth extends readonly unknown[] = [],
    Mode extends FromJSONSchemaMode = "both",
> = P extends readonly [infer First, ...infer Rest]
    ? [
          FromJSONSchema<First, Defs, Depth, Mode>,
          ...PrefixItemsToTuple<Rest, Defs, Depth, Mode>,
      ]
    : [];

/**
 * Parse an object schema: properties + required -> specific object,
 * additionalProperties -> Record, or empty object.
 *
 * Handles:
 * - `properties` + `required` -> specific object type with required/optional keys
 * - `additionalProperties` as schema -> Record<string, T>
 * - `properties` + `additionalProperties` -> base object intersected with
 *   `Record<string, V>`, preserving the typed value shape of the extra props
 * - `patternProperties` -> merged into a loose index signature alongside specific props
 *   (TypeScript cannot express regex-keyed properties)
 * - `propertyNames` -> ignored at type level (TS cannot validate key shapes)
 * - `dependentSchemas` / `dependentRequired` -> ignored (runtime-only conditionals)
 * - `unevaluatedProperties` -> ignored (runtime-only)
 *
 * Properties marked `readOnly: true` are omitted when `Mode` is
 * `"input"`; properties marked `writeOnly: true` are omitted when
 * `Mode` is `"output"`. `Mode = "both"` (the default) ignores both
 * keywords and preserves prior behaviour.
 */
type ObjectSchemaToTs<
    S,
    Defs extends Record<string, unknown>,
    Depth extends readonly unknown[] = [],
    Mode extends FromJSONSchemaMode = "both",
> = S extends {
    type: "object";
    properties: infer P;
}
    ? ExtractDefs<S, Defs> extends infer D extends Record<string, unknown>
        ? MergePatternProps<
              MergeAdditionalProperties<
                  {
                      [K in keyof P as K extends RequiredKeysOf<S>
                          ? IsPropertyHidden<P[K], Mode> extends true
                              ? never
                              : K
                          : never]: FromJSONSchema<P[K], D, Depth, Mode>;
                  } & {
                      [K in keyof P as K extends RequiredKeysOf<S>
                          ? never
                          : IsPropertyHidden<P[K], Mode> extends true
                            ? never
                            : K]?: FromJSONSchema<P[K], D, Depth, Mode>;
                  },
                  S,
                  D,
                  Depth,
                  Mode
              >,
              S,
              D,
              Depth,
              Mode
          >
        : never
    : S extends { additionalProperties: infer V }
      ? Record<string, FromJSONSchema<V, Defs, Depth, Mode>>
      : Record<string, unknown>;

/**
 * Decide whether a property should be omitted from the inferred type
 * for the supplied `Mode`. `readOnly: true` properties are excluded
 * from `"input"` mode (POST bodies, `onChange` arguments) and
 * `writeOnly: true` properties are excluded from `"output"` mode
 * (rendered values, GET responses). `"both"` is the permissive
 * default and never hides anything.
 */
type IsPropertyHidden<P, Mode extends FromJSONSchemaMode> = Mode extends "input"
    ? P extends { readOnly: true }
        ? true
        : false
    : Mode extends "output"
      ? P extends { writeOnly: true }
          ? true
          : false
      : false;

/**
 * Intersect the base object type with `Record<string, V>` when the
 * schema declares `additionalProperties` as a schema in addition to
 * `properties`. Without this branch the inferred type silently dropped
 * the value-type information for the extra props, leaving consumers
 * with no way to type un-named keys that the schema explicitly permits.
 *
 * `additionalProperties: false` keeps the base unchanged (no extra
 * keys are allowed); `additionalProperties: true` widens the value
 * type to `unknown`; an inline schema produces a typed index
 * signature.
 */
type MergeAdditionalProperties<
    Base,
    S,
    Defs extends Record<string, unknown>,
    Depth extends readonly unknown[],
    Mode extends FromJSONSchemaMode,
> = S extends { additionalProperties: false }
    ? Base
    : S extends { additionalProperties: true }
      ? Base & Record<string, unknown>
      : S extends { additionalProperties: infer V }
        ? Base & Record<string, FromJSONSchema<V, Defs, Depth, Mode>>
        : Base;

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
    Mode extends FromJSONSchemaMode = "both",
> = S extends { patternProperties: infer PP }
    ? PP extends Record<string, unknown>
        ? Base & Record<string, UnionOfPatternValues<PP, Defs, Depth, Mode>>
        : Base
    : Base;

/**
 * Extract the union of all pattern property value types.
 */
type UnionOfPatternValues<
    PP extends Record<string, unknown>,
    Defs extends Record<string, unknown>,
    Depth extends readonly unknown[] = [],
    Mode extends FromJSONSchemaMode = "both",
> = {
    [K in keyof PP]: FromJSONSchema<PP[K], Defs, Depth, Mode>;
}[keyof PP];

/**
 * Extract the `required` array from a schema as a union of string literals.
 *
 * Accepts both the `as const` readonly tuple form and a plain mutable
 * `string[]` literal. The mutable form arises when a hand-written
 * schema literal omits `as const` on the `required` field — without
 * the second branch the conditional silently resolves to `never` and
 * every property is marked optional, which is a silent footgun. See
 * the regression test `RequiredKeysOf accepts widened string[] arrays`
 * in `tests/type-inference-issue-fixes.test.ts`.
 */
type RequiredKeysOf<S> = S extends { required: infer R }
    ? R extends readonly string[]
        ? R[number]
        : R extends string[]
          ? R[number]
          : never
    : never;

/**
 * Extract $defs / definitions from a schema for $ref resolution context.
 * Also indexes schemas with `$anchor` or `$dynamicAnchor` by their anchor
 * name, enabling `#SomeName` ref resolution.
 *
 * Shares merge semantics with `MergeRootDefs`: caller-supplied
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

/**
 * Extract raw `$defs` / `definitions` / `components.schemas` maps.
 *
 * Multiple keys may be present in a single schema (e.g. an OpenAPI
 * document that also declares `$defs` for a Zod-converted subtree).
 * `CollisionSafeMerge` resolves overlaps so the first non-empty source
 * wins, mirroring the runtime's preference for `$defs` over the legacy
 * `definitions` / `components.schemas` locations.
 */
type ExtractRawDefs<S> = CollisionSafeMerge<
    CollisionSafeMerge<RawDefsOf<S>, RawDefinitionsOf<S>>,
    RawComponentSchemasOf<S>
>;

type RawDefsOf<S> = S extends { $defs: infer D }
    ? D extends Record<string, unknown>
        ? D
        : Record<string, never>
    : Record<string, never>;

type RawDefinitionsOf<S> = S extends { definitions: infer D }
    ? D extends Record<string, unknown>
        ? D
        : Record<string, never>
    : Record<string, never>;

type RawComponentSchemasOf<S> = S extends {
    components: { schemas: infer D };
}
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
 *
 * When the resolved schema itself contains nested `$ref`s, the helper
 * seeds {@link FromJSONSchema}'s `Defs` parameter with the document's
 * `components.schemas` (OAS 3.x) and `definitions` (Swagger 2.0) maps
 * so the nested refs resolve correctly. `Depth` is threaded too so the
 * recursion budget is shared with the calling context. Earlier
 * revisions called `FromJSONSchema<...>` with the empty defaults and
 * silently produced `unknown` for any nested ref.
 */
export type ResolveOpenAPIRef<
    Spec extends Record<string, unknown>,
    Ref extends string,
    Depth extends readonly unknown[] = [],
    Mode extends FromJSONSchemaMode = "both",
> =
    SpecDefs<Spec> extends infer Defs extends Record<string, unknown>
        ? Ref extends `#/components/schemas/${infer Name}`
            ? Spec["components"] extends Record<string, unknown>
                ? Spec["components"]["schemas"] extends Record<string, unknown>
                    ? Name extends keyof Spec["components"]["schemas"]
                        ? FromJSONSchema<
                              Spec["components"]["schemas"][Name],
                              Defs,
                              Depth,
                              Mode
                          >
                        : unknown
                    : unknown
                : unknown
            : Ref extends `#/definitions/${infer Name}`
              ? Spec["definitions"] extends Record<string, unknown>
                  ? Name extends keyof Spec["definitions"]
                      ? FromJSONSchema<
                            Spec["definitions"][Name],
                            Defs,
                            Depth,
                            Mode
                        >
                      : unknown
                  : unknown
              : Ref extends `#/paths/${infer PathRest}`
                ? ResolvePathBasedRef<Spec, PathRest>
                : unknown
        : unknown;

/**
 * Build the `Defs` map for an OpenAPI document by combining
 * `components.schemas` (OAS 3.x) and `definitions` (Swagger 2.0).
 *
 * Both keys are accepted so a single helper handles both versions of
 * the spec. {@link CollisionSafeMerge} ensures the OAS-3.x entries
 * take precedence when both are present, matching the runtime
 * preference for components/schemas over the legacy definitions field.
 */
type SpecDefs<Spec> =
    ExtractComponentsSchemas<Spec> extends infer C extends Record<
        string,
        unknown
    >
        ? ExtractDefinitions<Spec> extends infer D extends Record<
              string,
              unknown
          >
            ? CollisionSafeMerge<D, C>
            : C
        : Record<string, never>;

/** Extract `components.schemas` from a spec, or the empty sentinel. */
type ExtractComponentsSchemas<Spec> = Spec extends {
    components: { schemas: infer S };
}
    ? S extends Record<string, unknown>
        ? S
        : Record<string, never>
    : Record<string, never>;

/** Extract `definitions` from a spec, or the empty sentinel. */
type ExtractDefinitions<Spec> = Spec extends { definitions: infer D }
    ? D extends Record<string, unknown>
        ? D
        : Record<string, never>
    : Record<string, never>;

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
 * Default content type preferred when callers do not specify one.
 *
 * `"application/json"` matches the most common OpenAPI convention and
 * keeps prior `FromJSONSchema` behaviour for the common case. When the
 * default content type is absent from an operation, the helpers below
 * fall back to the first declared media type — matching the runtime
 * resolver's first-match semantics.
 */
export type DEFAULT_OPENAPI_CONTENT_TYPE = "application/json";

/**
 * Pick the content type to use for a request/response when the caller
 * supplies one explicitly: when `ContentType` is present in `Content`
 * use it verbatim, otherwise fall through to the default content type
 * if present, otherwise pick the first key.
 */
type PickContentType<Content, ContentType extends string> =
    Content extends Record<string, unknown>
        ? ContentType extends keyof Content
            ? ContentType
            : DEFAULT_OPENAPI_CONTENT_TYPE extends keyof Content
              ? DEFAULT_OPENAPI_CONTENT_TYPE
              : FirstKey<Content>
        : never;

/** First string key of an object type, or `never` for an empty map. */
type FirstKey<O> = keyof O extends infer K
    ? K extends string
        ? K
        : never
    : never;

/**
 * Extract the schema for a specific content type from a request body
 * Content map.
 *
 * The caller's `ContentType` selects the media type: it falls back to
 * `DEFAULT_OPENAPI_CONTENT_TYPE` and then to the first declared media
 * type when the requested one is absent.
 */
type RequestBodySchemaOf<
    Op,
    ContentType extends string = DEFAULT_OPENAPI_CONTENT_TYPE,
> = Op extends { requestBody: { content: infer C } }
    ? PickContentType<C, ContentType> extends infer K extends string
        ? C extends Record<string, unknown>
            ? K extends keyof C
                ? C[K] extends { schema: infer S }
                    ? S
                    : unknown
                : unknown
            : unknown
        : unknown
    : unknown;

/**
 * Extract the schema for a specific status code and content type from
 * a response map.
 *
 * Status-code resolution mirrors the OpenAPI 3.x §4.7.10 priority order:
 *
 * 1. The literal status (e.g. `"200"`) — exact match.
 * 2. The class wildcard (e.g. `"2XX"`) derived from the leading digit.
 * 3. The `"default"` key.
 *
 * Without this fallback, querying a concrete status against a document
 * that declares only `"2XX"` or `"default"` would silently produce
 * `unknown`. The runtime resolver applies the same fall-through
 * behaviour in `resolveResponse`.
 */
type ResponseSchemaOf<
    Op,
    Status extends string,
    ContentType extends string = DEFAULT_OPENAPI_CONTENT_TYPE,
> = Op extends { responses: infer Rs extends Record<string, unknown> }
    ? PickResponse<Rs, Status> extends infer Resp
        ? Resp extends { content: infer C }
            ? PickContentType<C, ContentType> extends infer K extends string
                ? C extends Record<string, unknown>
                    ? K extends keyof C
                        ? C[K] extends { schema: infer S }
                            ? S
                            : unknown
                        : unknown
                    : unknown
                : unknown
            : unknown
        : unknown
    : unknown;

/**
 * Resolve a response entry from a status code following the OpenAPI
 * priority order: concrete > class wildcard > `default`. When none of
 * the three matches, the result is `never` and the caller's outer
 * conditional falls through to `unknown`.
 */
type PickResponse<Rs, Status extends string> = Status extends keyof Rs
    ? Rs[Status]
    : StatusClassWildcard<Status> extends infer Wildcard extends string
      ? Wildcard extends keyof Rs
          ? Rs[Wildcard]
          : "default" extends keyof Rs
            ? Rs["default"]
            : never
      : "default" extends keyof Rs
        ? Rs["default"]
        : never;

/**
 * Derive the class wildcard (`"2XX"`, `"4XX"`, etc.) for a numeric
 * status code, or `never` for non-numeric inputs. Only the first digit
 * of the status code participates so `"200"`, `"201"`, `"204"` all map
 * to `"2XX"`.
 */
type StatusClassWildcard<Status extends string> =
    Status extends `${infer D extends "1" | "2" | "3" | "4" | "5"}${string}`
        ? `${D}XX`
        : never;

/**
 * Resolve a schema that may be a `$ref` pointer.
 *
 * The `nullable: true` handling lives inside `FromJSONSchema` so it
 * applies uniformly to direct schemas, refs, and nested fields. This
 * helper only dispatches between ref-resolution and plain inference.
 *
 * Threads `Defs`/`Depth`/`Mode` into both `ResolveOpenAPIRef` and
 * `FromJSONSchema` so a nested `$ref` inside an inline schema is
 * resolved against the same component-schemas context the parent
 * document supplies. Without the propagation, nested refs degraded
 * silently to `unknown`.
 */
type ResolveMaybeRef<
    Doc,
    S,
    Depth extends readonly unknown[] = [],
    Mode extends FromJSONSchemaMode = "both",
> = S extends { $ref: infer R extends string }
    ? ResolveOpenAPIRef<Doc & Record<string, unknown>, R, Depth, Mode>
    : S extends Record<string, unknown>
      ? FromJSONSchema<S, SpecDefs<Doc>, Depth, Mode>
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
 * `"2.0"`, `"2.0.0"`, `"2.1"`, any other `2.x` form — and the numeric
 * literals `2` and `2.0`. The type-level detector must mirror every
 * shape the runtime accepts, otherwise a numeric-versioned document
 * silently bypasses the fallback and produces `unknown` instead of the
 * `__SchemaInferenceFellBack` brand consumers expect.
 *
 * Type-level Swagger 2.0 documents cannot be fully normalised at compile
 * time — the rewrite reorders the document tree (definitions →
 * components/schemas, body parameters → requestBody, etc.) in ways
 * TypeScript's mapped-type machinery cannot express. Detecting the
 * version is tractable, so we surface `__SchemaInferenceFellBack`
 * deliberately rather than silently producing `unknown`.
 *
 * Accepted shapes:
 * - `{ swagger: "2.<anything>" }` — the on-the-wire string form
 * - `{ swagger: 2 }` / `{ swagger: 2.0 }` — numeric on-the-wire form
 *   (some YAML serialisers emit a number rather than a string)
 * - `{ swagger: { major: 2, ... } }` — the parsed `OpenApiVersionInfo`
 *   object form, mirroring the runtime's tolerance for pre-parsed
 *   version metadata
 */
export type IsSwagger2Doc<Doc> = Doc extends { swagger: `2.${string}` }
    ? true
    : Doc extends { swagger: 2 }
      ? true
      : Doc extends { swagger: 2.0 }
        ? true
        : Doc extends { swagger: { major: 2 } }
          ? true
          : false;

/**
 * Infer the TypeScript type of an OpenAPI operation's request body.
 *
 * `ContentType` selects which media type's schema to infer; defaults
 * to {@link DEFAULT_OPENAPI_CONTENT_TYPE} and falls back to the first
 * declared content type when the default is absent (see
 * {@link PickContentType}).
 *
 * Swagger 2.0 documents are not normalised at the type level. When the
 * input is Swagger 2.0, this returns `__SchemaInferenceFellBack` so
 * callers can detect the fallback explicitly via a conditional type.
 */
export type OpenAPIRequestBodyType<
    Doc,
    Path extends string,
    Method extends string,
    ContentType extends string = DEFAULT_OPENAPI_CONTENT_TYPE,
> =
    IsSwagger2Doc<Doc> extends true
        ? __SchemaInferenceFellBack
        : ResolveMaybeRef<
              Doc,
              RequestBodySchemaOf<
                  OperationOf<PathItemOf<Doc, Path>, Method>,
                  ContentType
              >
          >;

/**
 * Infer the TypeScript type of an OpenAPI operation's response.
 *
 * `ContentType` selects which media type's schema to infer; defaults
 * to {@link DEFAULT_OPENAPI_CONTENT_TYPE} and falls back to the first
 * declared content type when the default is absent.
 *
 * Status-code resolution follows the OpenAPI priority order: concrete
 * code > class wildcard (e.g. `"2XX"`) > `"default"`. See
 * {@link ResponseSchemaOf}.
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
    ContentType extends string = DEFAULT_OPENAPI_CONTENT_TYPE,
> =
    IsSwagger2Doc<Doc> extends true
        ? __SchemaInferenceFellBack
        : ResolveMaybeRef<
              Doc,
              ResponseSchemaOf<
                  OperationOf<PathItemOf<Doc, Path>, Method>,
                  Status,
                  ContentType
              >
          >;

/**
 * Convert a resolved request/response type into the corresponding
 * `fields` prop type used by ApiRequestBody / ApiResponse:
 *
 * - `__SchemaInferenceFellBack` (Swagger 2.0, depth-exceeded refs) is
 *   preserved verbatim so callers can detect the brand.
 * - `unknown` (no schema found at the supplied path/status, or the
 *   resolved operation itself widened to `unknown`) falls back to the
 *   loose `Record<string, FieldOverride>` shape so runtime documents
 *   still typecheck.
 * - Any other concrete type is mapped through `FieldOverrides`.
 *
 * The brand check intentionally precedes the `unknown` check. The brand
 * is a structural object type and is therefore NOT assignable to
 * `unknown extends T` — checking that first would always short-circuit
 * to the loose `Record` fallback and the brand would never surface.
 *
 * TRADE-OFF: when the operation resolves to `unknown` (e.g. the path or
 * method does not exist on a typed `Doc`), `FieldsFromInferred` widens
 * silently to `Record<string, FieldOverride>` so any key is accepted.
 * The alternative — surfacing a distinct compile-time error — would
 * trade autocomplete on typed paths for noisy diagnostics on runtime
 * documents, and the existing `@ts-expect-error` regressions in
 * `type-inference.test.ts` rely on the current widening behaviour.
 * The trade-off is pinned by the
 * `FieldsFromInferred widens to Record<string, FieldOverride> when the
 * operation is unknown` regression test.
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
 *
 * `ContentType` mirrors the parameter on
 * {@link OpenAPIRequestBodyType}.
 */
export type InferRequestBodyFields<
    Doc,
    Path extends string,
    Method extends string,
    ContentType extends string = DEFAULT_OPENAPI_CONTENT_TYPE,
> = FieldsFromInferred<OpenAPIRequestBodyType<Doc, Path, Method, ContentType>>;

/**
 * Infer the fields prop type for ApiResponse.
 *
 * Surfaces `__SchemaInferenceFellBack` for Swagger 2.0 documents and
 * for schemas whose $ref chains exceed type-level depth limits. Falls
 * back to `Record<string, FieldOverride>` for runtime documents whose
 * shape cannot be inferred at compile time.
 *
 * `ContentType` mirrors the parameter on {@link OpenAPIResponseType}.
 */
export type InferResponseFields<
    Doc,
    Path extends string,
    Method extends string,
    Status extends string,
    ContentType extends string = DEFAULT_OPENAPI_CONTENT_TYPE,
> = FieldsFromInferred<
    OpenAPIResponseType<Doc, Path, Method, Status, ContentType>
>;

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
