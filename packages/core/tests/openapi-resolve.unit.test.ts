/**
 * Unit tests for OpenAPI resolution layer (pure functions, no React).
 */
import { describe, it, expect } from "vitest";
import { assertDefined } from "./helpers.ts";
import {
    getParsed,
    toDoc,
    resolveOperation,
    resolveParameters,
    resolveRequestBody,
    resolveResponse,
    resolveResponses,
} from "../src/openapi/resolve.ts";

const petStore = {
    openapi: "3.1.0",
    info: { title: "Pet Store", version: "1.0" },
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
                        schema: { type: "integer" },
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
                    "404": {
                        description: "Not found",
                    },
                },
            },
            post: {
                operationId: "createPet",
                requestBody: {
                    required: true,
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
    },
    components: {
        schemas: {
            Pet: {
                type: "object",
                properties: {
                    id: { type: "string", readOnly: true },
                    name: { type: "string" },
                },
                required: ["id", "name"],
            },
        },
    },
} as const;

// ---------------------------------------------------------------------------
// toDoc
// ---------------------------------------------------------------------------

describe("toDoc", () => {
    it("returns the object for plain objects", () => {
        const obj = { type: "string" };
        expect(toDoc(obj)).toBe(obj);
    });

    it("returns empty record for strings", () => {
        expect(toDoc("hello")).toStrictEqual({});
    });

    it("returns empty record for null", () => {
        expect(toDoc(null)).toStrictEqual({});
    });

    it("returns empty record for undefined", () => {
        expect(toDoc(undefined)).toStrictEqual({});
    });

    it("returns empty record for numbers", () => {
        expect(toDoc(42)).toStrictEqual({});
    });

    it("returns empty record for arrays", () => {
        expect(toDoc([1, 2, 3])).toStrictEqual({});
    });
});

// ---------------------------------------------------------------------------
// getParsed
// ---------------------------------------------------------------------------

describe("getParsed", () => {
    it("parses a valid OpenAPI document", () => {
        const parsed = getParsed(petStore);
        expect(parsed.doc.openapi).toBe("3.1.0");
    });

    it("caches by object identity", () => {
        const first = getParsed(petStore);
        const second = getParsed(petStore);
        expect(first).toBe(second);
    });
});

// ---------------------------------------------------------------------------
// resolveOperation
// ---------------------------------------------------------------------------

describe("resolveOperation", () => {
    it("resolves a GET operation", () => {
        const resolved = resolveOperation(petStore, "/pets", "get");
        expect(resolved.operation.operationId).toBe("listPets");
        expect(resolved.operation.method).toBe("get");
        expect(resolved.operation.path).toBe("/pets");
    });

    it("resolves a POST operation", () => {
        const resolved = resolveOperation(petStore, "/pets", "post");
        expect(resolved.operation.operationId).toBe("createPet");
    });

    it("includes parameters", () => {
        const resolved = resolveOperation(petStore, "/pets", "get");
        expect(resolved.parameters.length).toBe(2);
        expect(assertDefined(resolved.parameters[0], "param 0").name).toBe(
            "limit"
        );
        expect(assertDefined(resolved.parameters[1], "param 1").name).toBe(
            "status"
        );
    });

    it("includes request body", () => {
        const resolved = resolveOperation(petStore, "/pets", "post");
        expect(resolved.requestBody).not.toBe(undefined);
        expect(resolved.requestBody?.required).toBe(true);
    });

    it("includes responses", () => {
        const resolved = resolveOperation(petStore, "/pets", "get");
        expect(resolved.responses.length).toBe(2);
    });

    it("throws for unknown path", () => {
        expect(() => resolveOperation(petStore, "/unknown", "get")).toThrow(
            "Operation not found"
        );
    });

    it("throws for unknown method", () => {
        expect(() => resolveOperation(petStore, "/pets", "delete")).toThrow(
            "Operation not found"
        );
    });
});

// ---------------------------------------------------------------------------
// resolveParameters
// ---------------------------------------------------------------------------

describe("resolveParameters", () => {
    it("resolves parameters for an operation", () => {
        const params = resolveParameters(petStore, "/pets", "get");
        expect(params.length).toBe(2);
        const names = params.map((p) => p.name);
        expect(names).toContain("limit");
        expect(names).toContain("status");
    });

    it("returns empty array for operation with no parameters", () => {
        const params = resolveParameters(petStore, "/pets", "post");
        expect(params).toStrictEqual([]);
    });

    it("resolves a $ref parameter against the document root", () => {
        const doc = {
            openapi: "3.1.0",
            info: { title: "Refs", version: "1.0" },
            paths: {
                "/items": {
                    get: {
                        operationId: "listItems",
                        parameters: [
                            { $ref: "#/components/parameters/PageSize" },
                        ],
                        responses: { "200": { description: "OK" } },
                    },
                },
            },
            components: {
                parameters: {
                    PageSize: {
                        name: "pageSize",
                        in: "query",
                        required: true,
                        description: "Number of items per page",
                        schema: { type: "integer", minimum: 1, maximum: 100 },
                    },
                },
            },
        };

        const params = resolveParameters(doc, "/items", "get");
        expect(params.length).toBe(1);
        const param = assertDefined(params[0], "ref param");
        expect(param.name).toBe("pageSize");
        expect(param.location).toBe("query");
        expect(param.required).toBe(true);
        expect(param.description).toBe("Number of items per page");
        expect(param.schema).toStrictEqual({
            type: "integer",
            minimum: 1,
            maximum: 100,
        });
    });

    it("resolves $ref parameters declared at the path-item level", () => {
        const doc = {
            openapi: "3.1.0",
            info: { title: "Refs", version: "1.0" },
            paths: {
                "/items": {
                    parameters: [{ $ref: "#/components/parameters/PageSize" }],
                    get: {
                        operationId: "listItems",
                        responses: { "200": { description: "OK" } },
                    },
                },
            },
            components: {
                parameters: {
                    PageSize: {
                        name: "pageSize",
                        in: "query",
                        required: false,
                        schema: { type: "integer" },
                    },
                },
            },
        };

        const params = resolveParameters(doc, "/items", "get");
        expect(params.length).toBe(1);
        const param = assertDefined(params[0], "path-item ref param");
        expect(param.name).toBe("pageSize");
        expect(param.location).toBe("query");
    });
});

// ---------------------------------------------------------------------------
// resolveRequestBody
// ---------------------------------------------------------------------------

describe("resolveRequestBody", () => {
    it("resolves request body for POST", () => {
        const body = resolveRequestBody(petStore, "/pets", "post");
        expect(body).not.toBe(undefined);
        expect(body?.required).toBe(true);
        expect(body?.contentTypes).toStrictEqual(["application/json"]);
    });

    it("returns undefined for GET", () => {
        const body = resolveRequestBody(petStore, "/pets", "get");
        expect(body).toBe(undefined);
    });
});

// ---------------------------------------------------------------------------
// resolveResponse
// ---------------------------------------------------------------------------

describe("resolveResponse", () => {
    it("resolves a specific response by status code", () => {
        const response = resolveResponse(petStore, "/pets", "get", "200");
        expect(response.statusCode).toBe("200");
        expect(response.description).toBe("A list of pets");
    });

    it("resolves a response without schema", () => {
        const response = resolveResponse(petStore, "/pets", "get", "404");
        expect(response.statusCode).toBe("404");
        expect(response.schema).toBe(undefined);
    });

    it("throws for unknown status code", () => {
        expect(() => resolveResponse(petStore, "/pets", "get", "500")).toThrow(
            "Response not found"
        );
    });
});

// ---------------------------------------------------------------------------
// resolveResponses
// ---------------------------------------------------------------------------

describe("resolveResponses", () => {
    it("resolves all responses for an operation", () => {
        const responses = resolveResponses(petStore, "/pets", "get");
        expect(responses.length).toBe(2);
        const codes = responses.map((r) => r.statusCode);
        expect(codes).toContain("200");
        expect(codes).toContain("404");
    });

    it("returns empty array for operation with no responses", () => {
        const minimal = {
            openapi: "3.1.0",
            paths: {
                "/test": {
                    get: {
                        responses: {},
                    },
                },
            },
        };
        const responses = resolveResponses(minimal, "/test", "get");
        expect(responses).toStrictEqual([]);
    });
});
