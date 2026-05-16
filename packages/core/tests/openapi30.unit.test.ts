/**
 * Tests for OpenAPI 3.0.x normalisation — nullable, discriminator,
 * example, and deep document walking.
 */

import { describe, it, expect } from "vitest";
import {
    normaliseOpenApi30Node,
    normaliseOpenApi30Discriminator,
    deepNormaliseOpenApi30Doc,
} from "../src/core/openapi30.ts";
import { isObject } from "../src/core/guards.ts";
import { deepNormalise } from "../src/core/normalise.ts";

// ---------------------------------------------------------------------------
// Helpers — narrow Record<string, unknown> property chains without assertions
// ---------------------------------------------------------------------------

function prop(
    parent: unknown,
    key: string
): Record<string, unknown> | undefined {
    if (!isObject(parent)) return undefined;
    const value = parent[key];
    return isObject(value) ? value : undefined;
}

function propArr(parent: unknown, key: string): unknown[] | undefined {
    if (!isObject(parent)) return undefined;
    const value = parent[key];
    return Array.isArray(value) ? value : undefined;
}

function propVal(parent: unknown, key: string): unknown {
    if (!isObject(parent)) return undefined;
    return parent[key];
}

// ---------------------------------------------------------------------------
// Nullable normalisation
// ---------------------------------------------------------------------------

describe("normaliseOpenApi30Node", () => {
    it("wraps nullable: true in anyOf [self, null]", () => {
        const result = normaliseOpenApi30Node({
            type: "string",
            nullable: true,
        });
        expect(result.nullable).toBeUndefined();
        const anyOf = propArr(result, "anyOf");
        expect(anyOf).toBeDefined();
        if (anyOf === undefined) return;
        expect(anyOf.length).toBe(2);
        expect(anyOf[1]).toEqual({ type: "null" });
    });

    it("strips nullable: false", () => {
        const result = normaliseOpenApi30Node({
            type: "string",
            nullable: false,
        });
        expect(result.nullable).toBeUndefined();
        expect(result.type).toBe("string");
    });

    it("handles nullable: true with existing anyOf", () => {
        const result = normaliseOpenApi30Node({
            anyOf: [{ type: "string" }, { type: "number" }],
            nullable: true,
        });
        const anyOf = propArr(result, "anyOf");
        expect(anyOf).toBeDefined();
        if (anyOf === undefined) return;
        expect(anyOf.length).toBe(3);
        expect(anyOf[2]).toEqual({ type: "null" });
        expect(result.nullable).toBeUndefined();
    });

    it("handles nullable: true with existing oneOf", () => {
        const result = normaliseOpenApi30Node({
            oneOf: [{ type: "string" }],
            nullable: true,
        });
        const anyOf = propArr(result, "anyOf");
        expect(anyOf).toBeDefined();
        if (anyOf === undefined) return;
        expect(anyOf.length).toBe(2);
        expect(result.oneOf).toBeUndefined();
    });

    it("handles nullable: true with existing allOf", () => {
        const result = normaliseOpenApi30Node({
            allOf: [
                {
                    type: "object",
                    properties: { name: { type: "string" } },
                },
            ],
            nullable: true,
        });
        const anyOf = propArr(result, "anyOf");
        expect(anyOf).toBeDefined();
        if (anyOf === undefined) return;
        expect(anyOf.length).toBe(2);
        expect(result.allOf).toBeUndefined();
        // Find the allOf wrapper option
        const first = anyOf.find((item) => isObject(item) && "allOf" in item);
        expect(first).toBeDefined();
        expect(anyOf[1]).toEqual({ type: "null" });
    });

    it("passes through non-nullable schemas", () => {
        const result = normaliseOpenApi30Node({ type: "integer" });
        expect(result.type).toBe("integer");
        expect(result.nullable).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// Example normalisation
// ---------------------------------------------------------------------------

describe("example normalisation", () => {
    it("converts example to examples array", () => {
        const result = normaliseOpenApi30Node({
            type: "string",
            example: "hello",
        });
        expect(result.example).toBeUndefined();
        expect(result.examples).toEqual(["hello"]);
    });

    it("keeps existing examples and removes example", () => {
        const result = normaliseOpenApi30Node({
            type: "string",
            example: "old",
            examples: ["new1", "new2"],
        });
        expect(result.example).toBeUndefined();
        expect(result.examples).toEqual(["new1", "new2"]);
    });
});

// ---------------------------------------------------------------------------
// Discriminator normalisation
// ---------------------------------------------------------------------------

describe("normaliseOpenApi30Discriminator", () => {
    it("injects const from mapping", () => {
        const node = {
            oneOf: [
                { $ref: "#/components/schemas/Cat" },
                { $ref: "#/components/schemas/Dog" },
            ],
            discriminator: {
                propertyName: "type",
                mapping: {
                    cat: "#/components/schemas/Cat",
                    dog: "#/components/schemas/Dog",
                },
            },
        };

        const result = normaliseOpenApi30Discriminator(node);
        expect(result.discriminator).toBeUndefined();

        const oneOf = propArr(result, "oneOf");
        expect(oneOf).toBeDefined();
        if (oneOf === undefined) return;

        const catOption = oneOf[0];
        const dogOption = oneOf[1];
        const catProps = prop(catOption, "properties");
        const dogProps = prop(dogOption, "properties");
        const catType = prop(catProps, "type");
        const dogType = prop(dogProps, "type");

        expect(propVal(catType, "const")).toBe("cat");
        expect(propVal(dogType, "const")).toBe("dog");
    });

    it("derives const from $ref fragment when no mapping", () => {
        const node = {
            oneOf: [
                { $ref: "#/components/schemas/Cat" },
                { $ref: "#/components/schemas/Dog" },
            ],
            discriminator: {
                propertyName: "petType",
            },
        };

        const result = normaliseOpenApi30Discriminator(node);
        const oneOf = propArr(result, "oneOf");
        expect(oneOf).toBeDefined();
        if (oneOf === undefined) return;

        const catOption = oneOf[0];
        const catProps = prop(catOption, "properties");
        const petType = prop(catProps, "petType");

        expect(propVal(petType, "const")).toBe("Cat");
    });

    it("passes through when no discriminator", () => {
        const node = { oneOf: [{ type: "string" }] };
        const result = normaliseOpenApi30Discriminator(node);
        expect(result).toBe(node);
    });
});

// ---------------------------------------------------------------------------
// Deep document normalisation
// ---------------------------------------------------------------------------

describe("deepNormaliseOpenApi30Doc", () => {
    it("normalises component schemas", () => {
        const doc = {
            openapi: "3.0.3",
            info: { title: "Test", version: "1.0" },
            components: {
                schemas: {
                    User: {
                        type: "object",
                        properties: {
                            name: { type: "string" },
                            nickname: { type: "string", nullable: true },
                        },
                    },
                },
            },
            paths: {},
        };

        const result = deepNormaliseOpenApi30Doc(doc, deepNormalise);
        const nickname = prop(
            prop(
                prop(prop(prop(result, "components"), "schemas"), "User"),
                "properties"
            ),
            "nickname"
        );

        expect(nickname).toBeDefined();
        if (nickname === undefined) return;
        expect(nickname.nullable).toBeUndefined();
        expect(nickname.anyOf).toBeDefined();
    });

    it("normalises request body schemas", () => {
        const doc = {
            openapi: "3.0.3",
            info: { title: "Test", version: "1.0" },
            paths: {
                "/users": {
                    post: {
                        requestBody: {
                            content: {
                                "application/json": {
                                    schema: {
                                        type: "string",
                                        nullable: true,
                                    },
                                },
                            },
                        },
                        responses: {},
                    },
                },
            },
        };

        const result = deepNormaliseOpenApi30Doc(doc, deepNormalise);

        // Navigate step by step for clarity
        const paths = prop(result, "paths");
        const users = prop(paths, "/users");
        const post = prop(users, "post");
        const body = prop(post, "requestBody");
        const bodyContent = prop(body, "content");
        const jsonContent = prop(bodyContent, "application/json");
        const bodySchema = prop(jsonContent, "schema");

        expect(bodySchema).toBeDefined();
        if (bodySchema === undefined) return;
        expect(bodySchema.nullable).toBeUndefined();
        expect(bodySchema.anyOf).toBeDefined();
    });

    it("normalises parameter schemas", () => {
        const doc = {
            openapi: "3.0.3",
            info: { title: "Test", version: "1.0" },
            paths: {
                "/search": {
                    get: {
                        parameters: [
                            {
                                name: "q",
                                in: "query",
                                schema: {
                                    type: "string",
                                    nullable: true,
                                },
                            },
                        ],
                        responses: {},
                    },
                },
            },
        };

        const result = deepNormaliseOpenApi30Doc(doc, deepNormalise);
        const paths = prop(result, "paths");
        const search = prop(paths, "/search");
        const getOp = prop(search, "get");
        const params = propArr(getOp, "parameters");
        expect(params).toBeDefined();
        if (params === undefined) return;

        const param = params[0];
        const paramSchema = prop(param, "schema");

        expect(paramSchema).toBeDefined();
        if (paramSchema === undefined) return;
        expect(paramSchema.nullable).toBeUndefined();
    });

    it("normalises response schemas", () => {
        const doc = {
            openapi: "3.0.3",
            info: { title: "Test", version: "1.0" },
            paths: {
                "/data": {
                    get: {
                        responses: {
                            "200": {
                                content: {
                                    "application/json": {
                                        schema: {
                                            type: "string",
                                            nullable: true,
                                            example: "test",
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        };

        const result = deepNormaliseOpenApi30Doc(doc, deepNormalise);
        const paths = prop(result, "paths");
        const data = prop(paths, "/data");
        const getOp = prop(data, "get");
        const responses = prop(getOp, "responses");
        const ok = prop(responses, "200");
        const okContent = prop(ok, "content");
        const jsonContent = prop(okContent, "application/json");
        const schema = prop(jsonContent, "schema");

        expect(schema).toBeDefined();
        if (schema === undefined) return;
        expect(schema.nullable).toBeUndefined();
        expect(schema.anyOf).toBeDefined();
    });

    it("normalises path-level parameters", () => {
        const doc = {
            openapi: "3.0.3",
            info: { title: "Test", version: "1.0" },
            paths: {
                "/items/{id}": {
                    parameters: [
                        {
                            name: "id",
                            in: "path",
                            required: true,
                            schema: { type: "string", example: "abc" },
                        },
                    ],
                    get: {
                        responses: {},
                    },
                },
            },
        };

        const result = deepNormaliseOpenApi30Doc(doc, deepNormalise);
        const paths = prop(result, "paths");
        const items = prop(paths, "/items/{id}");
        const params = propArr(items, "parameters");
        expect(params).toBeDefined();
        if (params === undefined) return;

        const param = params[0];
        const paramSchema = prop(param, "schema");

        expect(paramSchema).toBeDefined();
        if (paramSchema === undefined) return;
        // example → examples
        expect(paramSchema.example).toBeUndefined();
        expect(paramSchema.examples).toEqual(["abc"]);
    });

    it("passes through documents without components", () => {
        const doc = {
            openapi: "3.0.3",
            info: { title: "Test", version: "1.0" },
            paths: {},
        };

        const result = deepNormaliseOpenApi30Doc(doc, deepNormalise);
        expect(result.openapi).toBe("3.0.3");
    });
});
