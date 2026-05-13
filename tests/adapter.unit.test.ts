/**
 * Unit tests for the schema adapter.
 *
 * Tests format detection, Zod 4 → JSON Schema conversion,
 * JSON Schema passthrough, and OpenAPI ref resolution.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { detectSchemaKind, normaliseSchema } from "../src/core/adapter.ts";

// ---------------------------------------------------------------------------
// detectSchemaKind
// ---------------------------------------------------------------------------

describe("detectSchemaKind", () => {
    it("detects Zod 4 schemas", () => {
        assert.equal(detectSchemaKind(z.string()), "zod4");
    });

    it("detects Zod 4 object schemas", () => {
        assert.equal(detectSchemaKind(z.object({ name: z.string() })), "zod4");
    });

    it("detects OpenAPI documents", () => {
        assert.equal(detectSchemaKind({ openapi: "3.1.0" }), "openapi");
    });

    it("detects plain JSON Schema objects", () => {
        assert.equal(
            detectSchemaKind({ type: "object", properties: {} }),
            "jsonSchema"
        );
    });

    it("returns jsonSchema for unknown objects", () => {
        assert.equal(detectSchemaKind({ foo: "bar" }), "jsonSchema");
    });
});

// ---------------------------------------------------------------------------
// normaliseSchema — Zod 4 → JSON Schema
// ---------------------------------------------------------------------------

describe("normaliseSchema — Zod 4", () => {
    it("converts Zod schema to JSON Schema", () => {
        const schema = z.object({ name: z.string() });
        const result = normaliseSchema(schema);
        assert.equal(result.jsonSchema.type, "object");
        const props = result.jsonSchema.properties;
        assert.ok(typeof props === "object" && props !== null);
        assert.ok("name" in props);
    });

    it("preserves original Zod schema for validation", () => {
        const schema = z.object({ name: z.string() });
        const result = normaliseSchema(schema);
        assert.equal(result.zodSchema, schema);
    });

    it("extracts root meta from a Zod schema's JSON Schema output", () => {
        const schema = z.object({ name: z.string() }).meta({ readOnly: true });
        const result = normaliseSchema(schema);
        assert.equal(result.rootMeta?.readOnly, true);
    });

    it("returns undefined rootMeta when no meta is set", () => {
        const schema = z.object({ name: z.string() });
        const result = normaliseSchema(schema);
        assert.equal(result.rootMeta, undefined);
    });
});

// ---------------------------------------------------------------------------
// normaliseSchema — JSON Schema passthrough
// ---------------------------------------------------------------------------

describe("normaliseSchema — JSON Schema", () => {
    it("passes JSON Schema through unchanged", () => {
        const jsonSchema = {
            type: "object" as const,
            properties: {
                name: { type: "string" as const },
                age: { type: "number" as const },
            },
            required: ["name"],
        };
        const result = normaliseSchema(jsonSchema);
        assert.equal(result.jsonSchema, jsonSchema);
        assert.equal(result.zodSchema, undefined);
    });

    it("extracts rootMeta from JSON Schema", () => {
        const jsonSchema = {
            type: "object" as const,
            readOnly: true,
            properties: {
                name: { type: "string" as const },
            },
        };
        const result = normaliseSchema(jsonSchema);
        assert.equal(result.rootMeta?.readOnly, true);
    });
});

// ---------------------------------------------------------------------------
// normaliseSchema — OpenAPI
// ---------------------------------------------------------------------------

describe("normaliseSchema — OpenAPI", () => {
    const openApiDoc = {
        openapi: "3.1.0",
        info: { title: "Test", version: "1.0.0" },
        paths: {},
        components: {
            schemas: {
                User: {
                    type: "object" as const,
                    properties: {
                        id: { type: "string" as const },
                        name: { type: "string" as const },
                    },
                    required: ["id"],
                },
            },
        },
    };

    it("resolves #/components/schemas/User", () => {
        const result = normaliseSchema(openApiDoc, "#/components/schemas/User");
        assert.equal(result.jsonSchema.type, "object");
        assert.ok(result.jsonSchema.properties);
    });

    it("uses the full OpenAPI doc as rootDocument for $ref resolution", () => {
        const result = normaliseSchema(openApiDoc, "#/components/schemas/User");
        assert.equal(result.rootDocument, openApiDoc);
    });

    it("throws for missing ref", () => {
        assert.throws(() => {
            normaliseSchema(openApiDoc, "#/components/schemas/NonExistent");
        });
    });

    it("uses first schema when no ref is given", () => {
        const result = normaliseSchema(openApiDoc);
        assert.equal(result.jsonSchema.type, "object");
    });

    it("throws for empty components/schemas", () => {
        const doc = {
            openapi: "3.1.0",
            components: { schemas: {} },
        };
        assert.throws(() => {
            normaliseSchema(doc);
        });
    });

    it("resolves path/method ref for request body", () => {
        const doc = {
            openapi: "3.1.0",
            paths: {
                "/users": {
                    post: {
                        requestBody: {
                            content: {
                                "application/json": {
                                    schema: {
                                        type: "object" as const,
                                        properties: {
                                            name: { type: "string" as const },
                                        },
                                    },
                                },
                            },
                        },
                        responses: { "201": { description: "Created" } },
                    },
                },
            },
        };
        const result = normaliseSchema(doc, "/users/post");
        assert.equal(result.jsonSchema.type, "object");
        assert.ok(result.jsonSchema.properties);
    });
});
