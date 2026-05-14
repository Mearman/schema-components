/**
 * Unit tests for OpenAPI React components.
 */
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import {
    ApiOperation,
    ApiParameters,
    ApiRequestBody,
    ApiResponse,
} from "../src/openapi/components.tsx";

const doc = {
    openapi: "3.1.0",
    info: { title: "Test API", version: "1.0" },
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
                ],
                responses: {
                    "200": { description: "A list of pets" },
                    "404": { description: "Not found" },
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
                    "201": { description: "Created" },
                },
            },
        },
    },
};

// ---------------------------------------------------------------------------
// ApiOperation
// ---------------------------------------------------------------------------

describe("ApiOperation", () => {
    it("renders GET operation with parameters", () => {
        const html = renderToString(
            createElement(ApiOperation, {
                schema: doc,
                path: "/pets",
                method: "get",
            })
        );
        expect(html).toContain("GET");
        expect(html).toContain("limit");
        expect(html).toContain("List all pets");
    });

    it("renders POST operation with request body", () => {
        const html = renderToString(
            createElement(ApiOperation, {
                schema: doc,
                path: "/pets",
                method: "post",
            })
        );
        expect(html).toContain("POST");
        expect(html).toContain("Request Body");
    });

    it("renders responses", () => {
        const html = renderToString(
            createElement(ApiOperation, {
                schema: doc,
                path: "/pets",
                method: "get",
            })
        );
        expect(html).toContain("200");
        expect(html).toContain("404");
    });

    it("throws for unknown path", () => {
        expect(() =>
            renderToString(
                createElement(ApiOperation, {
                    schema: doc,
                    path: "/unknown",
                    method: "get",
                })
            )
        ).toThrow("Operation not found");
    });

    it("throws for unknown method", () => {
        expect(() =>
            renderToString(
                createElement(ApiOperation, {
                    schema: doc,
                    path: "/pets",
                    method: "delete",
                })
            )
        ).toThrow("Operation not found");
    });
});

// ---------------------------------------------------------------------------
// ApiParameters
// ---------------------------------------------------------------------------

describe("ApiParameters", () => {
    it("renders query parameters", () => {
        const html = renderToString(
            createElement(ApiParameters, {
                schema: doc,
                path: "/pets",
                method: "get",
            })
        );
        expect(html).toContain("limit");
    });

    it("returns null for operation without parameters", () => {
        const html = renderToString(
            createElement(ApiParameters, {
                schema: doc,
                path: "/pets",
                method: "post",
            })
        );
        expect(html).toBe("");
    });
});

// ---------------------------------------------------------------------------
// ApiRequestBody
// ---------------------------------------------------------------------------

describe("ApiRequestBody", () => {
    it("renders request body fields", () => {
        const html = renderToString(
            createElement(ApiRequestBody, {
                schema: doc,
                path: "/pets",
                method: "post",
                value: { name: "Fido", tag: "dog" },
            })
        );
        expect(html).toContain("Fido");
        expect(html).toContain("dog");
    });

    it("returns null when no request body", () => {
        const html = renderToString(
            createElement(ApiRequestBody, {
                schema: doc,
                path: "/pets",
                method: "get",
            })
        );
        expect(html).toBe("");
    });
});

// ---------------------------------------------------------------------------
// ApiResponse
// ---------------------------------------------------------------------------

describe("ApiResponse", () => {
    it("renders response with description", () => {
        const html = renderToString(
            createElement(ApiResponse, {
                schema: doc,
                path: "/pets",
                method: "get",
                status: "200",
            })
        );
        expect(html).toContain("200");
        expect(html).toContain("A list of pets");
    });

    it("renders response without schema", () => {
        const html = renderToString(
            createElement(ApiResponse, {
                schema: doc,
                path: "/pets",
                method: "get",
                status: "404",
            })
        );
        expect(html).toContain("404");
        expect(html).toContain("No schema");
    });

    it("throws for unknown status code", () => {
        expect(() =>
            renderToString(
                createElement(ApiResponse, {
                    schema: doc,
                    path: "/pets",
                    method: "get",
                    status: "500",
                })
            )
        ).toThrow("Response not found");
    });
});
