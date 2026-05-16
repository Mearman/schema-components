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
import { ApiSecurity } from "../src/openapi/ApiSecurity.tsx";
import { ApiCallbacks } from "../src/openapi/ApiCallbacks.tsx";
import { ApiLinks } from "../src/openapi/ApiLinks.tsx";
import { ApiResponseHeaders } from "../src/openapi/ApiResponseHeaders.tsx";

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

    it("applies field overrides to parameter meta", () => {
        const html = renderToString(
            createElement(ApiParameters, {
                schema: doc,
                path: "/pets",
                method: "get",
                overrides: {
                    limit: { description: "Max results", placeholder: "10" },
                },
            })
        );
        expect(html).toContain("limit");
        // Override passes through — headless renderer renders the input
        expect(html).toContain("input");
    });

    it("merges parameter description, overrides, and meta", () => {
        const html = renderToString(
            createElement(ApiParameters, {
                schema: doc,
                path: "/pets",
                method: "get",
                overrides: {
                    limit: { placeholder: "10" },
                },
                meta: { section: "query-params" },
            })
        );
        expect(html).toContain("limit");
        // Both override and meta branches exercised
        expect(html).toContain("input");
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

// ---------------------------------------------------------------------------
// ApiSecurity
// ---------------------------------------------------------------------------

describe("ApiSecurity", () => {
    it("renders security requirements and schemes", () => {
        const html = renderToString(
            createElement(ApiSecurity, {
                requirements: [{ name: "bearerAuth", scopes: [] }],
                schemes: new Map([
                    [
                        "bearerAuth",
                        {
                            type: "http",
                            scheme: "bearer",
                            description: "JWT auth",
                            name: undefined,
                            location: undefined,
                            bearerFormat: undefined,
                            flows: undefined,
                            openIdConnectUrl: undefined,
                        },
                    ],
                ]),
            })
        );
        expect(html).toContain("Security");
        expect(html).toContain("bearerAuth");
        expect(html).toContain("http");
        expect(html).toContain("JWT auth");
    });

    it("returns null for empty requirements", () => {
        const html = renderToString(
            createElement(ApiSecurity, {
                requirements: [],
                schemes: new Map(),
            })
        );
        expect(html).toBe("");
    });
});

// ---------------------------------------------------------------------------
// ApiCallbacks
// ---------------------------------------------------------------------------

describe("ApiCallbacks", () => {
    it("renders callback definitions", () => {
        const html = renderToString(
            createElement(ApiCallbacks, {
                callbacks: [
                    {
                        name: "onEvent",
                        operations: [
                            {
                                path: "/callback",
                                method: "post",
                                operationId: undefined,
                                summary: "Event callback",
                                description: undefined,
                                deprecated: false,
                                operation: {},
                            },
                        ],
                    },
                ],
            })
        );
        expect(html).toContain("Callbacks");
        expect(html).toContain("onEvent");
        expect(html).toContain("POST");
        expect(html).toContain("Event callback");
    });

    it("returns null for empty callbacks", () => {
        const html = renderToString(
            createElement(ApiCallbacks, {
                callbacks: [],
            })
        );
        expect(html).toBe("");
    });
});

// ---------------------------------------------------------------------------
// ApiLinks
// ---------------------------------------------------------------------------

describe("ApiLinks", () => {
    it("renders link definitions", () => {
        const html = renderToString(
            createElement(ApiLinks, {
                links: [
                    {
                        name: "GetUserById",
                        operationId: "getUser",
                        operationRef: undefined,
                        description: "Link to user details",
                        parameters: new Map([["userId", "$response.body#/id"]]),
                        requestBody: undefined,
                    },
                ],
            })
        );
        expect(html).toContain("Links");
        expect(html).toContain("GetUserById");
        expect(html).toContain("getUser");
        expect(html).toContain("Link to user details");
        expect(html).toContain("userId");
    });

    it("returns null for empty links", () => {
        const html = renderToString(
            createElement(ApiLinks, {
                links: [],
            })
        );
        expect(html).toBe("");
    });
});

// ---------------------------------------------------------------------------
// ApiResponseHeaders
// ---------------------------------------------------------------------------

describe("ApiResponseHeaders", () => {
    it("renders response headers", () => {
        const headers = new Map([
            [
                "X-Rate-Limit",
                {
                    name: "X-Rate-Limit",
                    description: "Rate limit per hour",
                    required: true,
                    deprecated: false,
                    schema: { type: "integer" },
                },
            ],
        ]);
        const html = renderToString(
            createElement(ApiResponseHeaders, {
                headers,
            })
        );
        expect(html).toContain("Headers");
        expect(html).toContain("X-Rate-Limit");
        expect(html).toContain("Rate limit per hour");
    });

    it("returns null for empty headers", () => {
        const html = renderToString(
            createElement(ApiResponseHeaders, {
                headers: new Map(),
            })
        );
        expect(html).toBe("");
    });
});
