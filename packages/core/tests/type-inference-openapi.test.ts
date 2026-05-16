/**
 * Extended type inference tests — new keywords, OpenAPI types, security.
 *
 * Compile-time tests for additionalProperties, dependentSchemas,
 * dependentRequired, $dynamicRef, Draft 04 tuples, and OpenAPI parser types.
 */

import type { FromJSONSchema } from "../src/core/typeInference.ts";

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
