/**
 * Unit tests for the OpenAPI document parser.
 *
 * Tests document parsing, operation extraction, parameter merging,
 * request body extraction, response extraction, and $ref resolution.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
    parseOpenApiDocument,
    getSchema,
    listOperations,
    getParameters,
    getRequestBody,
    getResponses,
} from "../src/openapi/parser.ts";

// ---------------------------------------------------------------------------
// Pet store fixture
// ---------------------------------------------------------------------------

const petStore = {
    openapi: "3.1.0",
    info: { title: "Pet Store", version: "1.0.0" },
    paths: {
        "/pets": {
            get: {
                operationId: "listPets",
                summary: "List all pets",
                parameters: [
                    {
                        name: "limit",
                        in: "query",
                        required: false,
                        schema: { type: "integer", minimum: 0, maximum: 100 },
                    },
                    {
                        name: "status",
                        in: "query",
                        required: false,
                        schema: {
                            type: "string",
                            enum: ["available", "sold"],
                        },
                    },
                ],
                responses: {
                    "200": {
                        description: "A list of pets",
                        content: {
                            "application/json": {
                                schema: {
                                    type: "array",
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
                operationId: "createPet",
                summary: "Create a pet",
                requestBody: {
                    required: true,
                    description: "Pet to create",
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                properties: {
                                    name: { type: "string" },
                                    tag: { type: "string" },
                                },
                                required: ["name"],
                            },
                        },
                    },
                },
                responses: {
                    "201": {
                        description: "Created",
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
        "/pets/{petId}": {
            get: {
                operationId: "getPet",
                parameters: [
                    {
                        name: "petId",
                        in: "path",
                        required: true,
                        schema: { type: "string" },
                    },
                ],
                responses: {
                    "200": {
                        description: "A pet",
                        content: {
                            "application/json": {
                                schema: {
                                    $ref: "#/components/schemas/Pet",
                                },
                            },
                        },
                    },
                    "404": {
                        description: "Not found",
                    },
                },
            },
        },
    },
    components: {
        schemas: {
            Pet: {
                type: "object",
                properties: {
                    id: { type: "string", readOnly: true },
                    name: { type: "string" },
                    status: { type: "string", enum: ["available", "sold"] },
                },
                required: ["id", "name"],
            },
        },
    },
};

// ---------------------------------------------------------------------------
// parseOpenApiDocument
// ---------------------------------------------------------------------------

describe("parseOpenApiDocument", () => {
    it("extracts component schemas", () => {
        const parsed = parseOpenApiDocument(petStore);
        assert.ok(parsed.schemas.has("#/components/schemas/Pet"));
        const pet = parsed.schemas.get("#/components/schemas/Pet");
        assert.equal(pet?.type, "object");
    });

    it("preserves the original document", () => {
        const parsed = parseOpenApiDocument(petStore);
        assert.equal(parsed.doc, petStore);
    });

    it("handles empty components", () => {
        const parsed = parseOpenApiDocument({ openapi: "3.1.0" });
        assert.equal(parsed.schemas.size, 0);
    });
});

// ---------------------------------------------------------------------------
// getSchema
// ---------------------------------------------------------------------------

describe("getSchema", () => {
    it("resolves a cached component schema", () => {
        const parsed = parseOpenApiDocument(petStore);
        const schema = getSchema(parsed, "#/components/schemas/Pet");
        assert.equal(schema?.type, "object");
    });

    it("returns undefined for unknown ref", () => {
        const parsed = parseOpenApiDocument(petStore);
        const schema = getSchema(parsed, "#/components/schemas/Unknown");
        assert.equal(schema, undefined);
    });

    it("caches on first resolve", () => {
        const parsed = parseOpenApiDocument(petStore);
        const schema = getSchema(parsed, "#/paths/~1pets/get");
        assert.ok(schema);
        const cached = getSchema(parsed, "#/paths/~1pets/get");
        assert.equal(schema, cached);
    });
});

// ---------------------------------------------------------------------------
// listOperations
// ---------------------------------------------------------------------------

describe("listOperations", () => {
    it("lists all operations", () => {
        const parsed = parseOpenApiDocument(petStore);
        const ops = listOperations(parsed);
        assert.equal(ops.length, 3);
    });

    it("extracts operation metadata", () => {
        const parsed = parseOpenApiDocument(petStore);
        const ops = listOperations(parsed);
        const listPets = ops.find(
            (op) => op.path === "/pets" && op.method === "get"
        );
        assert.ok(listPets);
        assert.equal(listPets.operationId, "listPets");
        assert.equal(listPets.summary, "List all pets");
        assert.equal(listPets.deprecated, false);
    });

    it("handles documents with no paths", () => {
        const parsed = parseOpenApiDocument({ openapi: "3.1.0" });
        const ops = listOperations(parsed);
        assert.equal(ops.length, 0);
    });

    it("handles paths with no operations", () => {
        const parsed = parseOpenApiDocument({
            openapi: "3.1.0",
            paths: { "/health": {} },
        });
        const ops = listOperations(parsed);
        assert.equal(ops.length, 0);
    });
});

// ---------------------------------------------------------------------------
// getParameters
// ---------------------------------------------------------------------------

describe("getParameters", () => {
    it("extracts query parameters", () => {
        const parsed = parseOpenApiDocument(petStore);
        const params = getParameters(parsed, "/pets", "get");
        assert.equal(params.length, 2);

        const limit = params.find((p) => p.name === "limit");
        assert.ok(limit);
        assert.equal(limit.location, "query");
        assert.equal(limit.required, false);
        assert.ok(limit.schema);
        assert.equal(limit.schema.type, "integer");
    });

    it("extracts path parameters", () => {
        const parsed = parseOpenApiDocument(petStore);
        const params = getParameters(parsed, "/pets/{petId}", "get");
        assert.equal(params.length, 1);

        const petId = params[0];
        assert.ok(petId);
        assert.equal(petId.name, "petId");
        assert.equal(petId.location, "path");
        assert.equal(petId.required, true);
    });

    it("merges path-level and operation-level parameters", () => {
        const doc = {
            openapi: "3.1.0",
            paths: {
                "/items/{itemId}": {
                    parameters: [
                        {
                            name: "itemId",
                            in: "path",
                            required: true,
                            schema: { type: "string" },
                        },
                    ],
                    get: {
                        parameters: [
                            {
                                name: "fields",
                                in: "query",
                                schema: { type: "string" },
                            },
                        ],
                        responses: { "200": { description: "OK" } },
                    },
                },
            },
        };
        const parsed = parseOpenApiDocument(doc);
        const params = getParameters(parsed, "/items/{itemId}", "get");
        assert.equal(params.length, 2);
        const names = params.map((p) => p.name);
        assert.ok(names.includes("itemId"));
        assert.ok(names.includes("fields"));
    });

    it("operation-level overrides path-level for same name+in", () => {
        const doc = {
            openapi: "3.1.0",
            paths: {
                "/items": {
                    parameters: [
                        {
                            name: "sort",
                            in: "query",
                            schema: { type: "string" },
                            description: "Path-level sort",
                        },
                    ],
                    get: {
                        parameters: [
                            {
                                name: "sort",
                                in: "query",
                                schema: { type: "string" },
                                description: "Operation-level sort",
                            },
                        ],
                        responses: { "200": { description: "OK" } },
                    },
                },
            },
        };
        const parsed = parseOpenApiDocument(doc);
        const params = getParameters(parsed, "/items", "get");
        assert.equal(params.length, 1);

        const sort = params[0];
        assert.ok(sort);
        assert.equal(sort.description, "Operation-level sort");
    });

    it("returns empty for unknown operation", () => {
        const parsed = parseOpenApiDocument(petStore);
        const params = getParameters(parsed, "/pets", "delete");
        assert.equal(params.length, 0);
    });
});

// ---------------------------------------------------------------------------
// getRequestBody
// ---------------------------------------------------------------------------

describe("getRequestBody", () => {
    it("extracts request body schema", () => {
        const parsed = parseOpenApiDocument(petStore);
        const body = getRequestBody(parsed, "/pets", "post");
        assert.ok(body);
        assert.equal(body.required, true);
        assert.equal(body.description, "Pet to create");
        assert.ok(body.schema);
        assert.equal(body.schema.type, "object");
    });

    it("lists content types", () => {
        const parsed = parseOpenApiDocument(petStore);
        const body = getRequestBody(parsed, "/pets", "post");
        assert.ok(body);
        assert.deepEqual(body.contentTypes, ["application/json"]);
    });

    it("returns undefined for operation without request body", () => {
        const parsed = parseOpenApiDocument(petStore);
        const body = getRequestBody(parsed, "/pets", "get");
        assert.equal(body, undefined);
    });

    it("handles request body without content", () => {
        const doc = {
            openapi: "3.1.0",
            paths: {
                "/test": {
                    post: {
                        requestBody: { required: false },
                        responses: { "200": { description: "OK" } },
                    },
                },
            },
        };
        const parsed = parseOpenApiDocument(doc);
        const body = getRequestBody(parsed, "/test", "post");
        assert.ok(body);
        assert.equal(body.required, false);
        assert.equal(body.contentTypes.length, 0);
        assert.equal(body.schema, undefined);
    });
});

// ---------------------------------------------------------------------------
// getResponses
// ---------------------------------------------------------------------------

describe("getResponses", () => {
    it("extracts response schemas", () => {
        const parsed = parseOpenApiDocument(petStore);
        const responses = getResponses(parsed, "/pets", "get");
        assert.equal(responses.length, 1);

        const ok = responses[0];
        assert.ok(ok);
        assert.equal(ok.statusCode, "200");
        assert.equal(ok.description, "A list of pets");
        assert.ok(ok.schema);
        assert.equal(ok.schema.type, "array");
    });

    it("lists content types for each response", () => {
        const parsed = parseOpenApiDocument(petStore);
        const responses = getResponses(parsed, "/pets", "get");

        const ok = responses[0];
        assert.ok(ok);
        assert.deepEqual(ok.contentTypes, ["application/json"]);
    });

    it("handles responses without content (no schema)", () => {
        const parsed = parseOpenApiDocument(petStore);
        const responses = getResponses(parsed, "/pets/{petId}", "get");

        const notFound = responses.find((r) => r.statusCode === "404");
        assert.ok(notFound);
        assert.equal(notFound.description, "Not found");
        assert.equal(notFound.schema, undefined);
        assert.equal(notFound.contentTypes.length, 0);
    });

    it("returns empty for operation without responses", () => {
        const doc = {
            openapi: "3.1.0",
            paths: {
                "/test": {
                    get: {
                        responses: {},
                    },
                },
            },
        };
        const parsed = parseOpenApiDocument(doc);
        const responses = getResponses(parsed, "/test", "get");
        assert.equal(responses.length, 0);
    });
});

// ---------------------------------------------------------------------------
// $ref resolution
// ---------------------------------------------------------------------------

describe("$ref resolution", () => {
    it("preserves $ref in response schema for walker resolution", () => {
        const doc = {
            openapi: "3.1.0",
            paths: {
                "/users": {
                    get: {
                        responses: {
                            "200": {
                                content: {
                                    "application/json": {
                                        schema: {
                                            $ref: "#/components/schemas/User",
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
                        type: "object",
                        properties: {
                            name: { type: "string" },
                        },
                    },
                },
            },
        };
        const parsed = parseOpenApiDocument(doc);
        const responses = getResponses(parsed, "/users", "get");

        const ok = responses[0];
        assert.ok(ok);
        // The $ref is preserved — the walker resolves via rootDocument
        assert.ok(ok.schema);
        assert.equal(ok.schema.$ref, "#/components/schemas/User");
    });
});
