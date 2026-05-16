/**
 * Extended walker tests — record fields and circular \$ref resolution.
 *
 * Extracted from walker.unit.test.ts — tests RecordField walking and
 * circular \$ref handling (self-referencing, mutually-referencing, and
 * depth-limited resolution).
 */

import { describe, it, expect } from "vitest";
import { isObjectField, isArrayField } from "../src/core/types.ts";
import { walk } from "../src/core/walker.ts";
import { assertDefined, valueTypeOf } from "./helpers.ts";

describe("walk — record", () => {
    it("walks an object with additionalProperties as a record", () => {
        const tree = walk(
            {
                type: "object",
                additionalProperties: { type: "number" },
            },
            {}
        );
        expect(tree.type).toBe("record");
        expect(valueTypeOf(tree)).toBeTruthy();
        expect(
            assertDefined(valueTypeOf(tree), "expected valueType").type
        ).toBe("number");
    });
});

// ---------------------------------------------------------------------------
// Circular $ref
// ---------------------------------------------------------------------------

describe("circular ref resolution", () => {
    it("handles self-referencing schemas without infinite loop", () => {
        const schema = {
            type: "object",
            properties: {
                name: { type: "string" },
                parent: { $ref: "#/$defs/Person" },
            },
            $defs: {
                Person: {
                    type: "object",
                    properties: {
                        name: { type: "string" },
                        parent: { $ref: "#/$defs/Person" },
                    },
                },
            },
        } as Record<string, unknown>;

        const result = walk(schema, { rootDocument: schema });

        expect(result.type).toBe("object");
        if (!isObjectField(result)) return;
        const parentField = assertDefined(result.fields.parent, "parent");
        // Circular ref resolves to the Person schema (object with name + parent)
        expect(parentField.type).toBe("object");
        if (!isObjectField(parentField)) return;
        expect("parent" in parentField.fields).toBe(true);
    });

    it("handles mutually-referencing schemas", () => {
        const schema = {
            type: "object",
            properties: {
                user: { $ref: "#/$defs/User" },
            },
            $defs: {
                User: {
                    type: "object",
                    properties: {
                        name: { type: "string" },
                        posts: {
                            type: "array",
                            items: { $ref: "#/$defs/Post" },
                        },
                    },
                },
                Post: {
                    type: "object",
                    properties: {
                        title: { type: "string" },
                        author: { $ref: "#/$defs/User" },
                    },
                },
            },
        } as Record<string, unknown>;

        const result = walk(schema, { rootDocument: schema });

        expect(result.type).toBe("object");
        if (!isObjectField(result)) return;
        const user = assertDefined(result.fields.user, "user");
        expect(user.type).toBe("object");
        if (!isObjectField(user)) return;
        const posts = assertDefined(user.fields.posts, "posts");
        expect(posts.type).toBe("array");
        if (!isArrayField(posts)) return;
        const element = posts.element;
        if (element === undefined) return;
        expect(element.type).toBe("object");
        if (!isObjectField(element)) return;
        const author = assertDefined(element.fields.author, "author");
        expect(author.type).toBe("object");
    });

    it("returns unknown for deeply nested refs exceeding max depth", () => {
        // Build a chain of refs: A → B → C → ... → Z
        const defs: Record<string, unknown> = {};
        const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
        for (let i = 0; i < letters.length - 1; i++) {
            const current = String(letters[i]);
            const next = String(letters[i + 1]);
            defs[current] = {
                type: "object",
                properties: {
                    next: { $ref: `#/$defs/${next}` },
                },
            };
        }
        defs[String(letters.at(-1))] = {
            type: "string",
        };

        const schema = {
            type: "object",
            properties: { start: { $ref: "#/$defs/A" } },
            $defs: defs,
        } as Record<string, unknown>;

        // Should not infinite loop — depth limit kicks in
        const result = walk(schema, { rootDocument: schema });
        expect(result.type).toBe("object");
    });
});

// ---------------------------------------------------------------------------
// propertyNames on ObjectField
// ---------------------------------------------------------------------------

describe("walk — propertyNames", () => {
    it("walks propertyNames on an object with properties", () => {
        const tree = walk({
            type: "object",
            properties: {
                name: { type: "string" },
            },
            propertyNames: { pattern: "^[a-zA-Z]" },
        });

        expect(isObjectField(tree)).toBe(true);
        if (!isObjectField(tree)) return;

        expect(tree.propertyNames).toBeDefined();
        expect(tree.propertyNames?.type).toBe("unknown");
    });

    it("omits propertyNames when not present", () => {
        const tree = walk({
            type: "object",
            properties: {
                name: { type: "string" },
            },
        });

        expect(isObjectField(tree)).toBe(true);
        if (!isObjectField(tree)) return;

        expect(tree.propertyNames).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// unevaluatedItems on ArrayField
// ---------------------------------------------------------------------------

describe("walk — unevaluatedItems", () => {
    it("walks unevaluatedItems on an array", () => {
        const tree = walk({
            type: "array",
            items: { type: "string" },
            unevaluatedItems: { type: "number" },
        });

        expect(isArrayField(tree)).toBe(true);
        if (!isArrayField(tree)) return;

        expect(tree.unevaluatedItems).toBeDefined();
        expect(tree.unevaluatedItems?.type).toBe("number");
    });

    it("omits unevaluatedItems when not present", () => {
        const tree = walk({
            type: "array",
            items: { type: "string" },
        });

        expect(isArrayField(tree)).toBe(true);
        if (!isArrayField(tree)) return;

        expect(tree.unevaluatedItems).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// examples extraction
// ---------------------------------------------------------------------------

describe("walk — examples", () => {
    it("extracts examples from a string schema", () => {
        const tree = walk({
            type: "string",
            examples: ["hello", "world"],
        });

        expect(tree.type).toBe("string");
        expect(tree.examples).toEqual(["hello", "world"]);
    });

    it("extracts examples from an object with nested examples", () => {
        const tree = walk({
            type: "object",
            properties: {
                name: {
                    type: "string",
                    examples: ["Ada", "Grace"],
                },
            },
        });

        expect(isObjectField(tree)).toBe(true);
        if (!isObjectField(tree)) return;

        const nameField = tree.fields.name;
        expect(nameField).toBeDefined();
        expect(nameField?.examples).toEqual(["Ada", "Grace"]);
    });

    it("omits examples when not present", () => {
        const tree = walk({
            type: "string",
        });

        expect(tree.examples).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// OpenAPI parser extensions
// ---------------------------------------------------------------------------

describe("OpenAPI parser extensions", () => {
    it("extracts externalDocs from a schema", async () => {
        const { getExternalDocs } = await import("../src/openapi/parser.ts");
        const docs = getExternalDocs({
            externalDocs: {
                url: "https://example.com/docs",
                description: "API docs",
            },
        });
        expect(docs).toEqual({
            url: "https://example.com/docs",
            description: "API docs",
        });
    });

    it("returns undefined for missing externalDocs", async () => {
        const { getExternalDocs } = await import("../src/openapi/parser.ts");
        const docs = getExternalDocs({});
        expect(docs).toBeUndefined();
    });

    it("extracts XML info from a schema", async () => {
        const { getXmlInfo } = await import("../src/openapi/parser.ts");
        const xml = getXmlInfo({
            xml: {
                name: "Pet",
                namespace: "https://example.com",
                prefix: "pet",
                attribute: true,
                wrapped: false,
            },
        });
        expect(xml).toEqual({
            name: "Pet",
            namespace: "https://example.com",
            prefix: "pet",
            attribute: true,
            wrapped: false,
        });
    });

    it("returns undefined for missing XML info", async () => {
        const { getXmlInfo } = await import("../src/openapi/parser.ts");
        const xml = getXmlInfo({});
        expect(xml).toBeUndefined();
    });

    it("lists callbacks from an operation", async () => {
        const { parseOpenApiDocument, listCallbacks } =
            await import("../src/openapi/parser.ts");
        const doc = {
            openapi: "3.0.3",
            info: { title: "Test", version: "1.0" },
            paths: {
                "/subscribe": {
                    post: {
                        summary: "Subscribe",
                        callbacks: {
                            onEvent: {
                                "{$request.body#/callbackUrl}": {
                                    post: {
                                        summary: "Event callback",
                                        requestBody: {
                                            content: {
                                                "application/json": {
                                                    schema: {
                                                        type: "object",
                                                    },
                                                },
                                            },
                                        },
                                        responses: {
                                            "200": { description: "OK" },
                                        },
                                    },
                                },
                            },
                        },
                        responses: { "200": { description: "Subscribed" } },
                    },
                },
            },
        };
        const parsed = parseOpenApiDocument(doc);
        const callbacks = listCallbacks(parsed, "/subscribe", "post");
        expect(callbacks.length).toBe(1);
        expect(callbacks[0]?.name).toBe("onEvent");
        expect(callbacks[0]?.operations.length).toBe(1);
    });

    it("lists links from a response", async () => {
        const { parseOpenApiDocument, getLinks } =
            await import("../src/openapi/parser.ts");
        const doc = {
            openapi: "3.0.3",
            info: { title: "Test", version: "1.0" },
            paths: {
                "/users": {
                    post: {
                        summary: "Create user",
                        responses: {
                            "201": {
                                description: "Created",
                                links: {
                                    GetUserById: {
                                        operationId: "getUser",
                                        parameters: {
                                            userId: "$response.body#/id",
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        };
        const parsed = parseOpenApiDocument(doc);
        const links = getLinks(parsed, "/users", "post", "201");
        expect(links.length).toBe(1);
        expect(links[0]?.name).toBe("GetUserById");
        expect(links[0]?.operationId).toBe("getUser");
        expect(links[0]?.parameters.get("userId")).toBe("$response.body#/id");
    });

    it("returns empty arrays for missing callbacks and links", async () => {
        const { parseOpenApiDocument, listCallbacks, getLinks } =
            await import("../src/openapi/parser.ts");
        const doc = {
            openapi: "3.0.3",
            info: { title: "Test", version: "1.0" },
            paths: {
                "/items": {
                    get: {
                        summary: "List items",
                        responses: { "200": { description: "OK" } },
                    },
                },
            },
        };
        const parsed = parseOpenApiDocument(doc);
        expect(listCallbacks(parsed, "/items", "get")).toEqual([]);
        expect(getLinks(parsed, "/items", "get", "200")).toEqual([]);
    });
});
