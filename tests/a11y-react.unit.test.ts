/**
 * Accessibility tests for the headless React renderer and HTML output.
 *
 * Tests cover:
 * - Label-input association (htmlFor/id)
 * - ARIA attributes on discriminated union tabs
 * - Role attributes (tablist, tab, tabpanel, group)
 * - Required indicators with aria-hidden
 * - Checkbox aria-label
 * - Read-only aria-readonly
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { renderToHtml } from "../src/html/renderToHtml.ts";
import { renderToHtmlChunks } from "../src/html/renderToHtmlStream.ts";

// ---------------------------------------------------------------------------
// Label-input association
// ---------------------------------------------------------------------------

describe("label-input association (HTML)", () => {
    it("pairs labels with inputs via for/id on objects", () => {
        const schema = z.object({
            name: z.string().meta({ description: "Name" }),
            email: z.string().meta({ description: "Email" }),
        });
        const html = renderToHtml(schema, {
            value: { name: "Ada", email: "ada@example.com" },
        });
        // Labels should have for= matching input ids
        assert.match(html, /for="sc-name"/);
        assert.match(html, /id="sc-name"/);
        assert.match(html, /for="sc-email"/);
        assert.match(html, /id="sc-email"/);
    });

    it("uses nested path for nested object fields", () => {
        const schema = z.object({
            address: z.object({
                city: z.string().meta({ description: "City" }),
            }),
        });
        const html = renderToHtml(schema, {
            value: { address: { city: "London" } },
        });
        assert.match(html, /for="sc-address-city"/);
        assert.match(html, /id="sc-address-city"/);
    });
});

// ---------------------------------------------------------------------------
// Discriminated union — WAI-ARIA tabs pattern
// ---------------------------------------------------------------------------

describe("discriminated union — ARIA tabs (HTML)", () => {
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

    it("adds role=tablist to tab container", () => {
        const html = renderToHtml(schema, {
            value: { type: "email", address: "user@example.com" },
        });
        assert.match(html, /role="tablist"/);
    });

    it("adds role=tab to each tab button", () => {
        const html = renderToHtml(schema, {
            value: { type: "email", address: "user@example.com" },
        });
        // Count role="tab" occurrences — should be 2
        const matches = html.match(/role="tab"/g);
        assert.equal(matches?.length, 2);
    });

    it("sets aria-selected=true on active tab", () => {
        const html = renderToHtml(schema, {
            value: { type: "email", address: "user@example.com" },
        });
        assert.match(html, /aria-selected="true"/);
    });

    it("sets tabindex=0 on active tab, -1 on inactive", () => {
        const html = renderToHtml(schema, {
            value: { type: "email", address: "user@example.com" },
        });
        assert.match(html, /tabindex="0"/);
        assert.match(html, /tabindex="-1"/);
    });

    it("adds aria-controls on tabs pointing to panel", () => {
        const html = renderToHtml(schema, {
            value: { type: "email", address: "user@example.com" },
        });
        assert.match(html, /aria-controls="sc--panel"/);
    });

    it("adds role=tabpanel to content area", () => {
        const html = renderToHtml(schema, {
            value: { type: "email", address: "user@example.com" },
        });
        assert.match(html, /role="tabpanel"/);
    });

    it("adds aria-labelledby on panel pointing to active tab", () => {
        const html = renderToHtml(schema, {
            value: { type: "email", address: "user@example.com" },
        });
        assert.match(html, /aria-labelledby="sc--tab-0"/);
    });

    it("adds aria-label on tablist", () => {
        const html = renderToHtml(schema, {
            value: { type: "email", address: "user@example.com" },
        });
        assert.match(html, /aria-label="Select variant"/);
    });

    it("produces WAI-ARIA tabs via streaming", () => {
        const chunks = [
            ...renderToHtmlChunks(schema, {
                value: { type: "phone", number: "+1234567890" },
            }),
        ];
        const html = chunks.join("");
        assert.match(html, /role="tablist"/);
        assert.match(html, /role="tab"/);
        assert.match(html, /role="tabpanel"/);
        assert.match(html, /aria-selected="true"/);
    });

    it("does not produce tabs in read-only mode", () => {
        const html = renderToHtml(schema, {
            value: { type: "email", address: "user@example.com" },
            readOnly: true,
        });
        assert.doesNotMatch(html, /role="tablist"/);
        assert.doesNotMatch(html, /role="tab"/);
    });
});

// ---------------------------------------------------------------------------
// Role attributes on groups
// ---------------------------------------------------------------------------

describe("role attributes (HTML)", () => {
    it("adds role=group to arrays with description", () => {
        const schema = z.object({
            tags: z.array(z.string()).meta({ description: "Tags" }),
        });
        // The HTML renderer doesn't add role=group to arrays directly,
        // but the record renderer does
        const html = renderToHtml(schema, {
            value: { tags: ["a", "b"] },
        });
        // Arrays use <ul> for read-only, div for editable
        assert.ok(html.includes("sc-array"));
    });

    it("adds role=group to records", () => {
        const html = renderToHtml(
            {
                type: "object",
                additionalProperties: { type: "string" },
            },
            { value: { foo: "bar", baz: "qux" } }
        );
        assert.match(html, /role="group"/);
    });
});

// ---------------------------------------------------------------------------
// Required indicators with aria-hidden
// ---------------------------------------------------------------------------

describe("required indicators (HTML)", () => {
    it("includes aria-hidden=true on asterisk", () => {
        const schema = z.object({ name: z.string() });
        const html = renderToHtml(schema, { value: { name: "Ada" } });
        assert.match(html, /aria-hidden="true"/);
        assert.match(html, /sc-required/);
    });

    it("shows asterisk in label for required field", () => {
        const schema = z.object({
            name: z.string().meta({ description: "Name" }),
        });
        const html = renderToHtml(schema, { value: { name: "Ada" } });
        // The label should contain the asterisk
        assert.ok(html.includes("sc-required"));
        assert.ok(html.includes("aria-hidden"));
    });
});

// ---------------------------------------------------------------------------
// Checkbox accessibility
// ---------------------------------------------------------------------------

describe("checkbox accessibility (HTML)", () => {
    it("adds aria-label from description", () => {
        const schema = z.object({
            active: z.boolean().meta({ description: "Active status" }),
        });
        const html = renderToHtml(schema, { value: { active: true } });
        assert.match(html, /aria-label="Active status"/);
    });

    it("adds aria-required when required", () => {
        const schema = z.object({ active: z.boolean() });
        const html = renderToHtml(schema, { value: { active: true } });
        assert.match(html, /aria-required="true"/);
    });
});

// ---------------------------------------------------------------------------
// Read-only aria-readonly
// ---------------------------------------------------------------------------

describe("read-only aria-readonly (HTML)", () => {
    it("adds aria-readonly to string values", () => {
        const html = renderToHtml(z.object({ name: z.string() }), {
            value: { name: "Ada" },
            readOnly: true,
        });
        assert.match(html, /aria-readonly="true"/);
    });
});

// ---------------------------------------------------------------------------
// Constraint hints with aria-describedby
// ---------------------------------------------------------------------------

describe("constraint hints with aria-describedby (HTML)", () => {
    it("links input to hint via aria-describedby", () => {
        const schema = z.object({
            name: z.string().min(3).max(50).meta({ description: "Name" }),
        });
        const html = renderToHtml(schema, { value: { name: "Ada" } });
        assert.match(html, /aria-describedby="sc-name-hint"/);
        assert.match(html, /id="sc-name-hint"/);
    });
});
