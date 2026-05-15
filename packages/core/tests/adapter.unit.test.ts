/**
 * Unit tests for the schema adapter.
 *
 * Tests format detection, Zod 4 → JSON Schema conversion,
 * JSON Schema passthrough, and OpenAPI ref resolution.
 */

import { describe, it, expect } from "vitest";
import { z } from "zod";
import { detectSchemaKind, normaliseSchema } from "../src/core/adapter.ts";

// ---------------------------------------------------------------------------
// detectSchemaKind
// ---------------------------------------------------------------------------

describe("detectSchemaKind", () => {
    it("detects Zod 4 schemas", () => {
        expect(detectSchemaKind(z.string())).toBe("zod4");
    });

    it("detects Zod 4 object schemas", () => {
        expect(detectSchemaKind(z.object({ name: z.string() }))).toBe("zod4");
    });

    it("detects OpenAPI documents", () => {
        expect(detectSchemaKind({ openapi: "3.1.0" })).toBe("openapi");
    });

    it("detects plain JSON Schema objects", () => {
        expect(detectSchemaKind({ type: "object", properties: {} })).toBe(
            "jsonSchema"
        );
    });

    it("returns jsonSchema for unknown objects", () => {
        expect(detectSchemaKind({ foo: "bar" })).toBe("jsonSchema");
    });
});

// ---------------------------------------------------------------------------
// normaliseSchema — Zod 4 → JSON Schema
// ---------------------------------------------------------------------------

describe("normaliseSchema — Zod 4", () => {
    it("converts Zod schema to JSON Schema", () => {
        const schema = z.object({ name: z.string() });
        const result = normaliseSchema(schema);
        expect(result.jsonSchema.type).toBe("object");
        const props = result.jsonSchema.properties;
        expect(typeof props === "object" && props !== null).toBeTruthy();
        if (typeof props === "object" && props !== null) {
            expect("name" in props).toBeTruthy();
        }
    });

    it("preserves original Zod schema for validation", () => {
        const schema = z.object({ name: z.string() });
        const result = normaliseSchema(schema);
        expect(result.zodSchema).toBe(schema);
    });

    it("extracts root meta from a Zod schema's JSON Schema output", () => {
        const schema = z.object({ name: z.string() }).meta({ readOnly: true });
        const result = normaliseSchema(schema);
        expect(result.rootMeta?.readOnly).toBe(true);
    });

    it("returns undefined rootMeta when no meta is set", () => {
        const schema = z.object({ name: z.string() });
        const result = normaliseSchema(schema);
        expect(result.rootMeta).toBe(undefined);
    });
});

// ---------------------------------------------------------------------------
// normaliseSchema — JSON Schema passthrough
// ---------------------------------------------------------------------------

describe("normaliseSchema — JSON Schema", () => {
    it("passes JSON Schema content through", () => {
        const jsonSchema = {
            type: "object" as const,
            properties: {
                name: { type: "string" as const },
                age: { type: "number" as const },
            },
            required: ["name"],
        };
        const result = normaliseSchema(jsonSchema);
        expect(result.jsonSchema.type).toBe("object");
        expect(result.jsonSchema.properties).toStrictEqual({
            name: { type: "string" },
            age: { type: "number" },
        });
        expect(result.jsonSchema.required).toStrictEqual(["name"]);
        expect(result.zodSchema).toBe(undefined);
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
        expect(result.rootMeta?.readOnly).toBe(true);
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
        expect(result.jsonSchema.type).toBe("object");
        expect(result.jsonSchema.properties).toBeTruthy();
    });

    it("uses the full OpenAPI doc as rootDocument for $ref resolution", () => {
        const result = normaliseSchema(openApiDoc, "#/components/schemas/User");
        expect(result.rootDocument).toBe(openApiDoc);
    });

    it("throws for missing ref", () => {
        expect(() => {
            normaliseSchema(openApiDoc, "#/components/schemas/NonExistent");
        }).toThrow();
    });

    it("uses first schema when no ref is given", () => {
        const result = normaliseSchema(openApiDoc);
        expect(result.jsonSchema.type).toBe("object");
    });

    it("throws for empty components/schemas", () => {
        const doc = {
            openapi: "3.1.0",
            components: { schemas: {} },
        };
        expect(() => {
            normaliseSchema(doc);
        }).toThrow();
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
        expect(result.jsonSchema.type).toBe("object");
        expect(result.jsonSchema.properties).toBeTruthy();
    });
});
