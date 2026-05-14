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
import type {
    FieldOverride,
    FieldOverrides,
    FromJSONSchema,
    ResolveOpenAPIRef,
} from "../src/core/types.ts";
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
import type { PathOfType, TypeAtPath } from "../src/core/types.ts";

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
