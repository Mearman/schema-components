/**
 * OpenAPI parser fixes — covers the regressions identified in the
 * OpenAPI compatibility review:
 *
 * - Webhook with `$ref` Path Item resolves operations.
 * - OAS 3.1 Reference Object sibling `description`/`summary` overrides the
 *   referenced node's same-name fields.
 * - `application/json; charset=utf-8` media-type lookup succeeds.
 * - Multi-hop Parameter Object `$ref` chain resolves; cycle and depth-cap
 *   emit the appropriate diagnostic.
 * - Unknown parameter `in` emits `unknown-parameter-location` and excludes
 *   the parameter from the operation's parameter list.
 * - Duplicate `operationId` across the document emits `duplicate-operation-id`.
 *
 * Each test calls the parser directly with a hand-built document — the
 * normalisation pipeline in `resolve.ts:getParsed` is intentionally not
 * involved here so we observe the parser's behaviour in isolation.
 */

import { describe, it, expect } from "vitest";
import {
    parseOpenApiDocument,
    listAllOperations,
    listWebhooks,
    listOperations,
    extractRequestBody,
    extractResponses,
    extractParameters,
} from "../src/openapi/parser.ts";
import type { Diagnostic, DiagnosticSink } from "../src/core/diagnostics.ts";

function collectDiagnostics(): {
    diagnostics: Diagnostic[];
    sink: DiagnosticSink;
} {
    const diagnostics: Diagnostic[] = [];
    const sink: DiagnosticSink = (d) => diagnostics.push(d);
    return { diagnostics, sink };
}

// ---------------------------------------------------------------------------
// Webhook with $ref Path Item
// ---------------------------------------------------------------------------

describe("listWebhooks — Path Item $ref resolution", () => {
    it("resolves a $ref-based webhook entry to its target Path Item", () => {
        const doc = {
            openapi: "3.1.0",
            info: { title: "Test", version: "1.0" },
            paths: {},
            webhooks: {
                petCreated: { $ref: "#/components/pathItems/PetCreated" },
            },
            components: {
                pathItems: {
                    PetCreated: {
                        post: {
                            operationId: "onPetCreated",
                            summary: "Pet created webhook",
                            requestBody: {
                                content: {
                                    "application/json": {
                                        schema: {
                                            type: "object",
                                            properties: {
                                                id: { type: "string" },
                                            },
                                        },
                                    },
                                },
                            },
                            responses: { "200": { description: "ack" } },
                        },
                    },
                },
            },
        } as Record<string, unknown>;

        const parsed = parseOpenApiDocument(doc);
        const webhooks = listWebhooks(parsed);
        expect(webhooks.length).toBe(1);
        expect(webhooks[0]?.name).toBe("petCreated");
        expect(webhooks[0]?.operations.length).toBe(1);
        expect(webhooks[0]?.operations[0]?.operationId).toBe("onPetCreated");
        expect(webhooks[0]?.operations[0]?.method).toBe("post");
    });

    it("emits cyclic-path-item-ref for a self-cycling webhook Path Item", () => {
        const doc = {
            openapi: "3.1.0",
            info: { title: "Test", version: "1.0" },
            paths: {},
            webhooks: {
                loop: { $ref: "#/components/pathItems/Loop" },
            },
            components: {
                pathItems: {
                    Loop: { $ref: "#/components/pathItems/Loop" },
                },
            },
        } as Record<string, unknown>;

        const parsed = parseOpenApiDocument(doc);
        const { diagnostics, sink } = collectDiagnostics();
        const webhooks = listWebhooks(parsed, { diagnostics: sink });
        // The cycling webhook resolves to undefined and is skipped.
        expect(webhooks.length).toBe(0);
        expect(diagnostics.some((d) => d.code === "cyclic-path-item-ref")).toBe(
            true
        );
    });

    it("emits path-item-ref-too-deep for a webhook chain exceeding the hop cap", () => {
        const pathItems: Record<string, unknown> = {};
        // Build a chain of 10 refs P0 → P1 → ... → P9 → P10 (final).
        for (let i = 0; i < 10; i++) {
            pathItems[`P${String(i)}`] = {
                $ref: `#/components/pathItems/P${String(i + 1)}`,
            };
        }
        pathItems.P10 = {
            post: {
                operationId: "deepWebhook",
                responses: { "200": { description: "ok" } },
            },
        };
        const doc = {
            openapi: "3.1.0",
            info: { title: "Test", version: "1.0" },
            paths: {},
            webhooks: {
                deep: { $ref: "#/components/pathItems/P0" },
            },
            components: { pathItems },
        } as Record<string, unknown>;

        const parsed = parseOpenApiDocument(doc);
        const { diagnostics, sink } = collectDiagnostics();
        listWebhooks(parsed, { diagnostics: sink });
        expect(
            diagnostics.some((d) => d.code === "path-item-ref-too-deep")
        ).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// OAS 3.1 Reference Object sibling merge
// ---------------------------------------------------------------------------

describe("Reference Object sibling merge (OAS 3.1)", () => {
    const doc31 = {
        openapi: "3.1.0",
        info: { title: "Test", version: "1.0" },
        paths: {
            "/items": {
                post: {
                    requestBody: {
                        $ref: "#/components/requestBodies/CreateItem",
                        // OAS 3.1 sibling — overrides target's description
                        description: "Wrapper-level item payload",
                    },
                    responses: {
                        "200": {
                            $ref: "#/components/responses/Ok",
                            description: "Wrapper-level OK",
                        },
                    },
                },
            },
        },
        components: {
            requestBodies: {
                CreateItem: {
                    required: true,
                    description: "Component-level item payload",
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                properties: { name: { type: "string" } },
                                required: ["name"],
                            },
                        },
                    },
                },
            },
            responses: {
                Ok: {
                    description: "Component-level OK",
                    content: {
                        "application/json": {
                            schema: { type: "object" },
                        },
                    },
                },
            },
        },
    } as Record<string, unknown>;

    it("wrapper description overrides the referenced node on OAS 3.1 requestBody", () => {
        const parsed = parseOpenApiDocument(doc31);
        const body = extractRequestBody(parsed, "/items", "post");
        expect(body?.description).toBe("Wrapper-level item payload");
        // Non-sibling fields still come from the target — required stays true.
        expect(body?.required).toBe(true);
    });

    it("wrapper description overrides the referenced node on OAS 3.1 response", () => {
        const parsed = parseOpenApiDocument(doc31);
        const responses = extractResponses(parsed, "/items", "post");
        const ok = responses.find((r) => r.statusCode === "200");
        expect(ok?.description).toBe("Wrapper-level OK");
    });

    it("OAS 3.0 ignores Reference Object siblings (spec forbids them)", () => {
        const doc30 = {
            openapi: "3.0.3",
            info: { title: "Test", version: "1.0" },
            paths: {
                "/items": {
                    post: {
                        requestBody: {
                            $ref: "#/components/requestBodies/CreateItem",
                            // Invalid under OAS 3.0 — must be ignored.
                            description: "Wrapper-level (should be dropped)",
                        },
                        responses: { "201": { description: "Created" } },
                    },
                },
            },
            components: {
                requestBodies: {
                    CreateItem: {
                        required: true,
                        description: "Component-level",
                        content: {
                            "application/json": {
                                schema: { type: "object" },
                            },
                        },
                    },
                },
            },
        } as Record<string, unknown>;

        const parsed = parseOpenApiDocument(doc30);
        const body = extractRequestBody(parsed, "/items", "post");
        expect(body?.description).toBe("Component-level");
    });
});

// ---------------------------------------------------------------------------
// Media-type parameter normalisation
// ---------------------------------------------------------------------------

describe("extractSchemaFromContent — media-type parameters", () => {
    it("matches application/json with a charset parameter", () => {
        const doc = {
            openapi: "3.1.0",
            info: { title: "Test", version: "1.0" },
            paths: {
                "/items": {
                    get: {
                        responses: {
                            "200": {
                                description: "OK",
                                content: {
                                    "application/json; charset=utf-8": {
                                        schema: {
                                            type: "object",
                                            properties: {
                                                ok: { type: "boolean" },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        } as Record<string, unknown>;

        const parsed = parseOpenApiDocument(doc);
        const responses = extractResponses(parsed, "/items", "get");
        expect(responses[0]?.schema).toEqual({
            type: "object",
            properties: { ok: { type: "boolean" } },
        });
    });

    it("prefers application/json with charset over non-JSON alternatives", () => {
        const doc = {
            openapi: "3.1.0",
            info: { title: "Test", version: "1.0" },
            paths: {
                "/items": {
                    get: {
                        responses: {
                            "200": {
                                description: "OK",
                                content: {
                                    "application/xml": {
                                        schema: { type: "string" },
                                    },
                                    "application/json; charset=utf-8": {
                                        schema: { type: "object" },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        } as Record<string, unknown>;

        const parsed = parseOpenApiDocument(doc);
        const responses = extractResponses(parsed, "/items", "get");
        expect(responses[0]?.schema).toEqual({ type: "object" });
    });
});

// ---------------------------------------------------------------------------
// Parameter $ref chain resolution
// ---------------------------------------------------------------------------

describe("resolveParam — Reference Object chain", () => {
    it("resolves a two-hop parameter reference chain", () => {
        const doc = {
            openapi: "3.1.0",
            info: { title: "Test", version: "1.0" },
            paths: {
                "/items": {
                    get: {
                        parameters: [
                            { $ref: "#/components/parameters/FirstHop" },
                        ],
                        responses: { "200": { description: "OK" } },
                    },
                },
            },
            components: {
                parameters: {
                    FirstHop: { $ref: "#/components/parameters/Final" },
                    Final: {
                        name: "limit",
                        in: "query",
                        required: false,
                        schema: { type: "integer" },
                    },
                },
            },
        } as Record<string, unknown>;

        const parsed = parseOpenApiDocument(doc);
        const params = extractParameters(parsed, "/items", "get");
        expect(params.length).toBe(1);
        expect(params[0]?.name).toBe("limit");
        expect(params[0]?.location).toBe("query");
    });

    it("emits cyclic-parameter-ref for a self-cycling parameter ref", () => {
        const doc = {
            openapi: "3.1.0",
            info: { title: "Test", version: "1.0" },
            paths: {
                "/items": {
                    get: {
                        parameters: [{ $ref: "#/components/parameters/Loop" }],
                        responses: { "200": { description: "OK" } },
                    },
                },
            },
            components: {
                parameters: {
                    Loop: { $ref: "#/components/parameters/Loop" },
                },
            },
        } as Record<string, unknown>;

        const parsed = parseOpenApiDocument(doc);
        const { diagnostics, sink } = collectDiagnostics();
        const params = extractParameters(parsed, "/items", "get", {
            diagnostics: sink,
        });
        expect(params).toEqual([]);
        const diag = diagnostics.find(
            (d) =>
                d.code === "cyclic-parameter-ref" &&
                d.detail?.kind === "parameter"
        );
        expect(diag).toBeDefined();
    });

    it("emits parameter-ref-too-deep for an over-deep parameter ref chain", () => {
        const parameters: Record<string, unknown> = {};
        // Default cap is 8 (MAX_PATH_ITEM_REF_HOPS from core/limits.ts).
        // Build a chain of 10 refs so we exceed the cap before reaching
        // the terminus.
        for (let i = 0; i < 10; i++) {
            parameters[`P${String(i)}`] = {
                $ref: `#/components/parameters/P${String(i + 1)}`,
            };
        }
        parameters.P10 = {
            name: "deep",
            in: "query",
            schema: { type: "string" },
        };
        const doc = {
            openapi: "3.1.0",
            info: { title: "Test", version: "1.0" },
            paths: {
                "/items": {
                    get: {
                        parameters: [{ $ref: "#/components/parameters/P0" }],
                        responses: { "200": { description: "OK" } },
                    },
                },
            },
            components: { parameters },
        } as Record<string, unknown>;

        const parsed = parseOpenApiDocument(doc);
        const { diagnostics, sink } = collectDiagnostics();
        const params = extractParameters(parsed, "/items", "get", {
            diagnostics: sink,
        });
        expect(params).toEqual([]);
        const diag = diagnostics.find(
            (d) =>
                d.code === "parameter-ref-too-deep" &&
                d.detail?.kind === "parameter"
        );
        expect(diag).toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// Unknown parameter location
// ---------------------------------------------------------------------------

describe("toParameterLocation — unknown `in` value", () => {
    it("excludes parameters with an unknown `in` and emits a diagnostic", () => {
        const doc = {
            openapi: "3.1.0",
            info: { title: "Test", version: "1.0" },
            paths: {
                "/items": {
                    get: {
                        parameters: [
                            {
                                name: "valid",
                                in: "query",
                                schema: { type: "string" },
                            },
                            {
                                name: "invalid",
                                in: "body", // Swagger 2.0 leftover — not OAS 3.x
                                schema: { type: "string" },
                            },
                            {
                                name: "alsoInvalid",
                                in: "formData",
                                schema: { type: "string" },
                            },
                        ],
                        responses: { "200": { description: "OK" } },
                    },
                },
            },
        } as Record<string, unknown>;

        const parsed = parseOpenApiDocument(doc);
        const { diagnostics, sink } = collectDiagnostics();
        const params = extractParameters(parsed, "/items", "get", {
            diagnostics: sink,
        });

        // The two unknown-location parameters are dropped; only the
        // valid one survives.
        expect(params.length).toBe(1);
        expect(params[0]?.name).toBe("valid");

        // Two diagnostics, one per dropped parameter.
        const unknownDiagnostics = diagnostics.filter(
            (d) => d.code === "unknown-parameter-location"
        );
        expect(unknownDiagnostics.length).toBe(2);
        const names = unknownDiagnostics.map((d) => d.detail?.name).sort();
        expect(names).toEqual(["alsoInvalid", "invalid"]);
    });

    it("excludes the parameter even when no diagnostic sink is supplied", () => {
        const doc = {
            openapi: "3.1.0",
            info: { title: "Test", version: "1.0" },
            paths: {
                "/items": {
                    get: {
                        parameters: [
                            {
                                name: "invalid",
                                in: "body",
                                schema: { type: "string" },
                            },
                        ],
                        responses: { "200": { description: "OK" } },
                    },
                },
            },
        } as Record<string, unknown>;

        const parsed = parseOpenApiDocument(doc);
        const params = extractParameters(parsed, "/items", "get");
        expect(params).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// Duplicate operationId
// ---------------------------------------------------------------------------

describe("listOperations — duplicate operationId", () => {
    it("emits duplicate-operation-id when the same id appears twice", () => {
        const doc = {
            openapi: "3.1.0",
            info: { title: "Test", version: "1.0" },
            paths: {
                "/items": {
                    get: {
                        operationId: "listThings",
                        responses: { "200": { description: "OK" } },
                    },
                },
                "/things": {
                    get: {
                        operationId: "listThings",
                        responses: { "200": { description: "OK" } },
                    },
                },
            },
        } as Record<string, unknown>;

        const parsed = parseOpenApiDocument(doc);
        const { diagnostics, sink } = collectDiagnostics();
        const operations = listOperations(parsed, { diagnostics: sink });

        // Both operations still surface in the list — the diagnostic does
        // not change the returned shape.
        expect(operations.length).toBe(2);

        const dup = diagnostics.find(
            (d) => d.code === "duplicate-operation-id"
        );
        expect(dup).toBeDefined();
        expect(dup?.detail?.operationId).toBe("listThings");
        expect(dup?.detail?.firstSeenAt).toBe("GET /items");
        expect(dup?.detail?.duplicateAt).toBe("GET /things");
    });

    it("does not emit duplicate-operation-id for distinct ids", () => {
        const doc = {
            openapi: "3.1.0",
            info: { title: "Test", version: "1.0" },
            paths: {
                "/items": {
                    get: {
                        operationId: "listItems",
                        responses: { "200": { description: "OK" } },
                    },
                },
                "/things": {
                    get: {
                        operationId: "listThings",
                        responses: { "200": { description: "OK" } },
                    },
                },
            },
        } as Record<string, unknown>;

        const parsed = parseOpenApiDocument(doc);
        const { diagnostics, sink } = collectDiagnostics();
        listOperations(parsed, { diagnostics: sink });
        expect(
            diagnostics.filter((d) => d.code === "duplicate-operation-id")
        ).toEqual([]);
    });

    it("flags cross-list operationId collisions between paths and webhooks", () => {
        const doc = {
            openapi: "3.1.0",
            info: { title: "Test", version: "1.0" },
            paths: {
                "/orders": {
                    post: {
                        operationId: "orderCreated",
                        responses: { "200": { description: "OK" } },
                    },
                },
            },
            webhooks: {
                orderCreated: {
                    post: {
                        operationId: "orderCreated",
                        responses: { "200": { description: "OK" } },
                    },
                },
            },
        } as Record<string, unknown>;

        const parsed = parseOpenApiDocument(doc);
        const { diagnostics, sink } = collectDiagnostics();
        listAllOperations(parsed, { diagnostics: sink });
        const dup = diagnostics.find(
            (d) => d.code === "duplicate-operation-id"
        );
        expect(dup).toBeDefined();
        expect(dup?.detail?.operationId).toBe("orderCreated");
        expect(String(dup?.detail?.duplicateAt)).toContain(
            "webhook:orderCreated"
        );
    });
});
