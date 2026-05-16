/**
 * Compile-time type tests for advanced type inference features.
 *
 * Verifies that FromJSONSchema handles:
 * - $anchor / $dynamicAnchor resolution
 * - $recursiveRef fallback to unknown
 * - if/then/else base schema inference
 * - not → unknown
 * - patternProperties → loose index signature
 * - propertyNames → ignored (doesn't affect type)
 * - dependentSchemas / dependentRequired → ignored
 * - contains → doesn't affect element type
 * - OpenAPI path-based $ref resolution
 */

import type {
    FromJSONSchema,
    ResolveOpenAPIRef,
} from "../src/core/typeInference.ts";

// ===========================================================================
// $anchor resolution
// ===========================================================================

const anchorSchema = {
    type: "object" as const,
    $defs: {
        Node: {
            $anchor: "TreeNode",
            type: "object" as const,
            properties: {
                label: { type: "string" as const },
            },
            required: ["label"] as const,
        },
    },
    properties: {
        child: { $ref: "#TreeNode" },
    },
} as const;
void anchorSchema;

type AnchorResult = FromJSONSchema<typeof anchorSchema>;
const _anchorObj: AnchorResult = { child: { label: "test" } };
void _anchorObj;

// ===========================================================================
// $dynamicAnchor resolution
// ===========================================================================

const dynamicAnchorSchema = {
    type: "object" as const,
    $defs: {
        Node: {
            $dynamicAnchor: "Node",
            type: "object" as const,
            properties: {
                name: { type: "string" as const },
            },
            required: ["name"] as const,
        },
    },
    properties: {
        child: { $ref: "#Node" },
    },
} as const;
void dynamicAnchorSchema;

type DynamicAnchorResult = FromJSONSchema<typeof dynamicAnchorSchema>;
const _dynamicObj: DynamicAnchorResult = { child: { name: "root" } };
void _dynamicObj;

// ===========================================================================
// $recursiveRef → unknown (TS limitation)
// ===========================================================================

const recursiveSchema = {
    type: "object" as const,
    properties: {
        label: { type: "string" as const },
        children: { $recursiveRef: "#" },
    },
} as const;
void recursiveSchema;

type RecursiveResult = FromJSONSchema<typeof recursiveSchema>;
// $recursiveRef resolves to unknown — children is unknown
const _recursiveObj: RecursiveResult = {
    label: "root",
    children: "anything goes",
};
void _recursiveObj;

// ===========================================================================
// if/then/else → base schema without conditionals
// ===========================================================================

const conditionalSchema = {
    type: "object" as const,
    properties: {
        country: { type: "string" as const },
        postalCode: { type: "string" as const },
    },
    required: ["country"] as const,
    if: { properties: { country: { const: "US" } } },
    then: {
        properties: {
            postalCode: { type: "string" as const, pattern: "^[0-9]{5}$" },
        },
    },
} as const;
void conditionalSchema;

type ConditionalResult = FromJSONSchema<typeof conditionalSchema>;
// Should infer the base schema (country required, postalCode optional)
const _condObj: ConditionalResult = { country: "US" };
const _condObj2: ConditionalResult = { country: "GB", postalCode: "SW1A1AA" };
// @ts-expect-error — country is required
const _condBad: ConditionalResult = { postalCode: "12345" };
void _condObj;
void _condObj2;
void _condBad;

// ===========================================================================
// not → unknown
// ===========================================================================

const notSchema = {
    not: { type: "string" },
} as const;
void notSchema;

type NotResult = FromJSONSchema<typeof notSchema>;
// not produces unknown — any value is valid at the type level
const _notVal: NotResult = 42;
const _notVal2: NotResult = "string is fine at type level";
void _notVal;
void _notVal2;

// ===========================================================================
// patternProperties → loose index signature
// ===========================================================================

const patternSchema = {
    type: "object" as const,
    properties: {
        name: { type: "string" as const },
    },
    required: ["name"] as const,
    patternProperties: {
        "^S_": { type: "string" as const },
        "^I_": { type: "integer" as const },
    },
} as const;
void patternSchema;

type PatternResult = FromJSONSchema<typeof patternSchema>;
const _patternObj: PatternResult = {
    name: "Ada",
    S_role: "engineer",
    I_level: 5,
    extra_key: "also works",
};
void _patternObj;

// ===========================================================================
// propertyNames → ignored (doesn't affect type)
// ===========================================================================

const propertyNamesSchema = {
    type: "object" as const,
    properties: {
        name: { type: "string" as const },
    },
    required: ["name"] as const,
    propertyNames: { pattern: "^[a-zA-Z_]" },
} as const;
void propertyNamesSchema;

type PropertyNamesResult = FromJSONSchema<typeof propertyNamesSchema>;
// propertyNames is ignored — type is the same as without it
const _pnObj: PropertyNamesResult = { name: "Ada" };
void _pnObj;

// ===========================================================================
// dependentSchemas / dependentRequired → ignored
// ===========================================================================

const depSchema = {
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
    dependentRequired: {
        creditCard: ["billingAddress"],
    },
} as const;
void depSchema;

type DepResult = FromJSONSchema<typeof depSchema>;
// dependentSchemas/dependentRequired are ignored — base type is just the properties
const _depObj: DepResult = { kind: "metric", value: 42 };
void _depObj;

// ===========================================================================
// contains → doesn't affect element type
// ===========================================================================

const containsSchema = {
    type: "array" as const,
    items: { type: "string" as const },
    contains: { const: "required-item" },
    minContains: 1,
    maxContains: 5,
} as const;
void containsSchema;

type ContainsResult = FromJSONSchema<typeof containsSchema>;
// Element type is still string[] (contains is a runtime constraint)
const _containsArr: ContainsResult = ["a", "b", "c"];
void _containsArr;

// ===========================================================================
// OpenAPI path-based $ref resolution
// ===========================================================================

const openApiSpec = {
    openapi: "3.1.0",
    info: { title: "Test", version: "1.0" },
    paths: {
        "/users": {
            get: {
                summary: "List users",
                responses: {
                    "200": {
                        description: "Users",
                        content: {
                            "application/json": {
                                schema: {
                                    type: "array" as const,
                                    items: {
                                        type: "object" as const,
                                        properties: {
                                            id: { type: "string" as const },
                                            name: { type: "string" as const },
                                        },
                                        required: ["id", "name"] as const,
                                    },
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
                properties: {
                    id: { type: "string" as const },
                    email: { type: "string" as const },
                },
                required: ["id"] as const,
            },
        },
    },
} as const;
void openApiSpec;

// Component schema ref (existing capability)
type UserRef = ResolveOpenAPIRef<
    typeof openApiSpec,
    "#/components/schemas/User"
>;
const _userRef: UserRef = { id: "abc", email: "ada@example.com" };
const _userRefMinimal: UserRef = { id: "abc" };
// @ts-expect-error — id is required
const _userRefBad: UserRef = { email: "ada@example.com" };
void _userRef;
void _userRefMinimal;
void _userRefBad;

// Path-based ref
type UsersResponse = ResolveOpenAPIRef<
    typeof openApiSpec,
    "#/paths//users/get/responses/200/content/application/json/schema"
>;
const _usersResp: UsersResponse = [{ id: "1", name: "Ada" }];
void _usersResp;

// Ensure file is treated as a module
export {};
