/**
 * HTML renderer tests.
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { z } from "zod";
import { renderToHtml } from "../src/html/renderToHtml.ts";

// ---------------------------------------------------------------------------
// Basic type rendering — read-only
// ---------------------------------------------------------------------------

describe("renderToHtml — string", () => {
    it("renders a string value in read-only", () => {
        const schema = z.object({ name: z.string() });
        const html = renderToHtml(schema, {
            value: { name: "Ada" },
            readOnly: true,
        });
        assert.match(html, /Ada/);
        assert.match(html, /sc-value/);
    });

    it("renders an empty string as dash", () => {
        const schema = z.object({ name: z.string() });
        const html = renderToHtml(schema, {
            value: { name: "" },
            readOnly: true,
        });
        assert.match(html, /sc-value--empty/);
        assert.match(html, /—/);
    });

    it("renders email as mailto link in read-only", () => {
        const schema = z.object({
            email: z.email(),
        });
        const html = renderToHtml(schema, {
            value: { email: "ada@example.com" },
            readOnly: true,
        });
        assert.match(html, /href="mailto:ada@example.com"/);
    });

    it("renders URL as anchor in read-only", () => {
        const schema = z.object({
            url: z.string().meta({ format: "uri" }),
        });
        const html = renderToHtml(schema, {
            value: { url: "https://example.com" },
            readOnly: true,
        });
        assert.match(html, /href="https:\/\/example.com"/);
    });
});

describe("renderToHtml — number", () => {
    it("renders a number value", () => {
        const schema = z.object({ age: z.number() });
        const html = renderToHtml(schema, { value: { age: 42 } });
        assert.match(html, /42/);
    });

    it("renders null number as dash", () => {
        const schema = z.object({ age: z.number() });
        const html = renderToHtml(schema, {
            value: { age: undefined },
            readOnly: true,
        });
        assert.match(html, /sc-value--empty/);
    });
});

describe("renderToHtml — boolean", () => {
    it("renders true as Yes", () => {
        const schema = z.object({ active: z.boolean() });
        const html = renderToHtml(schema, {
            value: { active: true },
            readOnly: true,
        });
        assert.match(html, /Yes/);
    });

    it("renders false as No", () => {
        const schema = z.object({ active: z.boolean() });
        const html = renderToHtml(schema, {
            value: { active: false },
            readOnly: true,
        });
        assert.match(html, /No/);
    });
});

describe("renderToHtml — enum", () => {
    it("renders enum value", () => {
        const schema = z.object({
            role: z.enum(["admin", "editor", "viewer"]),
        });
        const html = renderToHtml(schema, {
            value: { role: "admin" },
            readOnly: true,
        });
        assert.match(html, /admin/);
    });
});

// ---------------------------------------------------------------------------
// Editable rendering
// ---------------------------------------------------------------------------

describe("renderToHtml — editable inputs", () => {
    it("renders string as text input", () => {
        const schema = z.object({ name: z.string() });
        const html = renderToHtml(schema, { value: { name: "Ada" } });
        assert.match(html, /type="text"/);
        assert.match(html, /value="Ada"/);
    });

    it("renders number as number input", () => {
        const schema = z.object({ age: z.number() });
        const html = renderToHtml(schema, { value: { age: 42 } });
        assert.match(html, /type="number"/);
    });

    it("renders boolean as checkbox", () => {
        const schema = z.object({ active: z.boolean() });
        const html = renderToHtml(schema, { value: { active: true } });
        assert.match(html, /type="checkbox"/);
        assert.match(html, /checked/);
    });

    it("renders enum as select", () => {
        const schema = z.object({ role: z.enum(["admin", "editor"]) });
        const html = renderToHtml(schema, { value: { role: "admin" } });
        assert.match(html, /<select/);
        assert.match(html, /<option.*admin/);
    });
});

// ---------------------------------------------------------------------------
// Object and array
// ---------------------------------------------------------------------------

describe("renderToHtml — object", () => {
    it("renders read-only object as dl", () => {
        const schema = z.object({
            name: z.string().meta({ description: "Name" }),
            email: z.string().meta({ description: "Email" }),
        });
        const html = renderToHtml(schema, {
            value: { name: "Ada", email: "ada@example.com" },
            readOnly: true,
        });
        assert.match(html, /<dl/);
        assert.match(html, /<dt/);
        assert.match(html, /<dd/);
        assert.match(html, /Name/);
        assert.match(html, /Ada/);
    });

    it("renders editable object as fieldset", () => {
        const schema = z.object({
            name: z.string().meta({ description: "Name" }),
        });
        const html = renderToHtml(schema, { value: { name: "Ada" } });
        assert.match(html, /<fieldset/);
        assert.match(html, /<label/);
        assert.match(html, /type="text"/);
    });

    it("renders nested objects", () => {
        const schema = z.object({
            address: z.object({
                city: z.string().meta({ description: "City" }),
            }),
        });
        const html = renderToHtml(schema, {
            value: { address: { city: "London" } },
            readOnly: true,
        });
        assert.match(html, /City/);
        assert.match(html, /London/);
    });
});

describe("renderToHtml — array", () => {
    it("renders read-only array as ul", () => {
        const schema = z.object({
            tags: z.array(z.string()),
        });
        const html = renderToHtml(schema, {
            value: { tags: ["a", "b", "c"] },
            readOnly: true,
        });
        assert.match(html, /<ul/);
        assert.match(html, /<li/);
    });

    it("renders empty array", () => {
        const schema = z.object({
            tags: z.array(z.string()),
        });
        const html = renderToHtml(schema, {
            value: { tags: [] },
            readOnly: true,
        });
        assert.match(html, /<ul/);
    });
});

// ---------------------------------------------------------------------------
// HTML escaping
// ---------------------------------------------------------------------------

describe("renderToHtml — escaping", () => {
    it("escapes HTML in string values", () => {
        const schema = z.object({ bio: z.string() });
        const html = renderToHtml(schema, {
            value: { bio: "<script>alert('xss')</script>" },
            readOnly: true,
        });
        assert.match(html, /&lt;script&gt;/);
        assert.doesNotMatch(html, /<script>/);
    });

    it("escapes HTML in input values", () => {
        const schema = z.object({ bio: z.string() });
        const html = renderToHtml(schema, {
            value: { bio: 'a"b' },
        });
        assert.match(html, /&quot;/);
        assert.doesNotMatch(html, /a"b/);
    });
});

// ---------------------------------------------------------------------------
// JSON Schema input
// ---------------------------------------------------------------------------

describe("renderToHtml — JSON Schema", () => {
    it("renders from raw JSON Schema", () => {
        const jsonSchema = {
            type: "object" as const,
            properties: {
                name: { type: "string" as const },
                age: { type: "number" as const },
            },
            required: ["name"],
        };
        const html = renderToHtml(jsonSchema, {
            value: { name: "Ada", age: 36 },
            readOnly: true,
        });
        assert.match(html, /Ada/);
        assert.match(html, /36/);
    });
});

// ---------------------------------------------------------------------------
// Custom resolver
// ---------------------------------------------------------------------------

describe("renderToHtml — custom resolver", () => {
    it("uses custom string renderer", () => {
        const schema = z.object({ name: z.string() });
        const html = renderToHtml(schema, {
            value: { name: "Ada" },
            readOnly: true,
            resolver: {
                string: (props) =>
                    `<mark>${typeof props.value === "string" ? props.value : ""}</mark>`,
            },
        });
        assert.match(html, /<mark>Ada<\/mark>/);
    });

    it("falls back to default for unspecified types", () => {
        const schema = z.object({
            name: z.string(),
            age: z.number(),
        });
        const html = renderToHtml(schema, {
            value: { name: "Ada", age: 36 },
            readOnly: true,
            resolver: {
                string: (props) =>
                    `<b>${typeof props.value === "string" ? props.value : ""}</b>`,
            },
        });
        assert.match(html, /<b>Ada<\/b>/);
        // Number should still use default renderer
        assert.match(html, /36/);
    });
});

// ---------------------------------------------------------------------------
// writeOnly
// ---------------------------------------------------------------------------

describe("renderToHtml — writeOnly", () => {
    it("renders empty input when writeOnly", () => {
        const schema = z.object({ name: z.string() });
        const html = renderToHtml(schema, {
            value: { name: "Ada" },
            writeOnly: true,
        });
        assert.match(html, /type="text"/);
        assert.doesNotMatch(html, /value="Ada"/);
    });

    it("renders empty select when writeOnly enum", () => {
        const schema = z.object({ role: z.enum(["admin", "editor"]) });
        const html = renderToHtml(schema, {
            value: { role: "admin" },
            writeOnly: true,
        });
        assert.match(html, /<select/);
        // Should not have "admin" selected
        assert.doesNotMatch(html, /selected/);
    });
});
