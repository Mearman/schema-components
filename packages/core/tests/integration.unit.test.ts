/**
 * Integration tests for the adapter → walker pipeline.
 *
 * Tests the full normalisation and walking of schemas from various
 * input formats (Zod, JSON Schema, OpenAPI), verifying the resulting
 * WalkedField trees have correct structure, editability, and constraints.
 *
 * The React rendering layer is tested separately (requires TSX runner).
 */

import { describe, it, expect } from "vitest";
import { z } from "zod";
import { normaliseSchema } from "../src/core/adapter.ts";
import { walk } from "../src/core/walker.ts";
import type { SchemaMeta, WalkedField } from "../src/core/types.ts";
import { assertDefined, getField } from "./helpers.ts";

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
        expect(tree.type).toBe("object");
        expect(tree.fields).toBeTruthy();
        expect(
            "name" in assertDefined(tree.fields, "expected fields")
        ).toBeTruthy();
        expect(
            "age" in assertDefined(tree.fields, "expected fields")
        ).toBeTruthy();
    });

    it("preserves constraints from Zod through JSON Schema", () => {
        const tree = walkSchema(z.string().min(5).max(100));
        expect(tree.type).toBe("string");
        expect(tree.constraints.minLength).toBe(5);
        expect(tree.constraints.maxLength).toBe(100);
    });

    it("preserves format from Zod through JSON Schema", () => {
        const tree = walkSchema(z.email());
        expect(tree.constraints.format).toBe("email");
    });

    it("preserves readOnly from Zod .meta() through JSON Schema", () => {
        const tree = walkSchema(
            z.object({ id: z.string().meta({ readOnly: true }) })
        );
        expect(getField(tree, "id").editability).toBe("presentation");
    });

    it("preserves writeOnly from Zod .meta() through JSON Schema", () => {
        const tree = walkSchema(
            z.object({ password: z.string().meta({ writeOnly: true }) })
        );
        expect(getField(tree, "password").editability).toBe("input");
    });

    it("preserves custom meta through JSON Schema", () => {
        const tree = walkSchema(z.string().meta({ component: "richtext" }));
        expect(tree.meta.component).toBe("richtext");
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
        expect(tree.type).toBe("object");
        expect(getField(tree, "name").isOptional).toBe(false);
        expect(getField(tree, "age").isOptional).toBe(true);
    });

    it("preserves writeOnly from JSON Schema (the key win)", () => {
        const tree = walkSchema({
            type: "object",
            properties: {
                password: { type: "string", writeOnly: true },
            },
        });
        expect(getField(tree, "password").meta.writeOnly).toBe(true);
        expect(getField(tree, "password").editability).toBe("input");
    });

    it("walks nullable from anyOf", () => {
        const tree = walkSchema({
            anyOf: [{ type: "string" }, { type: "null" }],
        });
        expect(tree.type).toBe("string");
        expect(tree.isNullable).toBe(true);
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
        expect(tree.type).toBe("object");
        expect(tree.fields).toBeTruthy();
        expect(
            "name" in assertDefined(tree.fields, "expected fields")
        ).toBeTruthy();
        expect(
            "age" in assertDefined(tree.fields, "expected fields")
        ).toBeTruthy();
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
        expect(tree.type).toBe("object");
        expect(tree.fields).toBeTruthy();
        expect(
            "id" in assertDefined(tree.fields, "expected fields")
        ).toBeTruthy();
        expect(
            "name" in assertDefined(tree.fields, "expected fields")
        ).toBeTruthy();
    });

    it("preserves readOnly from OpenAPI schema through extraction", () => {
        const normalised = normaliseSchema(
            openApiDoc,
            "#/components/schemas/User"
        );
        const tree = walk(normalised.jsonSchema, {
            rootDocument: normalised.rootDocument,
        });
        expect(getField(tree, "id").editability).toBe("presentation");
        expect(getField(tree, "id").meta.readOnly).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Recursive schemas (z.lazy)
// ---------------------------------------------------------------------------

describe("integration — recursive schemas", () => {
    it("walks a recursive Zod schema via z.lazy", () => {
        // z.lazy captures the variable binding — const works because the callback
        // is only invoked after the assignment completes.
        const treeSchema: z.ZodType = z.object({
            label: z.string().meta({ description: "Label" }),
            children: z
                .array(z.lazy(() => treeSchema))
                .optional()
                .meta({ description: "Children" }),
        });

        const tree = walkSchema(treeSchema);
        expect(tree.type).toBe("object");
        expect(getField(tree, "label").type).toBe("string");
        expect(getField(tree, "children").type).toBe("array");

        const element = assertDefined(
            getField(tree, "children").element,
            "expected element"
        );
        expect(element.type).toBe("object");
        expect(element.fields).toBeTruthy();
        expect("label" in assertDefined(element.fields, "fields")).toBe(true);
    });

    it("propagates readOnly through recursive elements", () => {
        const treeSchema: z.ZodType = z.object({
            label: z.string(),
            children: z.array(z.lazy(() => treeSchema)).optional(),
        });

        const tree = walkSchema(treeSchema, {
            componentMeta: { readOnly: true },
        });
        expect(tree.editability).toBe("presentation");
        expect(getField(tree, "label").editability).toBe("presentation");
        expect(getField(tree, "children").editability).toBe("presentation");

        const element = assertDefined(
            getField(tree, "children").element,
            "expected element"
        );
        expect(element.editability).toBe("presentation");
        expect(assertDefined(element.fields, "fields").label?.editability).toBe(
            "presentation"
        );
    });

    it("creates a graph cycle for recursive element", () => {
        const treeSchema: z.ZodType = z.object({
            label: z.string(),
            children: z.array(z.lazy(() => treeSchema)).optional(),
        });

        const tree = walkSchema(treeSchema);
        const element = assertDefined(
            getField(tree, "children").element,
            "expected element"
        );
        // The element's own children.element should be the same object
        // reference (graph cycle) — not a different object or unknown
        const nestedElement = assertDefined(
            getField(element, "children").element,
            "expected nested element"
        );
        expect(nestedElement).toBe(element);
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
        expect(getField(tree, "name").editability).toBe("presentation");
        expect(getField(tree, "age").editability).toBe("presentation");
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
        expect(getField(tree, "name").editability).toBe("presentation");
        expect(getField(tree, "address").editability).toBe("editable");
        expect(getField(tree, "address", "city").editability).toBe(
            "presentation"
        );
        expect(getField(tree, "address", "postcode").editability).toBe(
            "editable"
        );
    });
});
