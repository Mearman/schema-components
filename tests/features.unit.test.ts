/**
 * Tests for discriminated union rendering, date/time inputs, and schema defaults.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { walk } from "../src/core/walker.ts";
import { renderToHtml } from "../src/html/renderToHtml.ts";
import { renderToHtmlChunks } from "../src/html/renderToHtmlStream.ts";
import { normaliseSchema } from "../src/core/adapter.ts";

// ---------------------------------------------------------------------------
// Discriminated union — walker
// ---------------------------------------------------------------------------

describe("discriminated union — walker", () => {
    it("detects discriminated union from oneOf + const", () => {
        const tree = walk({
            oneOf: [
                {
                    type: "object",
                    properties: {
                        type: { const: "email" },
                        address: { type: "string" },
                    },
                    required: ["type", "address"],
                },
                {
                    type: "object",
                    properties: {
                        type: { const: "phone" },
                        number: { type: "string" },
                    },
                    required: ["type", "number"],
                },
            ],
        });

        assert.equal(tree.type, "discriminatedUnion");
        assert.equal(tree.discriminator, "type");
        assert.equal(tree.options?.length, 2);

        // First option should have a literal field for the discriminator
        const emailOption = tree.options[0];
        assert.equal(emailOption.type, "object");
        const typeField = emailOption.fields.type;
        assert.equal(typeField.type, "literal");
        assert.deepEqual(typeField.literalValues, ["email"]);
    });

    it("produces correct option labels from const values", () => {
        const tree = walk({
            oneOf: [
                {
                    type: "object",
                    properties: {
                        kind: { const: "circle" },
                        radius: { type: "number" },
                    },
                    required: ["kind", "radius"],
                },
                {
                    type: "object",
                    properties: {
                        kind: { const: "rectangle" },
                        width: { type: "number" },
                        height: { type: "number" },
                    },
                    required: ["kind", "width", "height"],
                },
            ],
        });

        assert.equal(tree.type, "discriminatedUnion");
        assert.equal(tree.discriminator, "kind");

        const circleOption = tree.options?.[0];
        const rectOption = tree.options?.[1];
        assert.equal(circleOption?.fields?.kind?.literalValues?.[0], "circle");
        assert.equal(rectOption?.fields?.kind?.literalValues?.[0], "rectangle");
    });
});

// ---------------------------------------------------------------------------
// Discriminated union — HTML rendering
// ---------------------------------------------------------------------------

describe("discriminated union — HTML", () => {
    const schema = {
        oneOf: [
            {
                type: "object",
                properties: {
                    type: { const: "email" },
                    address: { type: "string", description: "Email address" },
                },
                required: ["type", "address"],
            },
            {
                type: "object",
                properties: {
                    type: { const: "phone" },
                    number: { type: "string", description: "Phone number" },
                },
                required: ["type", "number"],
            },
        ],
    };

    it("renders discriminated union HTML with tabs", () => {
        const html = renderToHtml(schema, {
            value: { type: "email", address: "user@example.com" },
        });
        assert.ok(html.includes("sc-discriminated-union"));
        assert.ok(html.includes("sc-tabs"));
        assert.ok(html.includes("sc-tab"));
        assert.ok(html.includes("email"));
        assert.ok(html.includes("phone"));
    });

    it("renders active tab based on discriminator value", () => {
        const html = renderToHtml(schema, {
            value: { type: "phone", number: "+1234567890" },
        });
        assert.ok(html.includes("sc-tab--active"));
        assert.ok(html.includes("+1234567890"));
    });

    it("renders read-only discriminated union without tabs", () => {
        const html = renderToHtml(schema, {
            value: { type: "email", address: "user@example.com" },
            readOnly: true,
        });
        assert.ok(!html.includes("sc-tabs"));
        assert.ok(html.includes("user@example.com"));
    });

    it("renders discriminated union via streaming with tabs", () => {
        const chunks = [
            ...renderToHtmlChunks(schema, {
                value: { type: "email", address: "user@example.com" },
            }),
        ];
        const html = chunks.join("");
        assert.ok(html.includes("sc-discriminated-union"));
        assert.ok(html.includes("sc-tabs"));
    });
});

// ---------------------------------------------------------------------------
// Date/time inputs — walker
// ---------------------------------------------------------------------------

describe("date/time — walker", () => {
    it("extracts date format constraint", () => {
        const tree = walk({
            type: "string",
            format: "date",
        });
        assert.equal(tree.type, "string");
        assert.equal(tree.constraints.format, "date");
    });

    it("extracts time format constraint", () => {
        const tree = walk({
            type: "string",
            format: "time",
        });
        assert.equal(tree.type, "string");
        assert.equal(tree.constraints.format, "time");
    });

    it("extracts date-time format constraint", () => {
        const tree = walk({
            type: "string",
            format: "date-time",
        });
        assert.equal(tree.type, "string");
        assert.equal(tree.constraints.format, "date-time");
    });
});

// ---------------------------------------------------------------------------
// Date/time inputs — HTML rendering
// ---------------------------------------------------------------------------

describe("date/time — HTML", () => {
    it("renders date input type", () => {
        const html = renderToHtml(
            { type: "string", format: "date" },
            { value: "2024-01-15" }
        );
        assert.ok(html.includes('type="date"'));
        assert.ok(html.includes("2024-01-15"));
    });

    it("renders time input type", () => {
        const html = renderToHtml(
            { type: "string", format: "time" },
            { value: "14:30" }
        );
        assert.ok(html.includes('type="time"'));
        assert.ok(html.includes("14:30"));
    });

    it("renders datetime-local input type", () => {
        const html = renderToHtml(
            { type: "string", format: "date-time" },
            { value: "2024-01-15T14:30:00Z" }
        );
        assert.ok(html.includes('type="datetime-local"'));
        assert.ok(html.includes("2024-01-15T14:30:00Z"));
    });

    it("renders date value read-only without input element", () => {
        const html = renderToHtml(
            { type: "string", format: "date" },
            { value: "2024-01-15", readOnly: true }
        );
        assert.ok(!html.includes("input"));
        assert.ok(html.includes("sc-value"));
    });

    it("renders datetime-local via streaming", () => {
        const chunks = [
            ...renderToHtmlChunks(
                { type: "string", format: "date-time" },
                { value: "2024-06-01T12:00:00Z" }
            ),
        ];
        const html = chunks.join("");
        assert.ok(html.includes('type="datetime-local"'));
    });
});

// ---------------------------------------------------------------------------
// Schema defaults — walker
// ---------------------------------------------------------------------------

describe("schema defaults — walker", () => {
    it("extracts default value from JSON Schema", () => {
        const tree = walk({
            type: "string",
            default: "hello",
        });
        assert.equal(tree.defaultValue, "hello");
    });

    it("extracts numeric default", () => {
        const tree = walk({
            type: "number",
            default: 42,
        });
        assert.equal(tree.defaultValue, 42);
    });

    it("extracts boolean default", () => {
        const tree = walk({
            type: "boolean",
            default: true,
        });
        assert.equal(tree.defaultValue, true);
    });

    it("extracts default from object property", () => {
        const tree = walk({
            type: "object",
            properties: {
                name: { type: "string", default: "Unnamed" },
                count: { type: "number", default: 0 },
            },
        });
        assert.equal(tree.fields.name.defaultValue, "Unnamed");
        assert.equal(tree.fields.count.defaultValue, 0);
    });

    it("has no default when not specified", () => {
        const tree = walk({ type: "string" });
        assert.equal(tree.defaultValue, undefined);
    });
});

// ---------------------------------------------------------------------------
// Schema defaults — HTML rendering
// ---------------------------------------------------------------------------

describe("schema defaults — HTML", () => {
    it("uses default value when value is undefined", () => {
        const html = renderToHtml({
            type: "string",
            default: "fallback",
        });
        assert.ok(html.includes("fallback"));
    });

    it("uses default value for number when value is undefined", () => {
        const html = renderToHtml({
            type: "number",
            default: 99,
        });
        assert.ok(html.includes("99"));
    });

    it("prefers explicit value over default", () => {
        const html = renderToHtml(
            { type: "string", default: "fallback" },
            { value: "explicit" }
        );
        assert.ok(html.includes("explicit"));
        assert.ok(!html.includes("fallback"));
    });

    it("uses default value via streaming when value is undefined", () => {
        const chunks = [
            ...renderToHtmlChunks({
                type: "string",
                default: "stream-default",
            }),
        ];
        const html = chunks.join("");
        assert.ok(html.includes("stream-default"));
    });

    it("uses object property defaults when value is undefined", () => {
        const html = renderToHtml({
            type: "object",
            properties: {
                name: { type: "string", default: "World" },
            },
        });
        assert.ok(html.includes("World"));
    });
});

// ---------------------------------------------------------------------------
// Schema defaults — Zod integration
// ---------------------------------------------------------------------------

describe("schema defaults — Zod", () => {
    it("extracts default from Zod schema via normalise + walk", () => {
        const schema = z.object({
            name: z.string().default("Anonymous"),
            active: z.boolean().default(true),
        });

        const normalised = normaliseSchema(schema);
        const tree = walk(normalised.jsonSchema, {
            rootDocument: normalised.rootDocument,
        });

        assert.equal(tree.fields.name.defaultValue, "Anonymous");
        assert.equal(tree.fields.active.defaultValue, true);
    });

    it("uses default value from Zod schema in HTML output", () => {
        const schema = z.object({
            greeting: z.string().default("Hello"),
        });

        const html = renderToHtml(schema);
        assert.ok(html.includes("Hello"));
    });
});
