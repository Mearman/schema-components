/**
 * Integration tests for the adapter → walker pipeline.
 *
 * Tests the full normalisation and walking of schemas from various
 * input formats (Zod, JSON Schema, OpenAPI), verifying the resulting
 * WalkedField trees have correct structure, editability, and constraints.
 *
 * The React rendering layer is tested separately (requires TSX runner).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { normaliseSchema } from "../src/core/adapter.ts";
import { walk } from "../src/core/walker.ts";
import type { SchemaMeta, WalkedField } from "../src/core/types.ts";

// ---------------------------------------------------------------------------
// Helper: normalise + walk a schema
// ---------------------------------------------------------------------------

function walkSchema(
    schema: unknown,
    options?: {
        componentMeta?: SchemaMeta;
        rootMeta?: SchemaMeta;
        fieldOverrides?: Record<string, unknown>;
    }
): WalkedField {
    const normalised = normaliseSchema(schema);
    return walk(normalised.jsonSchema, {
        rootDocument: normalised.rootDocument,
        componentMeta: options?.componentMeta,
        rootMeta: options?.rootMeta,
        fieldOverrides: options?.fieldOverrides,
    });
}

function getField(tree: WalkedField, ...keys: string[]): WalkedField {
    let current: WalkedField = tree;
    for (const key of keys) {
        const fields = current.fields;
        assert.ok(fields, `Expected fields at ${keys.join(".")}`);
        const child = fields[key];
        assert.ok(child, `Expected field "${key}" at ${keys.join(".")}`);
        current = child;
    }
    return current;
}

// ---------------------------------------------------------------------------
// Zod schema → JSON Schema → walker pipeline
// ---------------------------------------------------------------------------

describe("integration — Zod schema", () => {
    it("walks a Zod object through toJSONSchema", () => {
        const tree = walkSchema(
            z.object({
                name: z.string(),
                age: z.number(),
            })
        );
        assert.equal(tree.type, "object");
        assert.ok(tree.fields);
        assert.ok("name" in tree.fields);
        assert.ok("age" in tree.fields);
    });

    it("preserves constraints from Zod through JSON Schema", () => {
        const tree = walkSchema(z.string().min(5).max(100));
        assert.equal(tree.type, "string");
        assert.equal(tree.constraints.minLength, 5);
        assert.equal(tree.constraints.maxLength, 100);
    });

    it("preserves format from Zod through JSON Schema", () => {
        const tree = walkSchema(z.email());
        assert.equal(tree.constraints.format, "email");
    });

    it("preserves readOnly from Zod .meta() through JSON Schema", () => {
        const tree = walkSchema(
            z.object({ id: z.string().meta({ readOnly: true }) })
        );
        assert.equal(getField(tree, "id").editability, "presentation");
    });

    it("preserves writeOnly from Zod .meta() through JSON Schema", () => {
        const tree = walkSchema(
            z.object({ password: z.string().meta({ writeOnly: true }) })
        );
        assert.equal(getField(tree, "password").editability, "input");
    });

    it("preserves custom meta through JSON Schema", () => {
        const tree = walkSchema(z.string().meta({ component: "richtext" }));
        assert.equal(tree.meta.component, "richtext");
    });
});

// ---------------------------------------------------------------------------
// JSON Schema passthrough pipeline
// ---------------------------------------------------------------------------

describe("integration — JSON Schema", () => {
    it("walks a JSON Schema object directly", () => {
        const tree = walkSchema({
            type: "object",
            properties: {
                name: { type: "string" },
                age: { type: "number" },
            },
            required: ["name"],
        });
        assert.equal(tree.type, "object");
        assert.equal(getField(tree, "name").isOptional, false);
        assert.equal(getField(tree, "age").isOptional, true);
    });

    it("preserves writeOnly from JSON Schema (the key win)", () => {
        const tree = walkSchema({
            type: "object",
            properties: {
                password: { type: "string", writeOnly: true },
            },
        });
        assert.equal(getField(tree, "password").meta.writeOnly, true);
        assert.equal(getField(tree, "password").editability, "input");
    });

    it("walks nullable from anyOf", () => {
        const tree = walkSchema({
            anyOf: [{ type: "string" }, { type: "null" }],
        });
        assert.equal(tree.type, "string");
        assert.equal(tree.isNullable, true);
    });

    it("walks allOf merged objects", () => {
        const tree = walkSchema({
            allOf: [
                {
                    type: "object",
                    properties: { name: { type: "string" } },
                    required: ["name"],
                },
                {
                    type: "object",
                    properties: { age: { type: "number" } },
                },
            ],
        });
        assert.equal(tree.type, "object");
        assert.ok(tree.fields);
        assert.ok("name" in tree.fields);
        assert.ok("age" in tree.fields);
    });
});

// ---------------------------------------------------------------------------
// OpenAPI document pipeline
// ---------------------------------------------------------------------------

describe("integration — OpenAPI", () => {
    const openApiDoc = {
        openapi: "3.1.0",
        components: {
            schemas: {
                User: {
                    type: "object" as const,
                    properties: {
                        id: { type: "string" as const, readOnly: true },
                        name: { type: "string" as const },
                    },
                    required: ["id", "name"],
                },
            },
        },
    };

    it("walks a schema extracted from an OpenAPI document", () => {
        const normalised = normaliseSchema(
            openApiDoc,
            "#/components/schemas/User"
        );
        const tree = walk(normalised.jsonSchema, {
            rootDocument: normalised.rootDocument,
        });
        assert.equal(tree.type, "object");
        assert.ok(tree.fields);
        assert.ok("id" in tree.fields);
        assert.ok("name" in tree.fields);
    });

    it("preserves readOnly from OpenAPI schema through extraction", () => {
        const normalised = normaliseSchema(
            openApiDoc,
            "#/components/schemas/User"
        );
        const tree = walk(normalised.jsonSchema, {
            rootDocument: normalised.rootDocument,
        });
        assert.equal(getField(tree, "id").editability, "presentation");
        assert.equal(getField(tree, "id").meta.readOnly, true);
    });
});

// ---------------------------------------------------------------------------
// Component meta propagation
// ---------------------------------------------------------------------------

describe("integration — component meta", () => {
    it("component readOnly overrides all fields", () => {
        const tree = walkSchema(
            z.object({ name: z.string(), age: z.number() }),
            { componentMeta: { readOnly: true } }
        );
        assert.equal(getField(tree, "name").editability, "presentation");
        assert.equal(getField(tree, "age").editability, "presentation");
    });

    it("component meta + field overrides interact correctly", () => {
        const tree = walkSchema(
            z.object({
                name: z.string(),
                address: z.object({
                    city: z.string(),
                    postcode: z.string(),
                }),
            }),
            {
                componentMeta: { readOnly: true },
                fieldOverrides: {
                    address: { readOnly: false, city: { readOnly: true } },
                },
            }
        );
        assert.equal(getField(tree, "name").editability, "presentation");
        assert.equal(getField(tree, "address").editability, "editable");
        assert.equal(
            getField(tree, "address", "city").editability,
            "presentation"
        );
        assert.equal(
            getField(tree, "address", "postcode").editability,
            "editable"
        );
    });
});
