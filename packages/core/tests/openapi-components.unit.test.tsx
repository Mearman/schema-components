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
import { SchemaComponent } from "../src/react/SchemaComponent.tsx";

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

    it("renders path-level summary and description above the operation header", () => {
        // OpenAPI 3.1 added optional `summary` and `description` at the
        // path-item level (in addition to operation-level). Both must
        // appear in the rendered header, distinguishable from the
        // operation-level fields by their `data-path-*` attributes.
        const docWithPathInfo = {
            openapi: "3.1.0",
            info: { title: "Test API", version: "1.0" },
            paths: {
                "/widgets": {
                    summary: "Widget collection",
                    description:
                        "Operations that read or mutate the shared widget pool.",
                    get: {
                        operationId: "listWidgets",
                        summary: "List widgets",
                        description: "Returns a paginated list of widgets.",
                        responses: {
                            "200": { description: "OK" },
                        },
                    },
                },
            },
        };

        const html = renderToString(
            createElement(ApiOperation, {
                schema: docWithPathInfo,
                path: "/widgets",
                method: "get",
            })
        );

        expect(html).toContain("data-path-summary");
        expect(html).toContain("Widget collection");
        expect(html).toContain("data-path-description");
        expect(html).toContain(
            "Operations that read or mutate the shared widget pool."
        );
        // Operation-level fields still render alongside the path-level ones.
        expect(html).toContain("List widgets");
        expect(html).toContain("Returns a paginated list of widgets.");
        // Path-level preamble appears before the operation heading.
        const summaryIndex = html.indexOf("Widget collection");
        const opHeadingIndex = html.indexOf("List widgets");
        expect(summaryIndex).toBeGreaterThan(-1);
        expect(opHeadingIndex).toBeGreaterThan(-1);
        expect(summaryIndex).toBeLessThan(opHeadingIndex);
    });

    it("omits the path-level preamble when neither field is present", () => {
        const html = renderToString(
            createElement(ApiOperation, {
                schema: doc,
                path: "/pets",
                method: "get",
            })
        );
        expect(html).not.toContain("data-path-info");
        expect(html).not.toContain("data-path-summary");
        expect(html).not.toContain("data-path-description");
    });

    it("renders only path-level summary when description is absent", () => {
        const docSummaryOnly = {
            openapi: "3.1.0",
            info: { title: "Test API", version: "1.0" },
            paths: {
                "/widgets": {
                    summary: "Widget collection",
                    get: {
                        operationId: "listWidgets",
                        responses: { "200": { description: "OK" } },
                    },
                },
            },
        };
        const html = renderToString(
            createElement(ApiOperation, {
                schema: docSummaryOnly,
                path: "/widgets",
                method: "get",
            })
        );
        expect(html).toContain("data-path-summary");
        expect(html).toContain("Widget collection");
        expect(html).not.toContain("data-path-description");
    });

    it("renders operation.description in the header", () => {
        const docWithDescription = {
            openapi: "3.1.0",
            info: { title: "Test API", version: "1.0" },
            paths: {
                "/widgets": {
                    get: {
                        operationId: "listWidgets",
                        summary: "List widgets",
                        description:
                            "Returns a paginated list of widgets. Supports filtering by colour and shape via query parameters. Results are cached for 30 seconds.",
                        responses: {
                            "200": { description: "OK" },
                        },
                    },
                },
            },
        };

        const html = renderToString(
            createElement(ApiOperation, {
                schema: docWithDescription,
                path: "/widgets",
                method: "get",
            })
        );

        expect(html).toContain("List widgets");
        expect(html).toContain(
            "Returns a paginated list of widgets. Supports filtering by colour and shape via query parameters. Results are cached for 30 seconds."
        );
        expect(html).toContain("data-description");
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
// OpenAPI 3.0 normalisation parity
//
// Regression guard: `<ApiRequestBody>` and `<ApiOperation>` must run the
// same 3.0 → 3.1 normalisation pipeline as `<SchemaComponent>` so that
// schema-level `nullable`, `discriminator`, and `example` keywords inside
// request bodies are honoured rather than silently passed through.
// ---------------------------------------------------------------------------

describe("OpenAPI 3.0 request body normalisation", () => {
    // The Dog/Cat options omit the discriminator `const` deliberately —
    // they rely on the OpenAPI 3.0 `discriminator.mapping` to inject the
    // const values during normalisation. Without 3.0 normalisation, the
    // walker's discriminated-union detection cannot find a per-option
    // const and falls back to a plain union (no tablist).
    //
    // The options are inline (not $ref) so the injected const stays on
    // the option and is visible to the walker.
    const oas30Doc = {
        openapi: "3.0.3",
        info: { title: "Animals", version: "1.0" },
        paths: {
            "/animals": {
                post: {
                    operationId: "createAnimal",
                    requestBody: {
                        required: true,
                        content: {
                            "application/json": {
                                schema: {
                                    type: "object",
                                    discriminator: {
                                        propertyName: "kind",
                                        mapping: {
                                            Dog: "#/components/schemas/Dog",
                                            Cat: "#/components/schemas/Cat",
                                        },
                                    },
                                    oneOf: [
                                        {
                                            type: "object",
                                            properties: {
                                                kind: { type: "string" },
                                                name: { type: "string" },
                                                nickname: {
                                                    type: "string",
                                                    nullable: true,
                                                    example: "Rex",
                                                },
                                            },
                                            required: ["kind", "name"],
                                        },
                                        {
                                            type: "object",
                                            properties: {
                                                kind: { type: "string" },
                                                name: { type: "string" },
                                            },
                                            required: ["kind", "name"],
                                        },
                                    ],
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
        components: {
            schemas: {
                Dog: { type: "object" },
                Cat: { type: "object" },
            },
        },
    };

    it("renders the discriminator as WAI-ARIA tabs via <ApiRequestBody>", () => {
        const html = renderToString(
            createElement(ApiRequestBody, {
                schema: oas30Doc,
                path: "/animals",
                method: "post",
                value: { kind: "Dog", name: "Fido" },
            })
        );
        // Discriminator normalisation should have produced a discriminated
        // union in the walker output, which the headless renderer turns
        // into a WAI-ARIA tablist with one tab per option.
        expect(html).toContain('role="tablist"');
        const tabMatches = html.match(/role="tab"/g) ?? [];
        expect(tabMatches.length).toBe(2);
        // Tab labels are derived from the discriminator const on each option.
        expect(html).toContain(">Dog<");
        expect(html).toContain(">Cat<");
    });

    it("matches <SchemaComponent> output for the same schema", () => {
        // Both paths must run the identical 3.0 → 3.1 normalisation pipeline.
        // Render the schema directly via <SchemaComponent> with a ref into
        // the request body, then assert <ApiRequestBody> produces the same
        // tablist + tab structure.
        const viaSchemaComponent = renderToString(
            createElement(SchemaComponent, {
                schema: oas30Doc,
                ref: "/animals/post",
                value: { kind: "Dog", name: "Fido" },
            })
        );
        const viaRequestBody = renderToString(
            createElement(ApiRequestBody, {
                schema: oas30Doc,
                path: "/animals",
                method: "post",
                value: { kind: "Dog", name: "Fido" },
            })
        );

        // Both must produce a tablist with the same tab count, proving
        // discriminator normalisation ran on both paths.
        expect(viaSchemaComponent).toContain('role="tablist"');
        expect(viaRequestBody).toContain('role="tablist"');
        const schemaTabs = viaSchemaComponent.match(/role="tab"/g) ?? [];
        const bodyTabs = viaRequestBody.match(/role="tab"/g) ?? [];
        expect(bodyTabs.length).toBe(schemaTabs.length);
        expect(viaRequestBody).toContain(">Dog<");
        expect(viaRequestBody).toContain(">Cat<");
        expect(viaSchemaComponent).toContain(">Dog<");
        expect(viaSchemaComponent).toContain(">Cat<");
    });

    it("matches <SchemaComponent> structurally for nullable + example fields", () => {
        // The `nickname` field is `nullable: true` with `example: "Rex"`.
        // After 3.0 normalisation, `nullable` becomes `anyOf [T, null]`
        // and `example` becomes `examples: [...]`. Asserting the two
        // pipelines produce identical structural output (modulo
        // per-instance React `useId` values) proves that both ran the
        // same normalisation pipeline. If <ApiRequestBody> skipped the
        // 3.0 normalisation, its walker output would differ — `nullable`
        // would surface as an unknown keyword, no anyOf branch would
        // exist, and the structure of the nickname input would diverge.
        const value = { kind: "Dog", name: "Fido", nickname: "Buddy" };
        const stripVariableIds = (html: string): string =>
            html
                .replace(/id="[^"]*"/g, 'id=""')
                .replace(/aria-controls="[^"]*"/g, 'aria-controls=""')
                .replace(/aria-labelledby="[^"]*"/g, 'aria-labelledby=""')
                .replace(/for="[^"]*"/g, 'for=""');

        const viaRequestBody = renderToString(
            createElement(ApiRequestBody, {
                schema: oas30Doc,
                path: "/animals",
                method: "post",
                value,
            })
        );
        const viaSchemaComponent = renderToString(
            createElement(SchemaComponent, {
                schema: oas30Doc,
                ref: "/animals/post",
                value,
            })
        );

        // <SchemaComponent>'s output is the inner schema rendering;
        // <ApiRequestBody> wraps it in a <section data-request-body>.
        // The inner schema portion must match structurally.
        const innerSchema = stripVariableIds(viaSchemaComponent);
        const wrapped = stripVariableIds(viaRequestBody);
        expect(wrapped).toContain(innerSchema);
        // The user-supplied value must be present in both renderings.
        expect(viaRequestBody).toContain("Buddy");
        expect(viaSchemaComponent).toContain("Buddy");
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

    it("propagates errors from getLinks instead of silently swallowing them", () => {
        // A link whose `parameters` member is a getter that throws. The
        // previous implementation wrapped the `getLinks` call in a bare
        // `try/catch` that silenced any exception — masking real bugs.
        // Removing the catch means this synthetic failure must surface.
        //
        // Using `parameters` (rather than `links` itself) localises the
        // throw inside `getLinks`: the surrounding normalisation pipeline
        // only shallow-copies the response and never descends into the
        // links map, so the getter only fires when `getLinks` iterates
        // each link.
        const linksError = new Error("synthetic links lookup failure");
        const malformedLink: Record<string, unknown> = {
            operationId: "follow",
        };
        Object.defineProperty(malformedLink, "parameters", {
            enumerable: true,
            configurable: true,
            get(): never {
                throw linksError;
            },
        });
        const malformedDoc = {
            openapi: "3.1.0",
            info: { title: "Test", version: "1.0" },
            paths: {
                "/items": {
                    get: {
                        responses: {
                            "200": {
                                description: "OK",
                                content: {
                                    "application/json": {
                                        schema: { type: "string" },
                                    },
                                },
                                links: {
                                    next: malformedLink,
                                },
                            },
                        },
                    },
                },
            },
        };

        expect(() =>
            renderToString(
                createElement(ApiOperation, {
                    schema: malformedDoc,
                    path: "/items",
                    method: "get",
                })
            )
        ).toThrow("synthetic links lookup failure");
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
