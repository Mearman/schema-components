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
