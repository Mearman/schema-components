/**
 * Tests for deep OpenAPI 3.0.x normalisation across every schema-bearing
 * surface — response headers, callbacks, components/parameters,
 * components/responses, components/requestBodies, components/headers,
 * components/callbacks, encoding headers, and webhooks (3.1).
 *
 * Regression guard: 3.0 keywords (`nullable`, `discriminator`, `example`)
 * sitting in these locations were previously passed through to the walker
 * verbatim, producing broken UI or silent type mismatches. Each test
 * exercises one such surface.
 */

import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import {
    deepNormaliseOpenApi30Doc,
    normaliseOpenApi30Combined,
} from "../src/core/openapi30.ts";
import { deepNormalise } from "../src/core/normalise.ts";
import { isObject } from "../src/core/guards.ts";
import { ApiParameters } from "../src/openapi/components.tsx";

// ---------------------------------------------------------------------------
// Narrowing helpers — same pattern as openapi30.unit.test.ts
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
// Response headers
// ---------------------------------------------------------------------------

describe("deepNormaliseOpenApi30Doc — response headers", () => {
    it("normalises nullable in response header schemas", () => {
        const doc = {
            openapi: "3.0.3",
            info: { title: "Test", version: "1.0" },
            paths: {
                "/things": {
                    get: {
                        responses: {
                            "200": {
                                description: "OK",
                                headers: {
                                    "X-Trace-Id": {
                                        schema: {
                                            type: "string",
                                            nullable: true,
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
        const headerSchema = prop(
            prop(
                prop(
                    prop(
                        prop(
                            prop(prop(prop(result, "paths"), "/things"), "get"),
                            "responses"
                        ),
                        "200"
                    ),
                    "headers"
                ),
                "X-Trace-Id"
            ),
            "schema"
        );

        expect(headerSchema).toBeDefined();
        if (headerSchema === undefined) return;
        expect(headerSchema.nullable).toBeUndefined();
        expect(headerSchema.anyOf).toBeDefined();
    });

    it("injects discriminator const into response header schema oneOf", () => {
        const doc = {
            openapi: "3.0.3",
            info: { title: "Test", version: "1.0" },
            paths: {
                "/events": {
                    get: {
                        responses: {
                            "200": {
                                description: "OK",
                                headers: {
                                    "X-Event": {
                                        schema: {
                                            oneOf: [
                                                {
                                                    type: "object",
                                                    properties: {
                                                        kind: {
                                                            type: "string",
                                                        },
                                                    },
                                                },
                                                {
                                                    type: "object",
                                                    properties: {
                                                        kind: {
                                                            type: "string",
                                                        },
                                                    },
                                                },
                                            ],
                                            discriminator: {
                                                propertyName: "kind",
                                                mapping: {
                                                    created: "#/a",
                                                    deleted: "#/b",
                                                },
                                            },
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
        const headerSchema = prop(
            prop(
                prop(
                    prop(
                        prop(
                            prop(prop(prop(result, "paths"), "/events"), "get"),
                            "responses"
                        ),
                        "200"
                    ),
                    "headers"
                ),
                "X-Event"
            ),
            "schema"
        );

        expect(headerSchema).toBeDefined();
        if (headerSchema === undefined) return;
        // discriminator should be stripped after normalisation
        expect(headerSchema.discriminator).toBeUndefined();

        const oneOf = propArr(headerSchema, "oneOf");
        expect(oneOf).toBeDefined();
        if (oneOf === undefined) return;

        const createdKind = prop(prop(oneOf[0], "properties"), "kind");
        const deletedKind = prop(prop(oneOf[1], "properties"), "kind");
        expect(propVal(createdKind, "const")).toBe("created");
        expect(propVal(deletedKind, "const")).toBe("deleted");
    });
});

// ---------------------------------------------------------------------------
// Callbacks
// ---------------------------------------------------------------------------

describe("deepNormaliseOpenApi30Doc — callbacks", () => {
    it("normalises nullable inside callback response schemas", () => {
        const doc = {
            openapi: "3.0.3",
            info: { title: "Test", version: "1.0" },
            paths: {
                "/subscribe": {
                    post: {
                        callbacks: {
                            onEvent: {
                                "{$request.body#/callbackUrl}": {
                                    post: {
                                        responses: {
                                            "200": {
                                                description: "OK",
                                                content: {
                                                    "application/json": {
                                                        schema: {
                                                            type: "string",
                                                            nullable: true,
                                                        },
                                                    },
                                                },
                                            },
                                        },
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
        const callbackResponse = prop(
            prop(
                prop(
                    prop(
                        prop(
                            prop(
                                prop(
                                    prop(
                                        prop(
                                            prop(
                                                prop(result, "paths"),
                                                "/subscribe"
                                            ),
                                            "post"
                                        ),
                                        "callbacks"
                                    ),
                                    "onEvent"
                                ),
                                "{$request.body#/callbackUrl}"
                            ),
                            "post"
                        ),
                        "responses"
                    ),
                    "200"
                ),
                "content"
            ),
            "application/json"
        );
        const schema = prop(callbackResponse, "schema");

        expect(schema).toBeDefined();
        if (schema === undefined) return;
        expect(schema.nullable).toBeUndefined();
        expect(schema.anyOf).toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// components/parameters
// ---------------------------------------------------------------------------

describe("deepNormaliseOpenApi30Doc — components/parameters", () => {
    it("normalises nullable on a shared parameter schema", () => {
        const doc = {
            openapi: "3.0.3",
            info: { title: "Test", version: "1.0" },
            paths: {},
            components: {
                parameters: {
                    Cursor: {
                        name: "cursor",
                        in: "query",
                        schema: { type: "string", nullable: true },
                    },
                },
            },
        };

        const result = deepNormaliseOpenApi30Doc(doc, deepNormalise);
        const cursorSchema = prop(
            prop(prop(prop(result, "components"), "parameters"), "Cursor"),
            "schema"
        );

        expect(cursorSchema).toBeDefined();
        if (cursorSchema === undefined) return;
        expect(cursorSchema.nullable).toBeUndefined();
        expect(cursorSchema.anyOf).toBeDefined();
    });

    it("renders shared nullable parameter via <ApiParameters>", () => {
        const doc = {
            openapi: "3.0.3",
            info: { title: "Test", version: "1.0" },
            paths: {
                "/items": {
                    get: {
                        parameters: [
                            { $ref: "#/components/parameters/Cursor" },
                        ],
                        responses: {
                            "200": { description: "OK" },
                        },
                    },
                },
            },
            components: {
                parameters: {
                    Cursor: {
                        name: "cursor",
                        in: "query",
                        description: "Pagination cursor",
                        schema: { type: "string", nullable: true },
                    },
                },
            },
        };

        const html = renderToString(
            createElement(ApiParameters, {
                schema: doc,
                path: "/items",
                method: "get",
            })
        );
        // The parameter must render — proving the $ref resolved and the
        // component picked it up post-normalisation.
        expect(html).toContain("cursor");
        expect(html).toContain("Pagination cursor");
    });
});

// ---------------------------------------------------------------------------
// components/responses
// ---------------------------------------------------------------------------

describe("deepNormaliseOpenApi30Doc — components/responses", () => {
    it("normalises example inside a shared response schema", () => {
        const doc = {
            openapi: "3.0.3",
            info: { title: "Test", version: "1.0" },
            paths: {},
            components: {
                responses: {
                    NotFound: {
                        description: "Not found",
                        content: {
                            "application/json": {
                                schema: {
                                    type: "object",
                                    properties: {
                                        message: {
                                            type: "string",
                                            example: "Not found",
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
        const messageProp = prop(
            prop(
                prop(
                    prop(
                        prop(
                            prop(
                                prop(prop(result, "components"), "responses"),
                                "NotFound"
                            ),
                            "content"
                        ),
                        "application/json"
                    ),
                    "schema"
                ),
                "properties"
            ),
            "message"
        );

        expect(messageProp).toBeDefined();
        if (messageProp === undefined) return;
        // 3.0 singular `example` should have become 3.1 array `examples`
        expect(messageProp.example).toBeUndefined();
        expect(messageProp.examples).toEqual(["Not found"]);
    });

    it("normalises headers nested inside a shared response", () => {
        const doc = {
            openapi: "3.0.3",
            info: { title: "Test", version: "1.0" },
            paths: {},
            components: {
                responses: {
                    Page: {
                        description: "Paginated",
                        headers: {
                            "X-Next": {
                                schema: { type: "string", nullable: true },
                            },
                        },
                    },
                },
            },
        };

        const result = deepNormaliseOpenApi30Doc(doc, deepNormalise);
        const directSchema = prop(
            prop(
                prop(
                    prop(prop(prop(result, "components"), "responses"), "Page"),
                    "headers"
                ),
                "X-Next"
            ),
            "schema"
        );
        expect(directSchema).toBeDefined();
        if (directSchema === undefined) return;
        expect(directSchema.nullable).toBeUndefined();
        expect(directSchema.anyOf).toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// components/requestBodies
// ---------------------------------------------------------------------------

describe("deepNormaliseOpenApi30Doc — components/requestBodies", () => {
    it("normalises nullable inside a shared request body schema", () => {
        const doc = {
            openapi: "3.0.3",
            info: { title: "Test", version: "1.0" },
            paths: {},
            components: {
                requestBodies: {
                    PatchPayload: {
                        required: true,
                        content: {
                            "application/json": {
                                schema: {
                                    type: "object",
                                    properties: {
                                        nickname: {
                                            type: "string",
                                            nullable: true,
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
        const nickname = prop(
            prop(
                prop(
                    prop(
                        prop(
                            prop(
                                prop(
                                    prop(result, "components"),
                                    "requestBodies"
                                ),
                                "PatchPayload"
                            ),
                            "content"
                        ),
                        "application/json"
                    ),
                    "schema"
                ),
                "properties"
            ),
            "nickname"
        );

        expect(nickname).toBeDefined();
        if (nickname === undefined) return;
        expect(nickname.nullable).toBeUndefined();
        expect(nickname.anyOf).toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// components/headers
// ---------------------------------------------------------------------------

describe("deepNormaliseOpenApi30Doc — components/headers", () => {
    it("normalises nullable on a shared header schema", () => {
        const doc = {
            openapi: "3.0.3",
            info: { title: "Test", version: "1.0" },
            paths: {},
            components: {
                headers: {
                    XRequestId: {
                        schema: { type: "string", nullable: true },
                    },
                },
            },
        };

        const result = deepNormaliseOpenApi30Doc(doc, deepNormalise);
        const schema = prop(
            prop(prop(prop(result, "components"), "headers"), "XRequestId"),
            "schema"
        );

        expect(schema).toBeDefined();
        if (schema === undefined) return;
        expect(schema.nullable).toBeUndefined();
        expect(schema.anyOf).toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// components/callbacks
// ---------------------------------------------------------------------------

describe("deepNormaliseOpenApi30Doc — components/callbacks", () => {
    it("normalises schemas nested inside a shared callback", () => {
        const doc = {
            openapi: "3.0.3",
            info: { title: "Test", version: "1.0" },
            paths: {},
            components: {
                callbacks: {
                    OnEvent: {
                        "{$request.body#/url}": {
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
                },
            },
        };

        const result = deepNormaliseOpenApi30Doc(doc, deepNormalise);
        const schema = prop(
            prop(
                prop(
                    prop(
                        prop(
                            prop(
                                prop(
                                    prop(
                                        prop(result, "components"),
                                        "callbacks"
                                    ),
                                    "OnEvent"
                                ),
                                "{$request.body#/url}"
                            ),
                            "post"
                        ),
                        "requestBody"
                    ),
                    "content"
                ),
                "application/json"
            ),
            "schema"
        );

        expect(schema).toBeDefined();
        if (schema === undefined) return;
        expect(schema.nullable).toBeUndefined();
        expect(schema.anyOf).toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// Encoding headers (within media type objects)
// ---------------------------------------------------------------------------

describe("deepNormaliseOpenApi30Doc — encoding headers", () => {
    it("normalises nullable inside encoding headers", () => {
        const doc = {
            openapi: "3.0.3",
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
                                    encoding: {
                                        file: {
                                            headers: {
                                                "X-Hash": {
                                                    schema: {
                                                        type: "string",
                                                        nullable: true,
                                                    },
                                                },
                                            },
                                        },
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
        const headerSchema = prop(
            prop(
                prop(
                    prop(
                        prop(
                            prop(
                                prop(
                                    prop(
                                        prop(
                                            prop(
                                                prop(result, "paths"),
                                                "/upload"
                                            ),
                                            "post"
                                        ),
                                        "requestBody"
                                    ),
                                    "content"
                                ),
                                "multipart/form-data"
                            ),
                            "encoding"
                        ),
                        "file"
                    ),
                    "headers"
                ),
                "X-Hash"
            ),
            "schema"
        );

        expect(headerSchema).toBeDefined();
        if (headerSchema === undefined) return;
        expect(headerSchema.nullable).toBeUndefined();
        expect(headerSchema.anyOf).toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// Webhooks (OpenAPI 3.1) — combined transform exercised when callers
// opt in via `deepNormaliseOpenApi30Doc`. The 3.1 entry point in
// normalise.ts uses only the discriminator transform.
// ---------------------------------------------------------------------------

describe("deepNormaliseOpenApi30Doc — webhooks", () => {
    it("walks webhooks the same way as paths", () => {
        const doc = {
            openapi: "3.1.0",
            info: { title: "Test", version: "1.0" },
            webhooks: {
                onCreated: {
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
        const schema = prop(
            prop(
                prop(
                    prop(
                        prop(
                            prop(prop(result, "webhooks"), "onCreated"),
                            "post"
                        ),
                        "requestBody"
                    ),
                    "content"
                ),
                "application/json"
            ),
            "schema"
        );
        expect(schema).toBeDefined();
        if (schema === undefined) return;
        expect(schema.nullable).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// Direct combined transform regression — ensures the per-node transform
// is exported and behaves the same when called outside the visitor.
// ---------------------------------------------------------------------------

describe("normaliseOpenApi30Combined", () => {
    it("strips nullable, discriminator, and converts example in one pass", () => {
        const node: Record<string, unknown> = {
            type: "object",
            nullable: true,
            example: { ok: true },
            discriminator: { propertyName: "k" },
            oneOf: [
                {
                    type: "object",
                    properties: { k: { type: "string" } },
                },
            ],
        };
        const result = deepNormalise(node, normaliseOpenApi30Combined);
        // discriminator stripped
        expect(result.discriminator).toBeUndefined();
        // nullable replaced with anyOf wrapping
        expect(result.nullable).toBeUndefined();
        expect(result.anyOf).toBeDefined();
        // example → examples (singular consumed at this node)
        expect(result.example).toBeUndefined();
    });
});
