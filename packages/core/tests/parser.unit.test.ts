/**
 * Unit tests for the OpenAPI document parser.
 *
 * Tests document parsing, operation extraction, parameter merging,
 * request body extraction, response extraction, and $ref resolution.
 */

import { describe, it, expect } from "vitest";
import { assertDefined } from "./helpers.ts";
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
        expect(parsed.schemas.has("#/components/schemas/Pet")).toBeTruthy();
        const pet = parsed.schemas.get("#/components/schemas/Pet");
        expect(pet?.type).toBe("object");
    });

    it("preserves the original document", () => {
        const parsed = parseOpenApiDocument(petStore);
        expect(parsed.doc).toBe(petStore);
    });

    it("handles empty components", () => {
        const parsed = parseOpenApiDocument({ openapi: "3.1.0" });
        expect(parsed.schemas.size).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// getSchema
// ---------------------------------------------------------------------------

describe("getSchema", () => {
    it("resolves a cached component schema", () => {
        const parsed = parseOpenApiDocument(petStore);
        const schema = getSchema(parsed, "#/components/schemas/Pet");
        expect(schema?.type).toBe("object");
    });

    it("returns undefined for unknown ref", () => {
        const parsed = parseOpenApiDocument(petStore);
        const schema = getSchema(parsed, "#/components/schemas/Unknown");
        expect(schema).toBe(undefined);
    });

    it("caches on first resolve", () => {
        const parsed = parseOpenApiDocument(petStore);
        const schema = getSchema(parsed, "#/paths/~1pets/get");
        expect(schema).toBeTruthy();
        const cached = getSchema(parsed, "#/paths/~1pets/get");
        expect(schema).toBe(cached);
    });
});

// ---------------------------------------------------------------------------
// listOperations
// ---------------------------------------------------------------------------

describe("listOperations", () => {
    it("lists all operations", () => {
        const parsed = parseOpenApiDocument(petStore);
        const ops = listOperations(parsed);
        expect(ops.length).toBe(3);
    });

    it("extracts operation metadata", () => {
        const parsed = parseOpenApiDocument(petStore);
        const ops = listOperations(parsed);
        const listPets = assertDefined(
            ops.find((op) => op.path === "/pets" && op.method === "get"),
            "listPets"
        );
        expect(listPets.operationId).toBe("listPets");
        expect(listPets.summary).toBe("List all pets");
        expect(listPets.deprecated).toBe(false);
    });

    it("handles documents with no paths", () => {
        const parsed = parseOpenApiDocument({ openapi: "3.1.0" });
        const ops = listOperations(parsed);
        expect(ops.length).toBe(0);
    });

    it("handles paths with no operations", () => {
        const parsed = parseOpenApiDocument({
            openapi: "3.1.0",
            paths: { "/health": {} },
        });
        const ops = listOperations(parsed);
        expect(ops.length).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// getParameters
// ---------------------------------------------------------------------------

describe("getParameters", () => {
    it("extracts query parameters", () => {
        const parsed = parseOpenApiDocument(petStore);
        const params = getParameters(parsed, "/pets", "get");
        expect(params.length).toBe(2);

        const limit = assertDefined(
            params.find((p) => p.name === "limit"),
            "limit"
        );
        expect(limit.location).toBe("query");
        expect(limit.required).toBe(false);
        expect(assertDefined(limit, "limit").schema).toBeTruthy();
        expect(
            assertDefined(assertDefined(limit, "limit").schema, "limit schema")
                .type
        ).toBe("integer");
    });

    it("extracts path parameters", () => {
        const parsed = parseOpenApiDocument(petStore);
        const params = getParameters(parsed, "/pets/{petId}", "get");
        expect(params.length).toBe(1);

        const petId = assertDefined(params[0], "petId");
        expect(petId).toBeTruthy();
        expect(petId.name).toBe("petId");
        expect(petId.location).toBe("path");
        expect(petId.required).toBe(true);
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
        expect(params.length).toBe(2);
        const names = params.map((p) => p.name);
        expect(names.includes("itemId")).toBeTruthy();
        expect(names.includes("fields")).toBeTruthy();
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
        expect(params.length).toBe(1);

        const sort = assertDefined(params[0], "sort");
        expect(sort).toBeTruthy();
        expect(sort.description).toBe("Operation-level sort");
    });

    it("returns empty for unknown operation", () => {
        const parsed = parseOpenApiDocument(petStore);
        const params = getParameters(parsed, "/pets", "delete");
        expect(params.length).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// getRequestBody
// ---------------------------------------------------------------------------

describe("getRequestBody", () => {
    it("extracts request body schema", () => {
        const parsed = parseOpenApiDocument(petStore);
        const body = assertDefined(
            getRequestBody(parsed, "/pets", "post"),
            "body"
        );
        expect(body).toBeTruthy();
        expect(body.required).toBe(true);
        expect(body.description).toBe("Pet to create");
        expect(assertDefined(body, "body").schema).toBeTruthy();
        expect(
            assertDefined(assertDefined(body, "body").schema, "body schema")
                .type
        ).toBe("object");
    });

    it("lists content types", () => {
        const parsed = parseOpenApiDocument(petStore);
        const body = assertDefined(
            getRequestBody(parsed, "/pets", "post"),
            "body"
        );
        expect(body).toBeTruthy();
        expect(body.contentTypes).toStrictEqual(["application/json"]);
    });

    it("returns undefined for operation without request body", () => {
        const parsed = parseOpenApiDocument(petStore);
        const body = getRequestBody(parsed, "/pets", "get");
        expect(body).toBe(undefined);
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
        const body = assertDefined(
            getRequestBody(parsed, "/test", "post"),
            "body"
        );
        expect(body).toBeTruthy();
        expect(body.required).toBe(false);
        expect(body.contentTypes.length).toBe(0);
        expect(body.schema).toBe(undefined);
    });
});

// ---------------------------------------------------------------------------
// getResponses
// ---------------------------------------------------------------------------

describe("getResponses", () => {
    it("extracts response schemas", () => {
        const parsed = parseOpenApiDocument(petStore);
        const responses = getResponses(parsed, "/pets", "get");
        expect(responses.length).toBe(1);

        const ok = assertDefined(responses[0], "ok");
        expect(ok).toBeTruthy();
        expect(ok.statusCode).toBe("200");
        expect(ok.description).toBe("A list of pets");
        expect(assertDefined(ok, "ok").schema).toBeTruthy();
        expect(
            assertDefined(assertDefined(ok, "ok").schema, "ok schema").type
        ).toBe("array");
    });

    it("lists content types for each response", () => {
        const parsed = parseOpenApiDocument(petStore);
        const responses = getResponses(parsed, "/pets", "get");

        const ok = assertDefined(responses[0], "ok");
        expect(ok).toBeTruthy();
        expect(ok.contentTypes).toStrictEqual(["application/json"]);
    });

    it("handles responses without content (no schema)", () => {
        const parsed = parseOpenApiDocument(petStore);
        const responses = getResponses(parsed, "/pets/{petId}", "get");

        const notFound = assertDefined(
            responses.find((r) => r.statusCode === "404"),
            "notFound"
        );
        expect(notFound.description).toBe("Not found");
        expect(notFound.schema).toBe(undefined);
        expect(notFound.contentTypes.length).toBe(0);
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
        expect(responses.length).toBe(0);
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

        const ok = assertDefined(responses[0], "ok");
        expect(ok).toBeTruthy();
        // The $ref is preserved — the walker resolves via rootDocument
        expect(assertDefined(ok, "ok").schema).toBeTruthy();
        expect(
            assertDefined(assertDefined(ok, "ok").schema, "ok schema").$ref
        ).toBe("#/components/schemas/User");
    });
});
