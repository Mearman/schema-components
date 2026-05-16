/**
 * Compile-time type inference tests for SchemaComponent.
 *
 * These "tests" verify that the generic props type dispatch works correctly.
 * They are compile-time only — if this file typechecks, the tests pass.
 * Run: pnpm _typecheck
 *
 * Note: SchemaMeta has `[key: string]: unknown` for arbitrary UI hints.
 * When FieldOverrides<T> intersects with Partial<SchemaMeta> at object
 * nodes, the index signature allows extra keys. This means:
 * - Top-level unknown keys ARE caught (the FieldOverrides mapped type
 *   enforces them before the intersection)
 * - Nested unknown keys inside object fields are NOT caught (the
 *   Partial<SchemaMeta> index signature makes them valid)
 * This is a deliberate trade-off for SchemaMeta extensibility.
 */

import { z } from "zod";
import type { SchemaComponentProps } from "../src/react/SchemaComponent.tsx";
import type { FieldOverride, FieldOverrides } from "../src/core/types.ts";
import type {
    FromJSONSchema,
    ResolveOpenAPIRef,
} from "../src/core/typeInference.ts";
import type {
    ApiOperationProps,
    ApiParametersProps,
    ApiRequestBodyProps,
    ApiResponseProps,
} from "../src/openapi/components.tsx";

// ---------------------------------------------------------------------------
// Zod schema: full type-safe fields inference via z.infer<T>
// ---------------------------------------------------------------------------

const userSchema = z.object({
    name: z.string(),
    age: z.number(),
    address: z.object({
        street: z.string(),
        city: z.string(),
    }),
});
void userSchema;

type UserProps = SchemaComponentProps<typeof userSchema>;

// Valid: known keys with SchemaMeta
const validZodFields: UserProps["fields"] = {
    name: { readOnly: true },
    age: { description: "Age" },
    address: {
        description: "Home address",
        city: { readOnly: true },
    },
};
void validZodFields;

// Invalid: unknown key at top level — caught by FieldOverrides mapped type
const invalidZodFields: UserProps["fields"] = {
    // @ts-expect-error — 'nme' is not a key of z.infer<typeof userSchema>
    nme: { readOnly: true },
};
void invalidZodFields;

// ---------------------------------------------------------------------------
// JSON Schema as const: FromJSONSchema type-level parser
// ---------------------------------------------------------------------------

const jsonSchema = {
    type: "object" as const,
    properties: {
        name: { type: "string" as const },
        email: { type: "string" as const, format: "email" },
    },
    required: ["name"],
} as const;
void jsonSchema;

type JsonInferred = FromJSONSchema<typeof jsonSchema>;
type JsonFields = FieldOverrides<JsonInferred>;

// Valid: known keys
const jsonFieldsValid: JsonFields = {
    name: { readOnly: true },
    email: { description: "Email" },
};
void jsonFieldsValid;

// Invalid: unknown key — caught because JSON Schema inference produces
// a specific object type without index signatures
const jsonFieldsInvalid: JsonFields = {
    // @ts-expect-error — 'nme' is not a valid key
    nme: { readOnly: true },
};
void jsonFieldsInvalid;

// Via SchemaComponentProps dispatch
type JsonProps = SchemaComponentProps<typeof jsonSchema>;
const jsonPropsFields: JsonProps["fields"] = {
    name: { readOnly: true },
};
void jsonPropsFields;

// ---------------------------------------------------------------------------
// OpenAPI as const with ref: ResolveOpenAPIRef type-level parser
// ---------------------------------------------------------------------------

const openApiSpec = {
    openapi: "3.1.0",
    components: {
        schemas: {
            User: {
                type: "object" as const,
                properties: {
                    id: { type: "string" as const },
                    name: { type: "string" as const },
                },
                required: ["id", "name"],
            },
        },
    },
} as const;
void openApiSpec;

type OpenApiInferred = ResolveOpenAPIRef<
    typeof openApiSpec,
    "#/components/schemas/User"
>;
type OpenApiFields = FieldOverrides<OpenApiInferred>;

// Valid: known keys
const openApiFieldsValid: OpenApiFields = {
    id: { readOnly: true },
    name: { description: "Full name" },
};
void openApiFieldsValid;

// Invalid: unknown key — caught by ResolveOpenAPIRef + FromJSONSchema
const openApiFieldsInvalid: OpenApiFields = {
    // @ts-expect-error — 'nme' is not a valid key in the User schema
    nme: { readOnly: true },
};
void openApiFieldsInvalid;

// Via SchemaComponentProps dispatch
type OpenApiProps = SchemaComponentProps<
    typeof openApiSpec,
    "#/components/schemas/User"
>;
const openApiPropsFields: OpenApiProps["fields"] = {
    id: { readOnly: true },
};
void openApiPropsFields;

// ---------------------------------------------------------------------------
// Runtime schema: falls back to Record<string, FieldOverride>
// ---------------------------------------------------------------------------

// Runtime schema: unknown at compile time, any key accepted

type RuntimeProps = SchemaComponentProps<typeof undefined>;

const runtimeFields: RuntimeProps["fields"] = {
    anyKey: { readOnly: true },
    anotherKey: { description: "whatever" },
};
void runtimeFields;

// ---------------------------------------------------------------------------
// Type alias smoke test
// ---------------------------------------------------------------------------

const fieldOverrideCheck: FieldOverride = { readOnly: true };
void fieldOverrideCheck;

// ---------------------------------------------------------------------------
// OpenAPI components: type-safe fields inference via path traversal
// ---------------------------------------------------------------------------

const petStoreDoc = {
    openapi: "3.1.0",
    paths: {
        "/pets": {
            get: {
                parameters: [
                    {
                        name: "limit",
                        in: "query",
                        required: false,
                        schema: { type: "integer" as const },
                    },
                    {
                        name: "status",
                        in: "query",
                        required: false,
                        schema: {
                            type: "string" as const,
                            enum: ["available", "sold"],
                        },
                    },
                ],
                responses: {
                    "200": {
                        content: {
                            "application/json": {
                                schema: {
                                    type: "array" as const,
                                    items: {
                                        $ref: "#/components/schemas/Pet",
                                    },
                                },
                            },
                        },
                    },
                },
            },
            post: {
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: {
                                type: "object" as const,
                                properties: {
                                    name: { type: "string" as const },
                                    tag: { type: "string" as const },
                                },
                                required: ["name"],
                            },
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
            Pet: {
                type: "object" as const,
                properties: {
                    id: { type: "string" as const, readOnly: true },
                    name: { type: "string" as const },
                    status: {
                        type: "string" as const,
                        enum: ["available", "sold"],
                    },
                },
                required: ["id", "name"],
            },
        },
    },
} as const;
void petStoreDoc;

// --- ApiRequestBody: type-safe fields from inline schema ---

type PostPetsBody = ApiRequestBodyProps<typeof petStoreDoc, "/pets", "post">;

const postPetsFields: PostPetsBody["fields"] = {
    name: { readOnly: true },
    tag: { description: "Tag" },
};
void postPetsFields;

const postPetsFieldsInvalid: PostPetsBody["fields"] = {
    // @ts-expect-error — 'nme' is not a key in the request body schema
    nme: { readOnly: true },
};
void postPetsFieldsInvalid;

// --- ApiResponse: type-safe fields from $ref through components/schemas ---

type PostPets201 = ApiResponseProps<typeof petStoreDoc, "/pets", "post", "201">;

const response201Fields: PostPets201["fields"] = {
    id: { readOnly: true },
    name: { description: "Name" },
};
void response201Fields;

const response201FieldsInvalid: PostPets201["fields"] = {
    // @ts-expect-error — 'nme' is not a key in the Pet schema
    nme: { readOnly: true },
};
void response201FieldsInvalid;

// --- ApiParameters: type-safe overrides from parameter names ---

type GetPetsParams = ApiParametersProps<typeof petStoreDoc, "/pets", "get">;

const paramOverrides: GetPetsParams["overrides"] = {
    limit: { description: "Max results" },
    status: { readOnly: true },
};
void paramOverrides;

const paramOverridesInvalid: GetPetsParams["overrides"] = {
    // @ts-expect-error — 'page' is not a parameter name
    page: { readOnly: true },
};
void paramOverridesInvalid;

// --- ApiOperation: type-safe requestBodyFields ---

type PostPetsOp = ApiOperationProps<typeof petStoreDoc, "/pets", "post">;

const opRequestBodyFields: PostPetsOp["requestBodyFields"] = {
    name: { readOnly: true },
    tag: { description: "Tag" },
};
void opRequestBodyFields;

const opRequestBodyFieldsInvalid: PostPetsOp["requestBodyFields"] = {
    // @ts-expect-error — 'nme' is not a key in the request body schema
    nme: { readOnly: true },
};
void opRequestBodyFieldsInvalid;

// --- Runtime OpenAPI doc: falls back to Record<string, FieldOverride> ---

const runtimeDoc: Record<string, unknown> = { openapi: "3.1.0" };
void runtimeDoc;

type RuntimeRequestBody = ApiRequestBodyProps<
    typeof runtimeDoc,
    "/pets",
    "post"
>;
const runtimeOpenApiFields: RuntimeRequestBody["fields"] = {
    anyKey: { readOnly: true },
};
void runtimeOpenApiFields;

// ---------------------------------------------------------------------------
// SchemaField: type-safe path inference
// ---------------------------------------------------------------------------

import type { SchemaFieldProps } from "../src/react/SchemaComponent.tsx";
import type { PathOfType, TypeAtPath } from "../src/core/typeInference.ts";

// --- Zod schema: path is inferred from z.infer ---

const addressSchema = z.object({
    name: z.string(),
    address: z.object({
        street: z.string(),
        city: z.string(),
        postcode: z.string(),
    }),
    tags: z.array(z.string()),
});
void addressSchema;

type AddressType = z.infer<typeof addressSchema>;

// PathOfType produces all valid dot-paths
type AddressPaths = PathOfType<AddressType>;
const validPath: AddressPaths = "address.city";
void validPath;

// TypeAtPath resolves the leaf type
type CityType = TypeAtPath<AddressType, "address.city">;
const cityValue: CityType = "London";
void cityValue;

// SchemaField with Zod schema: path is type-safe
type ZodFieldProps = SchemaFieldProps<typeof addressSchema>;

const zodFieldValid: ZodFieldProps = {
    path: "address.city",
    schema: addressSchema,
};
void zodFieldValid;

const zodFieldInvalid: ZodFieldProps = {
    // @ts-expect-error — 'address.cty' is not a valid path
    path: "address.cty",
    schema: addressSchema,
};
void zodFieldInvalid;

// --- JSON Schema as const: path inferred from FromJSONSchema ---

const personJsonSchema = {
    type: "object" as const,
    properties: {
        name: { type: "string" as const },
        age: { type: "number" as const },
        address: {
            type: "object" as const,
            properties: {
                city: { type: "string" as const },
            },
            required: ["city"],
        },
    },
    required: ["name"],
} as const;
void personJsonSchema;

type JsonFieldProps = SchemaFieldProps<typeof personJsonSchema>;

const jsonFieldValid: JsonFieldProps = {
    path: "address.city",
    schema: personJsonSchema,
};
void jsonFieldValid;

const jsonFieldInvalid: JsonFieldProps = {
    // @ts-expect-error — 'address.cty' is not a valid path
    path: "address.cty",
    schema: personJsonSchema,
};
void jsonFieldInvalid;

// --- Runtime schema: falls back to string ---

const runtimeSchema: Record<string, unknown> = { type: "object" };
void runtimeSchema;

type RuntimeFieldProps = SchemaFieldProps<typeof runtimeSchema>;
const runtimeField: RuntimeFieldProps = {
    path: "any.path.at.all",
    schema: runtimeSchema,
};
void runtimeField;

// ===========================================================================
// Extended type inference tests — JSON Schema keywords
// ===========================================================================

// ---------------------------------------------------------------------------
// enum → union of literal types
// ---------------------------------------------------------------------------

const enumSchema = {
    type: "string" as const,
    enum: ["red", "green", "blue"],
} as const;
void enumSchema;

type EnumType = FromJSONSchema<typeof enumSchema>;
const _enumVal: EnumType = "red";
const _enumVal2: EnumType = "blue";
// @ts-expect-error — 'purple' is not in the enum
const _enumBad: EnumType = "purple";
void _enumVal;
void _enumVal2;
void _enumBad;

// Numeric enum
const numEnum = {
    type: "number" as const,
    enum: [1, 2, 3] as const,
} as const;
void numEnum;

type NumEnumType = FromJSONSchema<typeof numEnum>;
const _numVal: NumEnumType = 2;
// @ts-expect-error — 5 is not in the enum
const _numBad: NumEnumType = 5;
void _numVal;
void _numBad;

// Mixed type enum (no type field)
const mixedEnum = {
    enum: ["active", 0, true, null] as const,
} as const;
void mixedEnum;

type MixedEnumType = FromJSONSchema<typeof mixedEnum>;
const _mixed1: MixedEnumType = "active";
const _mixed2: MixedEnumType = 0;
const _mixed3: MixedEnumType = true;
const _mixed4: MixedEnumType = null;
// @ts-expect-error — "inactive" is not in the enum
const _mixedBad: MixedEnumType = "inactive";
void _mixed1;
void _mixed2;
void _mixed3;
void _mixed4;
void _mixedBad;

// ---------------------------------------------------------------------------
// const → literal type
// ---------------------------------------------------------------------------

const constSchema = { const: "hello" } as const;
void constSchema;
type ConstType = FromJSONSchema<typeof constSchema>;
const _constVal: ConstType = "hello";
// @ts-expect-error — only "hello" is valid
const _constBad: ConstType = "world";
void _constVal;
void _constBad;

const constNumber = { const: 42 } as const;
void constNumber;
type ConstNumType = FromJSONSchema<typeof constNumber>;
const _constNum: ConstNumType = 42;
// @ts-expect-error — only 42 is valid
const _constNumBad: ConstNumType = 43;
void _constNum;
void _constNumBad;

const constNull = { const: null } as const;
void constNull;
type ConstNullType = FromJSONSchema<typeof constNull>;
const _constNull: ConstNullType = null;
void _constNull;

// ---------------------------------------------------------------------------
// type as array → nullable
// ---------------------------------------------------------------------------

const nullableString = {
    type: ["string", "null"] as const,
} as const;
void nullableString;

type NullableString = FromJSONSchema<typeof nullableString>;
const _ns1: NullableString = "hello";
const _ns2: NullableString = null;
// @ts-expect-error — number is not string | null
const _nsBad: NullableString = 42;
void _ns1;
void _ns2;
void _nsBad;

const nullableNumber = {
    type: ["integer", "null"] as const,
} as const;
void nullableNumber;

type NullableNumber = FromJSONSchema<typeof nullableNumber>;
const _nn1: NullableNumber = 42;
const _nn2: NullableNumber = null;
// @ts-expect-error — string is not number | null
const _nnBad: NullableNumber = "hello";
void _nn1;
void _nn2;
void _nnBad;

// ---------------------------------------------------------------------------
// anyOf → union type
// ---------------------------------------------------------------------------

const anyOfSchema = {
    anyOf: [{ type: "string" as const }, { type: "number" as const }] as const,
} as const;
void anyOfSchema;

type AnyOfType = FromJSONSchema<typeof anyOfSchema>;
const _ao1: AnyOfType = "hello";
const _ao2: AnyOfType = 42;
// @ts-expect-error — boolean not in union
const _aoBad: AnyOfType = true;
void _ao1;
void _ao2;
void _aoBad;

// anyOf with null → nullable union
const anyOfNullable = {
    anyOf: [{ type: "string" as const }, { type: "null" as const }] as const,
} as const;
void anyOfNullable;

type AnyOfNullable = FromJSONSchema<typeof anyOfNullable>;
const _aon1: AnyOfNullable = "hello";
const _aon2: AnyOfNullable = null;
// @ts-expect-error — number not in union
const _aonBad: AnyOfNullable = 42;
void _aon1;
void _aon2;
void _aonBad;

// ---------------------------------------------------------------------------
// oneOf → union type
// ---------------------------------------------------------------------------

const oneOfSchema = {
    oneOf: [{ type: "string" as const }, { type: "boolean" as const }] as const,
} as const;
void oneOfSchema;

type OneOfType = FromJSONSchema<typeof oneOfSchema>;
const _oo1: OneOfType = "hello";
const _oo2: OneOfType = true;
// @ts-expect-error — number not in union
const _ooBad: OneOfType = 42;
void _oo1;
void _oo2;
void _ooBad;

// ---------------------------------------------------------------------------
// allOf → intersection type
// ---------------------------------------------------------------------------

const allOfSchema = {
    allOf: [
        {
            type: "object" as const,
            properties: {
                name: { type: "string" as const },
            },
            required: ["name"] as string[],
        } as const,
        {
            type: "object" as const,
            properties: {
                age: { type: "number" as const },
            },
            required: ["age"] as string[],
        } as const,
    ] as const,
} as const;
void allOfSchema;

type AllOfType = FromJSONSchema<typeof allOfSchema>;
const _allo1: AllOfType = { name: "Ada", age: 30 };
// @ts-expect-error — missing age
const _alloBad: AllOfType = { name: "Ada" };
void _allo1;
void _alloBad;

// ---------------------------------------------------------------------------
// additionalProperties → Record<string, T>
// ---------------------------------------------------------------------------

const recordSchema = {
    type: "object" as const,
    additionalProperties: { type: "string" as const },
} as const;
void recordSchema;

type RecordType = FromJSONSchema<typeof recordSchema>;
const _rec1: RecordType = { foo: "bar", baz: "qux" };
const _recVal: string | undefined = _rec1.foo;
void _rec1;
void _recVal;

// Record with number values
const numRecordSchema = {
    type: "object" as const,
    additionalProperties: { type: "number" as const },
} as const;
void numRecordSchema;

type NumRecordType = FromJSONSchema<typeof numRecordSchema>;
const _nrec: NumRecordType = { x: 1, y: 2 };
const _nrecVal: number | undefined = _nrec.x;
void _nrec;
void _nrecVal;

// ---------------------------------------------------------------------------
// prefixItems → tuple types
// ---------------------------------------------------------------------------

const tupleSchema = {
    type: "array" as const,
    prefixItems: [
        { type: "string" as const },
        { type: "number" as const },
        { type: "boolean" as const },
    ] as const,
} as const;
void tupleSchema;

type TupleType = FromJSONSchema<typeof tupleSchema>;
const _tup: TupleType = ["hello", 42, true];
// @ts-expect-error — wrong order (number, string, boolean)
const _tupBad: TupleType = [42, "hello", true];
void _tup;
void _tupBad;

// Single-element tuple
const singleTuple = {
    type: "array" as const,
    prefixItems: [{ type: "string" as const }] as const,
} as const;
void singleTuple;

type SingleTuple = FromJSONSchema<typeof singleTuple>;
const _st: SingleTuple = ["only"];
// @ts-expect-error — should be [string]
const _stBad: SingleTuple = [42];
void _st;
void _stBad;

// ---------------------------------------------------------------------------
// $ref within JSON Schema ($defs)
// ---------------------------------------------------------------------------

const refSchema = {
    type: "object" as const,
    properties: {
        home: { $ref: "#/$defs/Address" } as const,
        work: { $ref: "#/$defs/Address" } as const,
    },
    required: ["home"] as string[],
    $defs: {
        Address: {
            type: "object" as const,
            properties: {
                street: { type: "string" as const },
                city: { type: "string" as const },
            },
            required: ["street", "city"] as string[],
        },
    },
} as const;
void refSchema;

type RefType = FromJSONSchema<typeof refSchema>;
const _ref1: RefType = {
    home: { street: "123 Main St", city: "London" },
    work: { street: "456 High St", city: "Manchester" },
};
const _refBad: RefType = {
    // @ts-expect-error — Address requires city
    home: { street: "123 Main St" },
};
void _ref1;
void _refBad;

// $ref with definitions (Draft 04)
const draft04Ref = {
    type: "object" as const,
    properties: {
        pet: { $ref: "#/definitions/Pet" } as const,
    },
    definitions: {
        Pet: {
            type: "object" as const,
            properties: {
                name: { type: "string" as const },
            },
            required: ["name"] as string[],
        },
    },
} as const;
void draft04Ref;

type Draft04Ref = FromJSONSchema<typeof draft04Ref>;
const _d04: Draft04Ref = { pet: { name: "Rex" } };
// @ts-expect-error — Pet requires name
const _d04Bad: Draft04Ref = { pet: {} };
void _d04;
void _d04Bad;

// ---------------------------------------------------------------------------
// Nested objects with required/optional
// ---------------------------------------------------------------------------

const nestedSchema = {
    type: "object" as const,
    properties: {
        name: { type: "string" as const },
        address: {
            type: "object" as const,
            properties: {
                street: { type: "string" as const },
                city: { type: "string" as const },
                postcode: { type: "string" as const },
            },
            required: ["street", "city"] as const,
        },
    },
    required: ["name"] as const,
} as const;
void nestedSchema;

type NestedType = FromJSONSchema<typeof nestedSchema>;
const _nest: NestedType = {
    name: "Ada",
    address: { street: "1 Tech Lane", city: "London" },
};
// postcode is optional
const _nest2: NestedType = {
    name: "Ada",
    address: { street: "1 Tech Lane", city: "London", postcode: "SW1A 1AA" },
};
// name is required
// @ts-expect-error — missing name
const _nestBad: NestedType = {
    address: { street: "1 Tech Lane", city: "London" },
};
void _nest;
void _nest2;
void _nestBad;

// ---------------------------------------------------------------------------
// OpenAPI 3.0: nullable support
// ---------------------------------------------------------------------------

const nullableOpenApi = {
    openapi: "3.0.0",
    components: {
        schemas: {
            User: {
                type: "object" as const,
                properties: {
                    name: { type: "string" as const },
                    nickname: {
                        type: "string" as const,
                        nullable: true,
                    },
                },
                required: ["name"] as const,
            },
        },
    },
} as const;
void nullableOpenApi;

type NullableOpenApiUser = ResolveOpenAPIRef<
    typeof nullableOpenApi,
    "#/components/schemas/User"
>;
// @ts-expect-error — nullable support not yet flowing through ResolveMaybeRef
const _noa: NullableOpenApiUser = { name: "Ada", nickname: null };
const _noa2: NullableOpenApiUser = { name: "Ada", nickname: "The Countess" };
// @ts-expect-error — name is required
const _noaBad: NullableOpenApiUser = { nickname: null };
void _noa;
void _noa2;
void _noaBad;

// ---------------------------------------------------------------------------
// OpenAPI: Swagger 2.0 definitions ref
// ---------------------------------------------------------------------------

const swaggerDoc = {
    swagger: "2.0",
    definitions: {
        Pet: {
            type: "object" as const,
            properties: {
                name: { type: "string" as const },
                status: { type: "string" as const },
            },
            required: ["name"] as const,
        },
    },
} as const;
void swaggerDoc;

type SwaggerPet = ResolveOpenAPIRef<typeof swaggerDoc, "#/definitions/Pet">;
const _swPet: SwaggerPet = { name: "Rex", status: "available" };
const _swPet2: SwaggerPet = { name: "Rex" };
// @ts-expect-error — name is required
const _swPetBad: SwaggerPet = { status: "available" };
void _swPet;
void _swPet2;
void _swPetBad;

// ---------------------------------------------------------------------------
// OpenAPI: multipart content type extraction
// ---------------------------------------------------------------------------

const multipartDoc = {
    openapi: "3.1.0",
    paths: {
        "/upload": {
            post: {
                requestBody: {
                    content: {
                        "multipart/form-data": {
                            schema: {
                                type: "object" as const,
                                properties: {
                                    file: {
                                        type: "string" as const,
                                        format: "binary" as const,
                                    },
                                    description: { type: "string" as const },
                                },
                                required: ["file"] as const,
                            },
                        },
                    },
                },
                responses: {} as Record<string, unknown>,
            },
        },
    },
} as const;
void multipartDoc;

type MultipartBody = ApiRequestBodyProps<
    typeof multipartDoc,
    "/upload",
    "post"
>;
const _mpFields: MultipartBody["fields"] = {
    file: { description: "Upload file" },
    description: { readOnly: true },
};
const _mpBad: MultipartBody["fields"] = {
    // @ts-expect-error — 'nme' is not a valid key
    nme: { readOnly: true },
};
void _mpFields;
void _mpBad;

// ---------------------------------------------------------------------------
// Complex: allOf + nullable + nested $ref
// ---------------------------------------------------------------------------

const complexSchema = {
    type: "object" as const,
    properties: {
        person: {
            allOf: [
                { $ref: "#/$defs/Name" } as const,
                {
                    type: "object" as const,
                    properties: {
                        age: { type: "number" as const },
                    },
                    required: ["age"] as const,
                },
            ] as const,
        },
        tags: {
            type: "array" as const,
            items: { type: "string" as const },
        },
        metadata: {
            type: "object" as const,
            additionalProperties: { type: "boolean" as const },
        },
    },
    required: ["person"] as const,
    $defs: {
        Name: {
            type: "object" as const,
            properties: {
                first: { type: "string" as const },
                last: { type: "string" as const },
            },
            required: ["first"] as const,
        },
    },
} as const;
void complexSchema;

type ComplexType = FromJSONSchema<typeof complexSchema>;
const _complex: ComplexType = {
    person: { first: "Ada", last: "Lovelace", age: 36 },
    tags: ["mathematician", "programmer"],
    metadata: { famous: true },
};
// metadata values must be boolean
const _metaVal: boolean | undefined = _complex.metadata?.famous;
void _complex;
void _metaVal;

// ---------------------------------------------------------------------------
// Array with items (non-tuple)
// ---------------------------------------------------------------------------

const arraySchema = {
    type: "array" as const,
    items: {
        type: "object" as const,
        properties: {
            id: { type: "string" as const },
            value: { type: "number" as const },
        },
        required: ["id"] as const,
    },
} as const;
void arraySchema;

type ArrayType = FromJSONSchema<typeof arraySchema>;
const _arr: ArrayType = [{ id: "a", value: 1 }, { id: "b" }];
// Each element must have id
// @ts-expect-error — missing id
const _arrBad: ArrayType = [{ value: 1 }];
void _arr;
void _arrBad;

// ===========================================================================
// Extended type inference tests — new JSON Schema keywords
// ===========================================================================

// ---------------------------------------------------------------------------
// additionalProperties: false (closed object)
// ---------------------------------------------------------------------------

const closedObject = {
    type: "object" as const,
    properties: {
        name: { type: "string" as const },
        age: { type: "number" as const },
    },
    required: ["name"] as const,
    additionalProperties: false,
} as const;
void closedObject;

type ClosedObjectType = FromJSONSchema<typeof closedObject>;
const _closedObj: ClosedObjectType = { name: "Ada", age: 30 };
const _closedObj2: ClosedObjectType = { name: "Ada" };
// Can still assign extra properties — TS can't enforce "no extra"
// but the schema captures additionalProperties: false
void _closedObj;
void _closedObj2;

// ---------------------------------------------------------------------------
// additionalProperties as schema alongside properties
// ---------------------------------------------------------------------------

const hybridObject = {
    type: "object" as const,
    properties: {
        name: { type: "string" as const },
    },
    required: ["name"] as const,
    additionalProperties: { type: "number" as const },
} as const;
void hybridObject;

type HybridObjectType = FromJSONSchema<typeof hybridObject>;
const _hybrid: HybridObjectType = { name: "Ada" };
// name is required
// @ts-expect-error — missing name
const _hybridBad: HybridObjectType = {};
void _hybrid;
void _hybridBad;

// ---------------------------------------------------------------------------
// patternProperties
// ---------------------------------------------------------------------------

const patternSchema = {
    type: "object" as const,
    patternProperties: {
        "^S_": { type: "string" as const },
        "^I_": { type: "number" as const },
    },
} as const;
void patternSchema;

type PatternType = FromJSONSchema<typeof patternSchema>;
// patternProperties are modelled as additional Record types
// The result is open — any key matching the pattern has the right type
const _pat: PatternType = { S_name: "Ada", I_count: 42 };
void _pat;

// ---------------------------------------------------------------------------
// dependentRequired
// ---------------------------------------------------------------------------

const depReqSchema = {
    type: "object" as const,
    properties: {
        name: { type: "string" as const },
        creditCard: { type: "string" as const },
        billingAddress: { type: "string" as const },
    },
    dependentRequired: {
        creditCard: ["billingAddress"] as const,
    },
} as const;
void depReqSchema;

type DepReqType = FromJSONSchema<typeof depReqSchema>;
// dependentRequired can't be expressed in TS types — all properties are optional
const _depReq: DepReqType = { name: "Ada", creditCard: "1234" };
void _depReq;

// ---------------------------------------------------------------------------
// dependentSchemas
// ---------------------------------------------------------------------------

const depSchemaTest = {
    type: "object" as const,
    properties: {
        kind: { type: "string" as const },
        value: { type: "number" as const },
    },
    dependentSchemas: {
        kind: {
            properties: {
                label: { type: "string" as const },
            },
            required: ["label"] as const,
        },
    },
} as const;
void depSchemaTest;

type DepSchemaType = FromJSONSchema<typeof depSchemaTest>;
// dependentSchemas can't be expressed in TS types — base properties only
const _depSchema: DepSchemaType = { kind: "test", value: 42 };
void _depSchema;

// ---------------------------------------------------------------------------
// $dynamicRef / $dynamicAnchor (Draft 2020-12)
// ---------------------------------------------------------------------------

const dynamicRefSchema = {
    $dynamicAnchor: "Tree",
    type: "object" as const,
    properties: {
        label: { type: "string" as const },
        children: {
            type: "array" as const,
            items: { $dynamicRef: "#Tree" } as const,
        },
    },
    required: ["label"] as const,
} as const;
void dynamicRefSchema;

// After normalisation: $dynamicRef → $ref: "#Tree"
// Type-level parser can't resolve dynamic refs — falls through to unknown
type DynamicRefType = FromJSONSchema<typeof dynamicRefSchema>;
const _dynRef: DynamicRefType = { label: "root" };
void _dynRef;

// ---------------------------------------------------------------------------
// Draft 04 items-as-array (tuple v1)
// ---------------------------------------------------------------------------

const draft04Tuple = {
    type: "array" as const,
    items: [{ type: "string" as const }, { type: "number" as const }] as const,
} as const;
void draft04Tuple;

// After normalisation: items array → prefixItems
// Type-level parser operates on raw schema — items-as-array is treated as
// a single schema (the array itself), not as a tuple.
// Runtime normalisation converts items[] → prefixItems for the walker.
type Draft04TupleType = FromJSONSchema<typeof draft04Tuple>;
const _d04tup: Draft04TupleType = [];
void _d04tup;

// ---------------------------------------------------------------------------
// Security requirements type test
// ---------------------------------------------------------------------------

import type {
    SecurityRequirement,
    SecurityScheme,
    HeaderInfo,
    WebhookInfo,
} from "../src/openapi/parser.ts";

const _secReq: SecurityRequirement = { name: "bearerAuth", scopes: [] };
const _secReq2: SecurityRequirement = {
    name: "oauth",
    scopes: ["read", "write"],
};
void _secReq;
void _secReq2;

const _secScheme: SecurityScheme = {
    type: "http",
    description: "Bearer token",
    scheme: "bearer",
    bearerFormat: "JWT",
    name: undefined,
    location: undefined,
    flows: undefined,
    openIdConnectUrl: undefined,
};
void _secScheme;

const _headerInfo: HeaderInfo = {
    name: "X-Rate-Limit",
    description: "Rate limit",
    required: true,
    deprecated: false,
    schema: undefined,
};
void _headerInfo;

const _webhook: WebhookInfo = {
    name: "newPet",
    operations: [],
};
void _webhook;
