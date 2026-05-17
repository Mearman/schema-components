/**
 * Walker / type-inference parity tests.
 *
 * The runtime walker in `src/core/walker.ts` and the type-level inference
 * helpers in `src/core/typeInference.ts` implement parallel logic. Any
 * divergence between them is silent — the walker has runtime test coverage,
 * but the type-level helpers are compile-only.
 *
 * This file pins representative snapshots of the type-level output so any
 * future change to the walker that does not have a matching change in
 * `typeInference.ts` (or vice versa) is caught at compile time.
 *
 * Pairings asserted here:
 * - `UnionOfMembers`   <-> walker `walkUnion` + `walkDiscriminatedUnion`
 *                          via `detectDiscriminated` in `merge.ts`
 * - `HasNullMember`    <-> walker `normaliseAnyOf` in `merge.ts`
 * - `ResolveOpenAPIRef` and `ResolveSchemaRef` <-> walker `$ref` handling
 *                          via `resolveRef` in `ref.ts`
 *
 * Compile-only: this file is named `.test.ts` (not `.unit.test.ts`) so it
 * is typechecked by `tsc` alongside the other type-inference test fixtures
 * but is not picked up by the vitest unit project — there is no runtime
 * code to exercise. `expectTypeOf` calls assert at the type level; the
 * `describe`/`it` wrappers are present for documentation only.
 */

import { describe, it, expectTypeOf } from "vitest";
import type {
    FromJSONSchema,
    OpenAPIRequestBodyType,
    OpenAPIResponseType,
    ResolveOpenAPIRef,
    __SchemaInferenceFellBack,
} from "../src/core/typeInference.ts";

// ---------------------------------------------------------------------------
// Discriminated union parity
// ---------------------------------------------------------------------------
//
// The walker collapses `oneOf` whose every member is an object with a
// `const`-valued property sharing the same key into a `discriminatedUnion`
// field (see `detectDiscriminated` in `merge.ts`).
//
// The type-level `UnionOfMembers` does NOT perform this collapsing — it
// produces a plain TypeScript union. That is a deliberate simplification:
// from a type perspective, a discriminated union and a plain union are
// structurally the same set of inhabitants. These tests pin that behaviour
// so it is impossible to change one side without noticing the other.
// ---------------------------------------------------------------------------

describe("discriminated union: typeInference produces plain union, walker collapses to discriminatedUnion", () => {
    // Equivalent of:
    //   z.object({ kind: z.literal("a"), x: z.string() })
    //     .or(z.object({ kind: z.literal("b"), y: z.number() }))
    // expressed as JSON Schema after `z.toJSONSchema(...)`.
    interface MemberASchema {
        readonly type: "object";
        readonly properties: {
            readonly kind: { readonly const: "a" };
            readonly x: { readonly type: "string" };
        };
        readonly required: readonly ["kind", "x"];
    }
    interface MemberBSchema {
        readonly type: "object";
        readonly properties: {
            readonly kind: { readonly const: "b" };
            readonly y: { readonly type: "number" };
        };
        readonly required: readonly ["kind", "y"];
    }
    interface DiscriminatedSchema {
        readonly oneOf: readonly [MemberASchema, MemberBSchema];
    }

    type Inferred = FromJSONSchema<DiscriminatedSchema>;

    interface ExpectedMemberA {
        kind: "a";
        x: string;
    }
    interface ExpectedMemberB {
        kind: "b";
        y: number;
    }

    // Bidirectional assignability proves structural equivalence between
    // the inferred mapped-type result and the hand-written union. Strict
    // `toEqualTypeOf` rejects the equivalence because the inferred form
    // is produced via a key-remapped mapped type, which TypeScript treats
    // as a non-identical (but mutually assignable) shape.
    it("Inferred is structurally equivalent to the expected union", () => {
        expectTypeOf<ExpectedMemberA>().toExtend<Inferred>();
        expectTypeOf<ExpectedMemberB>().toExtend<Inferred>();
        expectTypeOf<Inferred>().toExtend<ExpectedMemberA | ExpectedMemberB>();
    });
});

// ---------------------------------------------------------------------------
// Nullable normalisation parity
// ---------------------------------------------------------------------------
//
// The walker normalises `anyOf: [T, { type: "null" }]` to a nullable inner
// schema (see `normaliseAnyOf` in `merge.ts`). The type-level mirror is
// `HasNullMember`, used inside `UnionOfMembers`.
//
// `HasNullMember` recognises a `{ type: "null" }` schema member but
// deliberately treats a bare `null` literal in the member array as "not
// nullable" — only schema-shaped nulls count. This mirrors the walker,
// which only inspects `opt.type === "null"` on object members.
// ---------------------------------------------------------------------------

describe("nullable anyOf: { type: 'null' } member normalises to nullable inner", () => {
    interface StringMember {
        readonly type: "string";
    }
    interface NullMember {
        readonly type: "null";
    }
    interface NullableStringSchema {
        readonly anyOf: readonly [StringMember, NullMember];
    }

    type Inferred = FromJSONSchema<NullableStringSchema>;

    it("produces string | null", () => {
        expectTypeOf<Inferred>().toEqualTypeOf<string | null>();
    });
});

// ---------------------------------------------------------------------------
// OpenAPI $ref resolution parity
// ---------------------------------------------------------------------------
//
// `ResolveOpenAPIRef` mirrors the walker's `resolveRef` (see `ref.ts`).
// Both walk `#/components/schemas/<Name>` and `#/definitions/<Name>` and
// return the resolved schema, then continue walking it.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Draft 04 tuple-form items parity
// ---------------------------------------------------------------------------
//
// Draft 04 expressed tuples as `items: [Schema, Schema, ...]`. The runtime
// normaliser in `normalise.ts` (lines 526-534) rewrites this to
// `prefixItems` before the walker runs. `ArraySchemaToTs` mirrors the
// rewrite so an `as const` legacy schema infers the same tuple type at
// compile time.
// ---------------------------------------------------------------------------

describe("Draft 04 tuple-form items: typeInference mirrors the prefixItems rewrite", () => {
    interface LegacyTupleSchema {
        readonly type: "array";
        readonly items: readonly [
            { readonly type: "string" },
            { readonly type: "number" },
            { readonly type: "boolean" },
        ];
    }

    type Inferred = FromJSONSchema<LegacyTupleSchema>;

    it("produces [string, number, boolean] (matches prefixItems output)", () => {
        expectTypeOf<Inferred>().toEqualTypeOf<[string, number, boolean]>();
    });
});

describe("OpenAPI $ref resolution into components/schemas", () => {
    interface FooSchema {
        readonly type: "object";
        readonly properties: {
            readonly id: { readonly type: "string" };
            readonly count: { readonly type: "integer" };
        };
        readonly required: readonly ["id"];
    }
    // `ResolveOpenAPIRef` constrains its first parameter to
    // `Record<string, unknown>`. Interfaces are nominal and do not satisfy
    // that index-signature constraint implicitly; intersecting with
    // `Record<string, unknown>` gives the interface the missing index
    // signature without losing the literal types of its declared keys.
    interface SpecBase {
        readonly openapi: "3.1.0";
        readonly components: {
            readonly schemas: { readonly Foo: FooSchema };
        };
    }
    type Spec = SpecBase & Record<string, unknown>;

    type Resolved = ResolveOpenAPIRef<Spec, "#/components/schemas/Foo">;

    interface Expected {
        id: string;
        count?: number;
    }

    // Bidirectional assignability proves the resolved shape matches the
    // expected one. Strict `toEqualTypeOf` is avoided for the same reason
    // as the discriminated-union test: the parsed object is produced
    // through a mapped type that is mutually assignable but not strictly
    // identical to the hand-written form.
    it("Resolved is structurally equivalent to the expected object", () => {
        expectTypeOf<Expected>().toExtend<Resolved>();
        expectTypeOf<Resolved>().toExtend<Expected>();
    });
});

// ---------------------------------------------------------------------------
// OpenAPI 3.0 nullable parity (applied uniformly inside FromJSONSchema)
// ---------------------------------------------------------------------------
//
// The runtime path normalises `nullable: true` into `anyOf: [T, { type:
// "null" }]` via `normaliseOpenApi30Node` (`openapi30.ts`). Mirroring at
// the `FromJSONSchema` level (rather than only in `ResolveMaybeRef`) means
// nullability propagates through nested properties resolved via
// `#/components/schemas/...` refs.
// ---------------------------------------------------------------------------

describe("OpenAPI 3.0 nullable: applied at every FromJSONSchema entry", () => {
    interface NullableStringSchema {
        readonly type: "string";
        readonly nullable: true;
    }

    type Inferred = FromJSONSchema<NullableStringSchema>;

    it("produces string | null at the leaf", () => {
        expectTypeOf<Inferred>().toEqualTypeOf<string | null>();
    });

    interface NullableObjectSchema {
        readonly type: "object";
        readonly properties: {
            readonly name: { readonly type: "string" };
            readonly nickname: {
                readonly type: "string";
                readonly nullable: true;
            };
        };
        readonly required: readonly ["name"];
    }

    type NestedInferred = FromJSONSchema<NullableObjectSchema>;

    interface ExpectedNested {
        name: string;
        nickname?: string | null;
    }

    it("nullable flows through nested object properties", () => {
        expectTypeOf<ExpectedNested>().toExtend<NestedInferred>();
        expectTypeOf<NestedInferred>().toExtend<ExpectedNested>();
    });
});

// ---------------------------------------------------------------------------
// ResolveSchemaRef `#/components/schemas/` parity
// ---------------------------------------------------------------------------
//
// The runtime `dereference` (`ref.ts` line 217) walks any `#/...` JSON
// Pointer uniformly, so an inline `$ref: "#/components/schemas/Foo"`
// inside a JSON Schema with the matching definitions populated resolves
// successfully. The type-level mirror previously accepted only
// `#/$defs/` and `#/definitions/` prefixes — add the OpenAPI 3.x
// equivalent so callers do not have to copy entries between sections.
// ---------------------------------------------------------------------------

describe("ResolveSchemaRef resolves #/components/schemas/<Name> when defs hold the name", () => {
    interface SchemaWithComponentsBase {
        readonly type: "object";
        // `ExtractDefs` populates the resolution context from `definitions`
        // (and `$defs`). Once those entries are in `Defs`, an inline
        // `#/components/schemas/<Name>` lookup must succeed against the
        // same map — this is the parity gap that this branch closes.
        readonly definitions: {
            readonly Foo: {
                readonly type: "object";
                readonly properties: {
                    readonly id: { readonly type: "string" };
                };
                readonly required: readonly ["id"];
            };
        };
        readonly properties: {
            readonly foo: { readonly $ref: "#/components/schemas/Foo" };
        };
        readonly required: readonly ["foo"];
    }
    type Resolved = FromJSONSchema<SchemaWithComponentsBase>;

    interface ExpectedRoot {
        foo: { id: string };
    }

    it("resolves OpenAPI-style component ref against the local def context", () => {
        expectTypeOf<ExpectedRoot>().toExtend<Resolved>();
        expectTypeOf<Resolved>().toExtend<ExpectedRoot>();
    });
});

// ---------------------------------------------------------------------------
// JSON Pointer escape decoding parity
// ---------------------------------------------------------------------------
//
// The runtime `dereference` (ref.ts line 226) decodes `~1` -> `/` and
// `~0` -> `~` on every JSON Pointer segment per RFC 6901 §4. The
// type-level path mirrors this via `DecodeJsonPointerSegment` so refs
// containing encoded path components such as `#/paths/~1pets/get` resolve
// to the `"/pets"` key.
// ---------------------------------------------------------------------------

describe("JSON Pointer tilde escapes: typeInference decodes ~1 and ~0", () => {
    interface PetsSpecBase {
        readonly openapi: "3.1.0";
        readonly paths: {
            readonly "/pets": {
                readonly get: {
                    readonly responses: {
                        readonly "200": {
                            readonly content: {
                                readonly "application/json": {
                                    readonly schema: {
                                        readonly type: "string";
                                    };
                                };
                            };
                        };
                    };
                };
            };
        };
    }
    type PetsSpec = PetsSpecBase & Record<string, unknown>;

    // `ResolveOpenAPIRef` returns the raw resolved schema object for
    // path-based refs (callers are expected to feed it through
    // `FromJSONSchema` themselves). Without `~1` decoding the lookup of
    // `paths["~1pets"]` would miss the actual `paths["/pets"]` key and
    // collapse to `unknown`; with decoding the schema object is reached.
    type ResolvedEncoded = ResolveOpenAPIRef<
        PetsSpec,
        "#/paths/~1pets/get/responses/200/content/application~1json/schema"
    >;

    interface ExpectedSchema {
        readonly type: "string";
    }

    it("decodes ~1 to / so encoded path segments resolve", () => {
        expectTypeOf<ResolvedEncoded>().toEqualTypeOf<ExpectedSchema>();
    });

    interface TildeKeySpecBase {
        readonly openapi: "3.1.0";
        readonly paths: {
            readonly "~weird": { readonly value: { readonly type: "boolean" } };
        };
    }
    type TildeKeySpec = TildeKeySpecBase & Record<string, unknown>;

    // `~0` decodes back to a literal `~` per RFC 6901.
    type ResolvedTildeKey = ResolveOpenAPIRef<
        TildeKeySpec,
        "#/paths/~0weird/value"
    >;

    interface ExpectedTildeKey {
        readonly type: "boolean";
    }

    it("decodes ~0 to ~ so tilde-prefixed keys resolve", () => {
        expectTypeOf<ResolvedTildeKey>().toEqualTypeOf<ExpectedTildeKey>();
    });
});

// ---------------------------------------------------------------------------
// Swagger 2.0 fallback parity
// ---------------------------------------------------------------------------
//
// The runtime path normalises Swagger 2.0 documents into OpenAPI 3.1 shape
// before walking (see `normaliseSwagger2Document` in `swagger2.ts`). That
// transformation reorders the document tree in ways TypeScript's mapped
// types cannot replicate. Rather than silently produce `unknown`, the
// type-level path detects `swagger: "2.0"` and emits the
// `__SchemaInferenceFellBack` brand so callers can detect the fallback.
// ---------------------------------------------------------------------------

describe("Swagger 2.0 documents: typeInference surfaces __SchemaInferenceFellBack", () => {
    interface Swagger2DocBase {
        readonly swagger: "2.0";
        readonly paths: {
            readonly "/pets": {
                readonly post: {
                    readonly parameters: readonly [
                        {
                            readonly name: "body";
                            readonly in: "body";
                            readonly schema: { readonly type: "string" };
                        },
                    ];
                };
                readonly get: {
                    readonly responses: {
                        readonly "200": {
                            readonly schema: { readonly type: "string" };
                        };
                    };
                };
            };
        };
    }
    type Swagger2Doc = Swagger2DocBase & Record<string, unknown>;

    type ReqBody = OpenAPIRequestBodyType<Swagger2Doc, "/pets", "post">;
    type Resp = OpenAPIResponseType<Swagger2Doc, "/pets", "get", "200">;

    it("OpenAPIRequestBodyType returns __SchemaInferenceFellBack", () => {
        expectTypeOf<ReqBody>().toEqualTypeOf<__SchemaInferenceFellBack>();
    });

    it("OpenAPIResponseType returns __SchemaInferenceFellBack", () => {
        expectTypeOf<Resp>().toEqualTypeOf<__SchemaInferenceFellBack>();
    });
});
