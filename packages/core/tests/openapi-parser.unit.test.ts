/**
 * Tests for OpenAPI parser — security, headers, webhooks, and edge cases.
 */

import { describe, it, expect } from "vitest";
import {
    parseOpenApiDocument,
    getSecurityRequirements,
    getSecuritySchemes,
    getResponseHeaders,
    listWebhooks,
    getResponses,
    getRequestBody,
    getParameters,
    listOperations,
} from "../src/openapi/parser.ts";

// ---------------------------------------------------------------------------
// Security requirements
// ---------------------------------------------------------------------------

describe("security requirements", () => {
    const doc = {
        openapi: "3.1.0",
        info: { title: "Test", version: "1.0" },
        security: [{ apiKey: [] }],
        paths: {
            "/public": {
                get: {
                    responses: { "200": { description: "OK" } },
                    security: [],
                },
            },
            "/private": {
                get: {
                    responses: { "200": { description: "OK" } },
                },
            },
            "/admin": {
                post: {
                    security: [{ oauth: ["admin"] }, { apiKey: [] }],
                    responses: { "200": { description: "OK" } },
                },
            },
        },
        components: {
            securitySchemes: {
                apiKey: {
                    type: "apiKey",
                    name: "X-API-Key",
                    in: "header",
                },
                oauth: {
                    type: "oauth2",
                    flows: {
                        implicit: {
                            authorizationUrl: "https://example.com/auth",
                            scopes: { admin: "Admin access" },
                        },
                    },
                },
            },
        },
    } as Record<string, unknown>;

    const parsed = parseOpenApiDocument(doc);

    it("returns global security for operations without explicit security", () => {
        const reqs = getSecurityRequirements(parsed, "/private", "get");
        expect(reqs).toEqual([{ name: "apiKey", scopes: [] }]);
    });

    it("returns empty array for operations with empty security override", () => {
        const reqs = getSecurityRequirements(parsed, "/public", "get");
        expect(reqs).toEqual([]);
    });

    it("returns operation-level security with multiple requirements", () => {
        const reqs = getSecurityRequirements(parsed, "/admin", "post");
        expect(reqs).toEqual([
            { name: "oauth", scopes: ["admin"] },
            { name: "apiKey", scopes: [] },
        ]);
    });
});

// ---------------------------------------------------------------------------
// Security schemes
// ---------------------------------------------------------------------------

describe("security schemes", () => {
    const doc = {
        openapi: "3.1.0",
        info: { title: "Test", version: "1.0" },
        paths: {},
        components: {
            securitySchemes: {
                bearer: {
                    type: "http",
                    scheme: "bearer",
                    bearerFormat: "JWT",
                    description: "JWT auth",
                },
                oauth: {
                    type: "oauth2",
                    flows: {
                        clientCredentials: {
                            tokenUrl: "https://example.com/token",
                            scopes: { read: "Read access" },
                        },
                    },
                },
                oidc: {
                    type: "openIdConnect",
                    openIdConnectUrl: "https://example.com/.well-known/openid",
                },
            },
        },
    } as Record<string, unknown>;

    const parsed = parseOpenApiDocument(doc);

    it("extracts all security schemes", () => {
        const schemes = getSecuritySchemes(parsed);
        expect(schemes.size).toBe(3);
    });

    it("extracts http bearer scheme details", () => {
        const schemes = getSecuritySchemes(parsed);
        const bearer = schemes.get("bearer");
        expect(bearer).toEqual({
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
            description: "JWT auth",
            name: undefined,
            location: undefined,
            flows: undefined,
            openIdConnectUrl: undefined,
        });
    });

    it("extracts oauth2 scheme with flows", () => {
        const schemes = getSecuritySchemes(parsed);
        const oauth = schemes.get("oauth");
        expect(oauth?.type).toBe("oauth2");
        expect(oauth?.flows).toBeDefined();
    });

    it("extracts openIdConnect scheme", () => {
        const schemes = getSecuritySchemes(parsed);
        const oidc = schemes.get("oidc");
        expect(oidc?.type).toBe("openIdConnect");
        expect(oidc?.openIdConnectUrl).toBe(
            "https://example.com/.well-known/openid"
        );
    });

    it("returns empty map for document without securitySchemes", () => {
        const noSchemesDoc = {
            openapi: "3.1.0",
            info: { title: "Test", version: "1.0" },
            paths: {},
        } as Record<string, unknown>;
        const parsed = parseOpenApiDocument(noSchemesDoc);
        const schemes = getSecuritySchemes(parsed);
        expect(schemes.size).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// Response headers
// ---------------------------------------------------------------------------

describe("response headers", () => {
    it("extracts headers from a response", () => {
        const response = {
            description: "Success",
            headers: {
                "X-Rate-Limit": {
                    description: "Rate limit",
                    schema: { type: "integer" },
                },
                "X-Request-Id": {
                    description: "Request ID",
                    required: true,
                    schema: { type: "string", format: "uuid" },
                },
            },
        } as Record<string, unknown>;

        const headers = getResponseHeaders(response);
        expect(headers.size).toBe(2);

        const rateLimit = headers.get("X-Rate-Limit");
        expect(rateLimit?.description).toBe("Rate limit");
        expect(rateLimit?.required).toBe(false);

        const requestId = headers.get("X-Request-Id");
        expect(requestId?.required).toBe(true);
    });

    it("returns empty map when no headers", () => {
        const response = {
            description: "Success",
        } as Record<string, unknown>;
        const headers = getResponseHeaders(response);
        expect(headers.size).toBe(0);
    });

    it("includes response headers in getResponses", () => {
        const doc = {
            openapi: "3.1.0",
            info: { title: "Test", version: "1.0" },
            paths: {
                "/data": {
                    get: {
                        responses: {
                            "200": {
                                description: "OK",
                                headers: {
                                    "X-Total": {
                                        schema: { type: "integer" },
                                    },
                                },
                                content: {
                                    "application/json": {
                                        schema: { type: "array" },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        } as Record<string, unknown>;

        const parsed = parseOpenApiDocument(doc);
        const responses = getResponses(parsed, "/data", "get");
        expect(responses.length).toBe(1);
        expect(responses[0]?.headers.size).toBe(1);
        expect(responses[0]?.headers.has("X-Total")).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Webhooks (OpenAPI 3.1)
// ---------------------------------------------------------------------------

describe("webhooks", () => {
    it("extracts webhooks with operations", () => {
        const doc = {
            openapi: "3.1.0",
            info: { title: "Test", version: "1.0" },
            paths: {},
            webhooks: {
                newPet: {
                    post: {
                        requestBody: {
                            content: {
                                "application/json": {
                                    schema: {
                                        type: "object",
                                        properties: {
                                            name: { type: "string" },
                                        },
                                    },
                                },
                            },
                        },
                        responses: {
                            "201": { description: "Created" },
                        },
                    },
                },
                petUpdated: {
                    put: {
                        operationId: "updatePet",
                        responses: {
                            "200": { description: "Updated" },
                        },
                    },
                },
            },
        } as Record<string, unknown>;

        const parsed = parseOpenApiDocument(doc);
        const webhooks = listWebhooks(parsed);
        expect(webhooks.length).toBe(2);

        const newPet = webhooks.find((w) => w.name === "newPet");
        expect(newPet).toBeDefined();
        expect(newPet?.operations.length).toBe(1);
        expect(newPet?.operations[0]?.method).toBe("post");

        const petUpdated = webhooks.find((w) => w.name === "petUpdated");
        expect(petUpdated?.operations[0]?.operationId).toBe("updatePet");
    });

    it("returns empty array for document without webhooks", () => {
        const doc = {
            openapi: "3.1.0",
            info: { title: "Test", version: "1.0" },
            paths: {},
        } as Record<string, unknown>;
        const parsed = parseOpenApiDocument(doc);
        const webhooks = listWebhooks(parsed);
        expect(webhooks).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("parser edge cases", () => {
    it("handles document without paths", () => {
        const doc = {
            openapi: "3.1.0",
            info: { title: "Test", version: "1.0" },
        } as Record<string, unknown>;
        const parsed = parseOpenApiDocument(doc);
        expect(listOperations(parsed)).toEqual([]);
        expect(getParameters(parsed, "/test", "get")).toEqual([]);
        expect(getResponses(parsed, "/test", "get")).toEqual([]);
        expect(getRequestBody(parsed, "/test", "get")).toBeUndefined();
    });

    it("handles operation without responses", () => {
        const doc = {
            openapi: "3.1.0",
            info: { title: "Test", version: "1.0" },
            paths: {
                "/test": { get: { summary: "No responses" } },
            },
        } as Record<string, unknown>;
        const parsed = parseOpenApiDocument(doc);
        const responses = getResponses(parsed, "/test", "get");
        expect(responses).toEqual([]);
    });

    it("handles response without content", () => {
        const doc = {
            openapi: "3.1.0",
            info: { title: "Test", version: "1.0" },
            paths: {
                "/test": {
                    delete: {
                        responses: {
                            "204": { description: "No Content" },
                        },
                    },
                },
            },
        } as Record<string, unknown>;
        const parsed = parseOpenApiDocument(doc);
        const responses = getResponses(parsed, "/test", "delete");
        expect(responses.length).toBe(1);
        expect(responses[0]?.schema).toBeUndefined();
        expect(responses[0]?.contentTypes).toEqual([]);
    });

    it("handles non-json content type", () => {
        const doc = {
            openapi: "3.1.0",
            info: { title: "Test", version: "1.0" },
            paths: {
                "/upload": {
                    post: {
                        requestBody: {
                            content: {
                                "multipart/form-data": {
                                    schema: {
                                        type: "object",
                                        properties: {
                                            file: {
                                                type: "string",
                                                format: "binary",
                                            },
                                        },
                                    },
                                },
                            },
                        },
                        responses: { "200": { description: "OK" } },
                    },
                },
            },
        } as Record<string, unknown>;
        const parsed = parseOpenApiDocument(doc);
        const body = getRequestBody(parsed, "/upload", "post");
        expect(body?.contentTypes).toEqual(["multipart/form-data"]);
        expect(body?.schema).toBeDefined();
    });
});
