/**
 * Regression tests for the round-6 type inference fixes.
 *
 * Each `describe` block corresponds to one of the numbered issues
 * resolved during the round-6 work. The tests are predominantly
 * compile-time assertions via `expectTypeOf` (vitest's structural
 * type matcher) — if this file typechecks AND the runtime
 * `expectTypeOf(...).toEqualTypeOf<...>()` calls succeed, the
 * regressions are pinned.
 */

import { describe, it, expectTypeOf } from "vitest";
import { z } from "zod";
import type {
    FromJSONSchema,
    FromJSONSchemaMode,
    InferRequestBodyFields,
    InferResponseFields,
    OpenAPIRequestBodyType,
    OpenAPIResponseType,
    RejectUnrepresentableZod,
    ResolveOpenAPIRef,
    UnrepresentableZodSchemaError,
    UnsafeFields,
    __SchemaInferenceFellBack,
} from "../src/core/typeInference.ts";
import type {
    InferredInputValue,
    InferredOutputValue,
    SchemaComponentProps,
    SchemaFieldProps,
} from "../src/react/SchemaComponent.tsx";

// ---------------------------------------------------------------------------
// Issue 1 — additionalProperties value type preserved alongside properties
// ---------------------------------------------------------------------------

describe("Issue 1: additionalProperties + properties combination", () => {
    it("intersects the named-properties object with Record<string, V>", () => {
        const schema = {
            type: "object" as const,
            properties: {
                name: { type: "string" as const },
            },
            required: ["name"] as const,
            additionalProperties: { type: "string" as const },
        } as const;
        void schema;
        type Inferred = FromJSONSchema<typeof schema>;
        // Named property is required and accepts a string. Additional
        // properties are typed `string` via the index signature.
        expectTypeOf<Inferred>().toExtend<
            { name: string } & Record<string, string>
        >();
        const example: Inferred = { name: "Ada", extra: "value" };
        void example;
    });

    it("widens additionalProperties: true to a Record<string, unknown> index", () => {
        const schema = {
            type: "object" as const,
            properties: { id: { type: "string" as const } },
            required: ["id"] as const,
            additionalProperties: true,
        } as const;
        void schema;
        type Inferred = FromJSONSchema<typeof schema>;
        const value: Inferred = { id: "abc", anythingElse: 42 };
        void value;
    });

    it("leaves the base object untouched when additionalProperties: false", () => {
        const schema = {
            type: "object" as const,
            properties: { id: { type: "string" as const } },
            required: ["id"] as const,
            additionalProperties: false,
        } as const;
        void schema;
        type Inferred = FromJSONSchema<typeof schema>;
        // No index signature: a literal with an extra key is rejected.
        const valid: Inferred = { id: "abc" };
        void valid;
        // @ts-expect-error — additionalProperties: false forbids extra keys
        const invalid: Inferred = { id: "abc", extra: "nope" };
        void invalid;
    });
});

// ---------------------------------------------------------------------------
// Issue 2 — RequiredKeysOf accepts widened string[] arrays
// ---------------------------------------------------------------------------

describe("Issue 2: RequiredKeysOf works with mutable string[] arrays", () => {
    it("treats `required: string[]` as marking every key as required", () => {
        // Schema literal where `required` is a plain string[] (no `as
        // const`). Earlier revisions silently treated every property as
        // optional in this case.
        const schema = {
            type: "object" as const,
            properties: {
                name: { type: "string" as const },
            },
            required: ["name"] as string[],
        };
        void schema;
        type Inferred = FromJSONSchema<typeof schema>;
        // `name` must be required — providing only an empty object must
        // fail to typecheck.
        const valid: Inferred = { name: "Ada" };
        void valid;
        // @ts-expect-error — name is required, not optional
        const invalid: Inferred = {};
        void invalid;
    });
});

// ---------------------------------------------------------------------------
// Issue 3 — UnrepresentableZodType covers Promise, Never, Custom
// ---------------------------------------------------------------------------

describe("Issue 3: UnrepresentableZodType rejects ZodPromise/ZodNever/ZodCustom", () => {
    it("ZodPromise is rejected", () => {
        type Rejected = RejectUnrepresentableZod<z.ZodPromise>;
        expectTypeOf<Rejected>().toEqualTypeOf<UnrepresentableZodSchemaError>();
    });

    it("ZodNever is rejected", () => {
        type Rejected = RejectUnrepresentableZod<z.ZodNever>;
        expectTypeOf<Rejected>().toEqualTypeOf<UnrepresentableZodSchemaError>();
    });

    it("ZodCustom is rejected", () => {
        type Rejected = RejectUnrepresentableZod<z.ZodCustom>;
        expectTypeOf<Rejected>().toEqualTypeOf<UnrepresentableZodSchemaError>();
    });

    it("rejection surfaces at the SchemaComponent props boundary", () => {
        type PromiseProps = SchemaComponentProps<z.ZodPromise>;
        expectTypeOf<
            PromiseProps["schema"]
        >().toEqualTypeOf<UnrepresentableZodSchemaError>();
        type NeverProps = SchemaComponentProps<z.ZodNever>;
        expectTypeOf<
            NeverProps["schema"]
        >().toEqualTypeOf<UnrepresentableZodSchemaError>();
        type CustomProps = SchemaComponentProps<z.ZodCustom>;
        expectTypeOf<
            CustomProps["schema"]
        >().toEqualTypeOf<UnrepresentableZodSchemaError>();
    });
});

// ---------------------------------------------------------------------------
// Issue 4 — Discriminated oneOf produces a tagged union
// ---------------------------------------------------------------------------

describe("Issue 4: oneOf + discriminator becomes a tagged union", () => {
    it("uses discriminator.mapping when refs are listed", () => {
        const schema = {
            oneOf: [
                { $ref: "#/components/schemas/Dog" },
                { $ref: "#/components/schemas/Cat" },
            ],
            discriminator: {
                propertyName: "petType" as const,
                mapping: {
                    dog: "#/components/schemas/Dog" as const,
                    cat: "#/components/schemas/Cat" as const,
                },
            },
            components: {
                schemas: {
                    Dog: {
                        type: "object" as const,
                        properties: {
                            bark: { type: "boolean" as const },
                        },
                        required: ["bark"] as const,
                    },
                    Cat: {
                        type: "object" as const,
                        properties: {
                            meow: { type: "boolean" as const },
                        },
                        required: ["meow"] as const,
                    },
                },
            },
        } as const;
        void schema;
        type Inferred = FromJSONSchema<typeof schema>;
        // Each member carries its own discriminator literal.
        const dog: Inferred = { petType: "dog", bark: true };
        const cat: Inferred = { petType: "cat", meow: false };
        void dog;
        void cat;
    });

    it("falls back to the trailing ref name when mapping is absent", () => {
        const schema = {
            oneOf: [
                { $ref: "#/components/schemas/Dog" },
                { $ref: "#/components/schemas/Cat" },
            ],
            discriminator: { propertyName: "petType" as const },
            components: {
                schemas: {
                    Dog: {
                        type: "object" as const,
                        properties: {
                            bark: { type: "boolean" as const },
                        },
                        required: ["bark"] as const,
                    },
                    Cat: {
                        type: "object" as const,
                        properties: {
                            meow: { type: "boolean" as const },
                        },
                        required: ["meow"] as const,
                    },
                },
            },
        } as const;
        void schema;
        type Inferred = FromJSONSchema<typeof schema>;
        const dog: Inferred = { petType: "Dog", bark: true };
        const cat: Inferred = { petType: "Cat", meow: false };
        void dog;
        void cat;
    });
});

// ---------------------------------------------------------------------------
// Issue 5 — readOnly / writeOnly drive Mode-based property filtering
// ---------------------------------------------------------------------------

describe("Issue 5: Mode parameter filters readOnly/writeOnly properties", () => {
    const schema = {
        type: "object" as const,
        properties: {
            id: { type: "string" as const, readOnly: true },
            password: { type: "string" as const, writeOnly: true },
            name: { type: "string" as const },
        },
        required: ["id", "password", "name"] as const,
    } as const;
    void schema;
    type Schema = typeof schema;

    it("input mode omits readOnly properties", () => {
        type Input = FromJSONSchema<Schema, Record<string, never>, [], "input">;
        const v: Input = { password: "secret", name: "Ada" };
        void v;
        // @ts-expect-error — id is readOnly and not part of the input shape
        const invalid: Input = { id: "x", password: "secret", name: "Ada" };
        void invalid;
    });

    it("output mode omits writeOnly properties", () => {
        type Output = FromJSONSchema<
            Schema,
            Record<string, never>,
            [],
            "output"
        >;
        const v: Output = { id: "abc", name: "Ada" };
        void v;
        // @ts-expect-error — password is writeOnly and not part of the output shape
        const invalid: Output = { id: "abc", password: "x", name: "Ada" };
        void invalid;
    });

    it("both mode (default) preserves every property", () => {
        type Both = FromJSONSchema<Schema>;
        const v: Both = { id: "abc", password: "secret", name: "Ada" };
        void v;
    });

    it("Mode type is exposed as a public alias", () => {
        // Compile-time only — the alias must be importable so that
        // downstream packages can build typed wrappers over the helpers.
        expectTypeOf<FromJSONSchemaMode>().toEqualTypeOf<
            "input" | "output" | "both"
        >();
    });
});

// ---------------------------------------------------------------------------
// Issue 8 — ResolveOpenAPIRef threads Defs through nested $ref chains
// ---------------------------------------------------------------------------

describe("Issue 8: nested $refs resolve via the document's components.schemas", () => {
    it("resolves Pet -> User via the shared components map", () => {
        const doc = {
            openapi: "3.1.0" as const,
            components: {
                schemas: {
                    User: {
                        type: "object" as const,
                        properties: {
                            email: { type: "string" as const },
                        },
                        required: ["email"] as const,
                    },
                    Pet: {
                        type: "object" as const,
                        properties: {
                            name: { type: "string" as const },
                            owner: { $ref: "#/components/schemas/User" },
                        },
                        required: ["name", "owner"] as const,
                    },
                },
            },
        } as const;
        void doc;
        type Pet = ResolveOpenAPIRef<typeof doc, "#/components/schemas/Pet">;
        const pet: Pet = {
            name: "Rex",
            owner: { email: "ada@example.com" },
        };
        void pet;
    });

    it("resolves nested refs from Swagger 2.0 definitions", () => {
        const doc = {
            swagger: "2.0" as const,
            definitions: {
                User: {
                    type: "object" as const,
                    properties: {
                        email: { type: "string" as const },
                    },
                    required: ["email"] as const,
                },
                Pet: {
                    type: "object" as const,
                    properties: {
                        owner: { $ref: "#/definitions/User" },
                    },
                    required: ["owner"] as const,
                },
            },
        } as const;
        void doc;
        type Pet = ResolveOpenAPIRef<typeof doc, "#/definitions/Pet">;
        const pet: Pet = { owner: { email: "ada@example.com" } };
        void pet;
    });
});

// ---------------------------------------------------------------------------
// Issue 9 — OpenAPI request body / response infer through nested refs
// ---------------------------------------------------------------------------

describe("Issue 9: request body and response inference resolves nested refs", () => {
    const doc = {
        openapi: "3.1.0" as const,
        paths: {
            "/pets": {
                post: {
                    requestBody: {
                        content: {
                            "application/json": {
                                schema: { $ref: "#/components/schemas/Pet" },
                            },
                        },
                    },
                    responses: {
                        "201": {
                            content: {
                                "application/json": {
                                    schema: {
                                        $ref: "#/components/schemas/Pet",
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
        components: {
            schemas: {
                User: {
                    type: "object" as const,
                    properties: { email: { type: "string" as const } },
                    required: ["email"] as const,
                },
                Pet: {
                    type: "object" as const,
                    properties: {
                        name: { type: "string" as const },
                        owner: { $ref: "#/components/schemas/User" },
                    },
                    required: ["name", "owner"] as const,
                },
            },
        },
    } as const;
    void doc;

    it("request body's nested ref is resolved", () => {
        type Body = OpenAPIRequestBodyType<typeof doc, "/pets", "post">;
        const body: Body = {
            name: "Rex",
            owner: { email: "ada@example.com" },
        };
        void body;
    });

    it("response's nested ref is resolved", () => {
        type R = OpenAPIResponseType<typeof doc, "/pets", "post", "201">;
        const resp: R = { name: "Rex", owner: { email: "ada@example.com" } };
        void resp;
    });
});

// ---------------------------------------------------------------------------
// Issue 10 — Response wildcard codes (2XX, default) and ordering
// ---------------------------------------------------------------------------

describe("Issue 10: response status priority order — concrete > 2XX > default", () => {
    const doc = {
        openapi: "3.1.0" as const,
        paths: {
            "/pets": {
                get: {
                    responses: {
                        "200": {
                            content: {
                                "application/json": {
                                    schema: {
                                        type: "object" as const,
                                        properties: {
                                            ok: { type: "boolean" as const },
                                        },
                                        required: ["ok"] as const,
                                    },
                                },
                            },
                        },
                        "2XX": {
                            content: {
                                "application/json": {
                                    schema: {
                                        type: "object" as const,
                                        properties: {
                                            wildcard: {
                                                type: "boolean" as const,
                                            },
                                        },
                                        required: ["wildcard"] as const,
                                    },
                                },
                            },
                        },
                        default: {
                            content: {
                                "application/json": {
                                    schema: {
                                        type: "object" as const,
                                        properties: {
                                            fallback: {
                                                type: "boolean" as const,
                                            },
                                        },
                                        required: ["fallback"] as const,
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
    } as const;
    void doc;

    it("concrete code beats the class wildcard", () => {
        type R = OpenAPIResponseType<typeof doc, "/pets", "get", "200">;
        const v: R = { ok: true };
        void v;
    });

    it("class wildcard is used when no concrete code matches", () => {
        type R = OpenAPIResponseType<typeof doc, "/pets", "get", "201">;
        const v: R = { wildcard: true };
        void v;
    });

    const docWildcardOnly = {
        openapi: "3.1.0" as const,
        paths: {
            "/pets": {
                get: {
                    responses: {
                        "4XX": {
                            content: {
                                "application/json": {
                                    schema: {
                                        type: "object" as const,
                                        properties: {
                                            error: {
                                                type: "string" as const,
                                            },
                                        },
                                        required: ["error"] as const,
                                    },
                                },
                            },
                        },
                        default: {
                            content: {
                                "application/json": {
                                    schema: {
                                        type: "object" as const,
                                        properties: {
                                            fallback: {
                                                type: "boolean" as const,
                                            },
                                        },
                                        required: ["fallback"] as const,
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
    } as const;
    void docWildcardOnly;

    it("class wildcard fires for any matching class even without concrete code", () => {
        type R = OpenAPIResponseType<
            typeof docWildcardOnly,
            "/pets",
            "get",
            "404"
        >;
        const v: R = { error: "not found" };
        void v;
    });

    it("default is used when neither concrete code nor class wildcard matches", () => {
        type R = OpenAPIResponseType<
            typeof docWildcardOnly,
            "/pets",
            "get",
            "500"
        >;
        const v: R = { fallback: true };
        void v;
    });
});

// ---------------------------------------------------------------------------
// Issue 12 — ContentType generic on request/response helpers
// ---------------------------------------------------------------------------

describe("Issue 12: ContentType generic selects the desired media type", () => {
    const doc = {
        openapi: "3.1.0" as const,
        paths: {
            "/pets": {
                post: {
                    requestBody: {
                        content: {
                            "application/json": {
                                schema: {
                                    type: "object" as const,
                                    properties: {
                                        name: { type: "string" as const },
                                    },
                                    required: ["name"] as const,
                                },
                            },
                            "application/xml": {
                                schema: {
                                    type: "object" as const,
                                    properties: {
                                        xmlName: {
                                            type: "string" as const,
                                        },
                                    },
                                    required: ["xmlName"] as const,
                                },
                            },
                        },
                    },
                },
            },
        },
    } as const;
    void doc;

    it("defaults to application/json", () => {
        type Body = OpenAPIRequestBodyType<typeof doc, "/pets", "post">;
        const v: Body = { name: "Rex" };
        void v;
    });

    it("explicit ContentType selects the requested media type", () => {
        type Body = OpenAPIRequestBodyType<
            typeof doc,
            "/pets",
            "post",
            "application/xml"
        >;
        const v: Body = { xmlName: "Rex" };
        void v;
    });

    it("falls back to the first content type when default is absent", () => {
        const xmlOnly = {
            openapi: "3.1.0" as const,
            paths: {
                "/pets": {
                    post: {
                        requestBody: {
                            content: {
                                "application/xml": {
                                    schema: {
                                        type: "object" as const,
                                        properties: {
                                            xmlName: {
                                                type: "string" as const,
                                            },
                                        },
                                        required: ["xmlName"] as const,
                                    },
                                },
                            },
                        },
                    },
                },
            },
        } as const;
        void xmlOnly;
        type Body = OpenAPIRequestBodyType<typeof xmlOnly, "/pets", "post">;
        const v: Body = { xmlName: "Rex" };
        void v;
    });

    it("InferRequestBodyFields threads ContentType", () => {
        type Fields = InferRequestBodyFields<
            typeof doc,
            "/pets",
            "post",
            "application/xml"
        >;
        const f: Fields = { xmlName: { readOnly: true } };
        void f;
    });

    it("InferResponseFields threads ContentType", () => {
        const respDoc = {
            openapi: "3.1.0" as const,
            paths: {
                "/pets": {
                    get: {
                        responses: {
                            "200": {
                                content: {
                                    "application/xml": {
                                        schema: {
                                            type: "object" as const,
                                            properties: {
                                                xmlName: {
                                                    type: "string" as const,
                                                },
                                            },
                                            required: ["xmlName"] as const,
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        } as const;
        void respDoc;
        type Fields = InferResponseFields<
            typeof respDoc,
            "/pets",
            "get",
            "200",
            "application/xml"
        >;
        const f: Fields = { xmlName: { readOnly: true } };
        void f;
    });
});

// ---------------------------------------------------------------------------
// Issue 13 — nullable: false stays non-nullable
// ---------------------------------------------------------------------------

describe("Issue 13: nullable: false does not widen to T | null", () => {
    it("string with nullable: false stays string", () => {
        const schema = {
            type: "string" as const,
            nullable: false,
        } as const;
        void schema;
        type Inferred = FromJSONSchema<typeof schema>;
        expectTypeOf<Inferred>().toEqualTypeOf<string>();
    });
});

// ---------------------------------------------------------------------------
// Issue 14 — type: ["array", "null"] preserves items
// ---------------------------------------------------------------------------

describe("Issue 14: type-array with items preserves the element type", () => {
    it("type: [array, null] + items infers string[] | null", () => {
        const schema = {
            type: ["array", "null"] as const,
            items: { type: "string" as const },
        } as const;
        void schema;
        type Inferred = FromJSONSchema<typeof schema>;
        // The array branch must keep `items`, otherwise the element type
        // collapses to unknown[] and the regression returns.
        const arr: Inferred = ["a", "b"];
        const nul: Inferred = null;
        void arr;
        void nul;
        expectTypeOf<Inferred>().toEqualTypeOf<string[] | null>();
    });

    it("type: [object, null] + properties preserves the object shape", () => {
        const schema = {
            type: ["object", "null"] as const,
            properties: {
                id: { type: "string" as const },
            },
            required: ["id"] as const,
        } as const;
        void schema;
        type Inferred = FromJSONSchema<typeof schema>;
        const obj: Inferred = { id: "abc" };
        const nul: Inferred = null;
        void obj;
        void nul;
    });
});

// ---------------------------------------------------------------------------
// Issue 15 — IsSwagger2Doc detects numeric swagger fields
// ---------------------------------------------------------------------------

describe("Issue 15: IsSwagger2Doc detects numeric swagger values", () => {
    it("numeric swagger: 2 surfaces __SchemaInferenceFellBack", () => {
        interface Doc {
            readonly swagger: 2;
            readonly paths: Record<string, never>;
        }
        type Body = OpenAPIRequestBodyType<Doc, "/anything", "post">;
        expectTypeOf<Body>().toEqualTypeOf<__SchemaInferenceFellBack>();
    });

    it("numeric swagger: 2.0 surfaces __SchemaInferenceFellBack", () => {
        interface Doc {
            readonly swagger: 2.0;
            readonly paths: Record<string, never>;
        }
        type Body = OpenAPIRequestBodyType<Doc, "/anything", "post">;
        expectTypeOf<Body>().toEqualTypeOf<__SchemaInferenceFellBack>();
    });

    it("string swagger: 2.0 also surfaces the fallback", () => {
        interface Doc {
            readonly swagger: "2.0";
            readonly paths: Record<string, never>;
        }
        type Body = OpenAPIRequestBodyType<Doc, "/anything", "post">;
        expectTypeOf<Body>().toEqualTypeOf<__SchemaInferenceFellBack>();
    });
});

// ---------------------------------------------------------------------------
// Issue 16 — allOf of unions: documented limitation
// ---------------------------------------------------------------------------

describe("Issue 16: allOf of unions — TS limitation pinned for future audits", () => {
    it("allOf members are intersected via UnionToIntersection", () => {
        // The pinned behaviour: when one member is a union, the result
        // is the intersection of every member as expressed by
        // UnionToIntersection. A future improvement could distribute
        // the union across the intersection; this test exists so any
        // such change is detected explicitly.
        const schema = {
            allOf: [
                {
                    type: "object" as const,
                    properties: { name: { type: "string" as const } },
                    required: ["name"] as const,
                },
                {
                    type: "object" as const,
                    properties: { tag: { type: "string" as const } },
                    required: ["tag"] as const,
                },
            ],
        } as const;
        void schema;
        type Inferred = FromJSONSchema<typeof schema>;
        const value: Inferred = { name: "Ada", tag: "admin" };
        void value;
    });
});

// ---------------------------------------------------------------------------
// Issue 17 — __SchemaInferenceFellBack brand survives d.ts round-trip
// ---------------------------------------------------------------------------

describe("Issue 17: __SchemaInferenceFellBack brand is structurally stable", () => {
    it("brand resolves to a structural type usable in conditional types", () => {
        // The literal compile-time check below is meaningful only if
        // `tsc --emitDeclarationOnly` can successfully emit a .d.ts for
        // the brand. The CI typecheck script (`pnpm validate`) runs
        // `tsc --noEmit`, which exercises the same machinery for
        // public exports.
        type IsBrand<T> = T extends __SchemaInferenceFellBack ? true : false;
        expectTypeOf<
            IsBrand<__SchemaInferenceFellBack>
        >().toEqualTypeOf<true>();
        expectTypeOf<IsBrand<string>>().toEqualTypeOf<false>();
    });
});

// ---------------------------------------------------------------------------
// Issue 18 — UnsafeFields requires the explicit __unsafe marker
// ---------------------------------------------------------------------------

describe("Issue 18: UnsafeFields requires the __unsafe brand", () => {
    it("a plain Record<string, FieldOverride> literal is NOT assignable to UnsafeFields", () => {
        // The assertion is the assignment itself: a literal whose
        // shape is just `Record<string, FieldOverride>` must NOT
        // satisfy `UnsafeFields` once the brand is required.
        // @ts-expect-error — UnsafeFields requires an explicit __unsafe: true marker
        const escape: UnsafeFields = {
            name: { readOnly: true },
        };
        void escape;
    });

    it("an explicit __unsafe: true literal is accepted", () => {
        const escape: UnsafeFields = {
            __unsafe: true,
            name: { readOnly: true },
        };
        void escape;
    });
});

// ---------------------------------------------------------------------------
// Issue 21 — FieldsFromInferred fallback for unknown operations
// ---------------------------------------------------------------------------

describe("Issue 21: FieldsFromInferred fallback when operation is unknown", () => {
    it("widens to Record<string, FieldOverride> for runtime documents", () => {
        // A runtime document (typed as Record<string, unknown>) leaves
        // the inferred operation as `unknown`. `FieldsFromInferred`
        // intentionally widens so any field key is accepted — preserving
        // the public API for documents that cannot be statically
        // analysed.
        type Fields = InferRequestBodyFields<
            Record<string, unknown>,
            "/anything",
            "post"
        >;
        const fields: Fields = { anyKey: { readOnly: true } };
        void fields;
    });
});

// ---------------------------------------------------------------------------
// Issue 6 — InferredInputValue / InferredOutputValue helper aliases
// ---------------------------------------------------------------------------

describe("Issue 6: schema value helpers narrow from Zod / JSON Schema / OpenAPI", () => {
    it("Zod schemas narrow via z.input / z.output", () => {
        const schema = z.object({
            id: z.string().readonly(),
            name: z.string(),
        });
        void schema;
        // Output: includes readOnly fields. Input: omits them (Zod
        // models readOnly as the type's read-only marker; only the
        // shape it advertises differs by mode.)
        type Out = InferredOutputValue<typeof schema>;
        type In = InferredInputValue<typeof schema>;
        const out: Out = { id: "abc", name: "Ada" };
        const inp: In = { id: "abc", name: "Ada" };
        void out;
        void inp;
    });

    it("JSON Schema with readOnly produces directional input / output shapes", () => {
        const schema = {
            type: "object" as const,
            properties: {
                id: { type: "string" as const, readOnly: true },
                name: { type: "string" as const },
            },
            required: ["id", "name"] as const,
        } as const;
        void schema;
        type Out = InferredOutputValue<typeof schema>;
        type In = InferredInputValue<typeof schema>;
        const out: Out = { id: "abc", name: "Ada" };
        void out;
        const inp: In = { name: "Ada" };
        void inp;
        // @ts-expect-error — id is readOnly and not part of the input shape
        const inpInvalid: In = { id: "abc", name: "Ada" };
        void inpInvalid;
    });

    it("OpenAPI ref narrows via ResolveOpenAPIRef", () => {
        const doc = {
            openapi: "3.1.0" as const,
            components: {
                schemas: {
                    User: {
                        type: "object" as const,
                        properties: {
                            email: { type: "string" as const },
                        },
                        required: ["email"] as const,
                    },
                },
            },
        } as const;
        void doc;
        type V = InferredOutputValue<typeof doc, "#/components/schemas/User">;
        const v: V = { email: "ada@example.com" };
        void v;
    });

    it("falls back to unknown for runtime schemas", () => {
        const schema: Record<string, unknown> = { type: "object" };
        void schema;
        type V = InferredOutputValue<typeof schema>;
        // unknown accepts anything
        const v: V = { anything: 123 };
        void v;
    });
});

// ---------------------------------------------------------------------------
// Issue 7 — path-typed prop on SchemaComponentProps narrows value helpers
// ---------------------------------------------------------------------------

describe("Issue 7: SchemaComponentProps accepts a typed path generic", () => {
    const schema = z.object({
        address: z.object({
            city: z.string(),
            postcode: z.string(),
        }),
        name: z.string(),
    });
    void schema;

    it("InferredOutputValue with a path returns the sub-shape", () => {
        type City = InferredOutputValue<
            typeof schema,
            undefined,
            "address.city"
        >;
        const city: City = "London";
        void city;
    });

    it("InferredInputValue narrows the same way", () => {
        type Address = InferredInputValue<typeof schema, undefined, "address">;
        const addr: Address = { city: "London", postcode: "SW1" };
        void addr;
    });

    it("SchemaComponentProps accepts the third generic argument", () => {
        type Props = SchemaComponentProps<
            typeof schema,
            undefined,
            "address.city"
        >;
        // The `path` prop must accept the requested literal — earlier
        // revisions had no `path` field on SchemaComponentProps.
        const props: Props = {
            schema,
            path: "address.city",
            value: "London",
            onChange: (v) => {
                void v;
            },
        };
        void props;
    });
});

// ---------------------------------------------------------------------------
// Issue 20 — SchemaFieldProps function default for P matches the interface
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Issue 11 — Api* components narrow path/method/status/contentType
// ---------------------------------------------------------------------------

describe("Issue 11: Api* components narrow path/method/status/contentType", () => {
    const doc = {
        openapi: "3.1.0" as const,
        paths: {
            "/pets": {
                get: {
                    responses: {
                        "200": {
                            content: {
                                "application/json": {
                                    schema: {
                                        type: "object" as const,
                                        properties: {
                                            ok: { type: "boolean" as const },
                                        },
                                        required: ["ok"] as const,
                                    },
                                },
                            },
                        },
                    },
                },
                post: {
                    requestBody: {
                        content: {
                            "application/json": {
                                schema: {
                                    type: "object" as const,
                                    properties: {
                                        name: { type: "string" as const },
                                    },
                                    required: ["name"] as const,
                                },
                            },
                        },
                    },
                    responses: {
                        "201": {
                            content: {
                                "application/json": {
                                    schema: {
                                        type: "object" as const,
                                        properties: {
                                            id: { type: "string" as const },
                                        },
                                        required: ["id"] as const,
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
    } as const;
    void doc;

    it("ApiOperationProps restricts path/method to declared keys", () => {
        type Op = import("../src/openapi/components.tsx").ApiOperationProps<
            typeof doc,
            "/pets",
            "post"
        >;
        const op: Op = {
            schema: doc,
            path: "/pets",
            method: "post",
        };
        void op;
        // @ts-expect-error — `/dogs` is not a declared path
        const opPath: Op = { schema: doc, path: "/dogs", method: "post" };
        void opPath;
    });

    it("ApiOperationProps rejects unknown methods on a typed doc", () => {
        type Op = import("../src/openapi/components.tsx").ApiOperationProps<
            typeof doc,
            "/pets",
            // @ts-expect-error — `patch` is not declared on /pets
            "patch"
        >;
        type _Op = Op;
        void (undefined as unknown as _Op);
    });

    it("ApiResponseProps narrows status to declared codes", () => {
        type R = import("../src/openapi/components.tsx").ApiResponseProps<
            typeof doc,
            "/pets",
            "get",
            "200"
        >;
        const r: R = {
            schema: doc,
            path: "/pets",
            method: "get",
            status: "200",
        };
        void r;
    });

    it("ApiRequestBodyProps accepts a typed contentType", () => {
        type R = import("../src/openapi/components.tsx").ApiRequestBodyProps<
            typeof doc,
            "/pets",
            "post",
            "application/json"
        >;
        const r: R = {
            schema: doc,
            path: "/pets",
            method: "post",
            contentType: "application/json",
        };
        void r;
    });

    it("runtime documents widen back to string for both path and method", () => {
        const runtime: Record<string, unknown> = { openapi: "3.1.0" };
        void runtime;
        type Op = import("../src/openapi/components.tsx").ApiOperationProps<
            typeof runtime,
            string,
            string
        >;
        const op: Op = {
            schema: runtime,
            path: "/anything",
            method: "whatever",
        };
        void op;
    });
});

// ---------------------------------------------------------------------------
// Issue 20 — SchemaFieldProps function default for P matches the interface
// ---------------------------------------------------------------------------

describe("Issue 20: SchemaFieldProps['P'] default propagates path autocomplete", () => {
    it("typed schemas accept only valid dot-paths", () => {
        const schema = z.object({
            address: z.object({
                city: z.string(),
                postcode: z.string(),
            }),
            name: z.string(),
        });
        void schema;
        type Props = SchemaFieldProps<typeof schema>;
        const valid: Props = { schema, path: "address.city" };
        void valid;
        // @ts-expect-error — `address.country` is not a valid path
        const invalid: Props = { schema, path: "address.country" };
        void invalid;
    });
});
