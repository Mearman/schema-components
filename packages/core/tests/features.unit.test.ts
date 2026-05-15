import {
    fieldsOf,
    optionsOf,
    literalValuesOf,
    stringConstraintsOf,
    fileConstraintsOf,
    discriminatorOf,
} from "./helpers.js";
/**
 * Tests for discriminated union rendering, date/time inputs, and schema defaults.
 */
import { describe, it, expect } from "vitest";
import { assertDefined } from "./helpers.ts";
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

        expect(tree.type).toBe("discriminatedUnion");
        expect(discriminatorOf(tree)).toBe("type");
        expect(optionsOf(tree) !== undefined).toBeTruthy();
        expect(assertDefined(optionsOf(tree), "expected options").length).toBe(
            2
        );

        // First option should have a literal field for the discriminator
        const emailOption = assertDefined(
            assertDefined(optionsOf(tree), "expected options")[0],
            "email option"
        );
        expect(emailOption.type).toBe("object");
        const typeField = assertDefined(
            assertDefined(fieldsOf(emailOption), "email fields").type,
            "type field"
        );
        expect(typeField.type).toBe("literal");
        expect(literalValuesOf(typeField)).toStrictEqual(["email"]);
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

        expect(tree.type).toBe("discriminatedUnion");
        expect(discriminatorOf(tree)).toBe("kind");

        const circleOption = optionsOf(tree)?.[0];
        const rectOption = optionsOf(tree)?.[1];
        if (circleOption !== undefined) {
            const circleFields = fieldsOf(circleOption);
            const kindField = circleFields?.kind;
            const kindLiteral =
                kindField?.type === "literal"
                    ? kindField.literalValues[0]
                    : undefined;
            expect(kindLiteral).toBe("circle");
        }
        if (rectOption !== undefined) {
            const rectFields = fieldsOf(rectOption);
            const kindField = rectFields?.kind;
            const kindLiteral =
                kindField?.type === "literal"
                    ? kindField.literalValues[0]
                    : undefined;
            expect(kindLiteral).toBe("rectangle");
        }
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
        expect(html.includes("sc-discriminated-union")).toBeTruthy();
        expect(html.includes("sc-tabs")).toBeTruthy();
        expect(html.includes("sc-tab")).toBeTruthy();
        expect(html.includes("email")).toBeTruthy();
        expect(html.includes("phone")).toBeTruthy();
    });

    it("renders active tab based on discriminator value", () => {
        const html = renderToHtml(schema, {
            value: { type: "phone", number: "+1234567890" },
        });
        expect(html.includes("sc-tab--active")).toBeTruthy();
        expect(html.includes("+1234567890")).toBeTruthy();
    });

    it("renders read-only discriminated union without tabs", () => {
        const html = renderToHtml(schema, {
            value: { type: "email", address: "user@example.com" },
            readOnly: true,
        });
        expect(!html.includes("sc-tabs")).toBeTruthy();
        expect(html.includes("user@example.com")).toBeTruthy();
    });

    it("renders discriminated union via streaming with tabs", () => {
        const chunks = [
            ...renderToHtmlChunks(schema, {
                value: { type: "email", address: "user@example.com" },
            }),
        ];
        const html = chunks.join("");
        expect(html.includes("sc-discriminated-union")).toBeTruthy();
        expect(html.includes("sc-tabs")).toBeTruthy();
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
        expect(tree.type).toBe("string");
        expect(stringConstraintsOf(tree)?.format).toBe("date");
    });

    it("extracts time format constraint", () => {
        const tree = walk({
            type: "string",
            format: "time",
        });
        expect(tree.type).toBe("string");
        expect(stringConstraintsOf(tree)?.format).toBe("time");
    });

    it("extracts date-time format constraint", () => {
        const tree = walk({
            type: "string",
            format: "date-time",
        });
        expect(tree.type).toBe("string");
        expect(stringConstraintsOf(tree)?.format).toBe("date-time");
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
        expect(html.includes('type="date"')).toBeTruthy();
        expect(html.includes("2024-01-15")).toBeTruthy();
    });

    it("renders time input type", () => {
        const html = renderToHtml(
            { type: "string", format: "time" },
            { value: "14:30" }
        );
        expect(html.includes('type="time"')).toBeTruthy();
        expect(html.includes("14:30")).toBeTruthy();
    });

    it("renders datetime-local input type", () => {
        const html = renderToHtml(
            { type: "string", format: "date-time" },
            { value: "2024-01-15T14:30:00Z" }
        );
        expect(html.includes('type="datetime-local"')).toBeTruthy();
        expect(html.includes("2024-01-15T14:30:00Z")).toBeTruthy();
    });

    it("renders date value read-only without input element", () => {
        const html = renderToHtml(
            { type: "string", format: "date" },
            { value: "2024-01-15", readOnly: true }
        );
        expect(!html.includes("input")).toBeTruthy();
        expect(html.includes("sc-value")).toBeTruthy();
    });

    it("renders datetime-local via streaming", () => {
        const chunks = [
            ...renderToHtmlChunks(
                { type: "string", format: "date-time" },
                { value: "2024-06-01T12:00:00Z" }
            ),
        ];
        const html = chunks.join("");
        expect(html.includes('type="datetime-local"')).toBeTruthy();
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
        expect(tree.defaultValue).toBe("hello");
    });

    it("extracts numeric default", () => {
        const tree = walk({
            type: "number",
            default: 42,
        });
        expect(tree.defaultValue).toBe(42);
    });

    it("extracts boolean default", () => {
        const tree = walk({
            type: "boolean",
            default: true,
        });
        expect(tree.defaultValue).toBe(true);
    });

    it("extracts default from object property", () => {
        const tree = walk({
            type: "object",
            properties: {
                name: { type: "string", default: "Unnamed" },
                count: { type: "number", default: 0 },
            },
        });
        const fields = assertDefined(fieldsOf(tree), "expected fields");
        expect("name" in fields).toBeTruthy();
        expect("count" in fields).toBeTruthy();
        expect(assertDefined(fields.name, "name").defaultValue).toBe("Unnamed");
        expect(assertDefined(fields.count, "count").defaultValue).toBe(0);
    });

    it("has no default when not specified", () => {
        const tree = walk({ type: "string" });
        expect(tree.defaultValue).toBe(undefined);
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
        expect(html.includes("fallback")).toBeTruthy();
    });

    it("uses default value for number when value is undefined", () => {
        const html = renderToHtml({
            type: "number",
            default: 99,
        });
        expect(html.includes("99")).toBeTruthy();
    });

    it("prefers explicit value over default", () => {
        const html = renderToHtml(
            { type: "string", default: "fallback" },
            { value: "explicit" }
        );
        expect(html.includes("explicit")).toBeTruthy();
        expect(!html.includes("fallback")).toBeTruthy();
    });

    it("uses default value via streaming when value is undefined", () => {
        const chunks = [
            ...renderToHtmlChunks({
                type: "string",
                default: "stream-default",
            }),
        ];
        const html = chunks.join("");
        expect(html.includes("stream-default")).toBeTruthy();
    });

    it("uses object property defaults when value is undefined", () => {
        const html = renderToHtml({
            type: "object",
            properties: {
                name: { type: "string", default: "World" },
            },
        });
        expect(html.includes("World")).toBeTruthy();
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

        const fields = assertDefined(fieldsOf(tree), "expected fields");
        expect("name" in fields).toBeTruthy();
        expect("active" in fields).toBeTruthy();
        expect(assertDefined(fields.name, "name").defaultValue).toBe(
            "Anonymous"
        );
        expect(assertDefined(fields.active, "active").defaultValue).toBe(true);
    });

    it("uses default value from Zod schema in HTML output", () => {
        const schema = z.object({
            greeting: z.string().default("Hello"),
        });

        const html = renderToHtml(schema);
        expect(html.includes("Hello")).toBeTruthy();
    });
});

// ---------------------------------------------------------------------------
// File upload — walker
// ---------------------------------------------------------------------------

describe("file upload — walker", () => {
    it("detects format: binary as file type", () => {
        const tree = walk({
            type: "string",
            format: "binary",
        });
        expect(tree.type).toBe("file");
    });

    it("extracts contentMediaType as mimeTypes constraint", () => {
        const tree = walk({
            type: "string",
            format: "binary",
            contentMediaType: "image/png",
        });
        expect(tree.type).toBe("file");
        expect(fileConstraintsOf(tree)?.mimeTypes).toStrictEqual(["image/png"]);
    });

    it("has no mimeTypes when contentMediaType is absent", () => {
        const tree = walk({
            type: "string",
            format: "binary",
        });
        expect(tree.type).toBe("file");
        expect(fileConstraintsOf(tree)?.mimeTypes).toBe(undefined);
    });
});

// ---------------------------------------------------------------------------
// File upload — HTML rendering
// ---------------------------------------------------------------------------

describe("file upload — HTML", () => {
    it("renders file input type", () => {
        const html = renderToHtml({ type: "string", format: "binary" }, {});
        expect(html.includes('type="file"')).toBeTruthy();
    });

    it("sets accept attribute from mimeTypes", () => {
        const html = renderToHtml(
            {
                type: "string",
                format: "binary",
                contentMediaType: "image/png",
            },
            {}
        );
        expect(html.includes('accept="image/png"')).toBeTruthy();
    });

    it("renders read-only file field without input", () => {
        const html = renderToHtml(
            { type: "string", format: "binary" },
            { readOnly: true }
        );
        expect(!html.includes('type="file"')).toBeTruthy();
        expect(html.includes("File field")).toBeTruthy();
        expect(html.includes('aria-readonly="true"')).toBeTruthy();
    });

    it("adds aria-required for required file field", () => {
        const html = renderToHtml(
            {
                type: "object",
                properties: {
                    avatar: {
                        type: "string",
                        format: "binary",
                    },
                },
                required: ["avatar"],
            },
            { value: { avatar: undefined } }
        );
        expect(html.includes('aria-required="true"')).toBeTruthy();
    });

    it("renders file input via streaming", () => {
        const chunks = [
            ...renderToHtmlChunks({ type: "string", format: "binary" }, {}),
        ];
        const html = chunks.join("");
        expect(html.includes('type="file"')).toBeTruthy();
    });

    it("renders file input from Zod schema", () => {
        const schema = z.object({
            avatar: z.string().meta({ format: "binary" }),
        });
        const html = renderToHtml(schema, { value: { avatar: undefined } });
        expect(html.includes('type="file"')).toBeTruthy();
    });
});
