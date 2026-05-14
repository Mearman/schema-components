/**
 * Accessibility attribute tests.
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { z } from "zod";
import { renderToHtml } from "../src/html/renderToHtml.ts";

// ---------------------------------------------------------------------------
// aria-required
// ---------------------------------------------------------------------------

describe("aria-required", () => {
    it("adds aria-required to required string inputs", () => {
        const schema = z.object({ name: z.string() });
        const html = renderToHtml(schema, { value: { name: "Ada" } });
        assert.match(html, /aria-required="true"/);
    });

    it("adds aria-required to required number inputs", () => {
        const schema = z.object({ age: z.number() });
        const html = renderToHtml(schema, { value: { age: 36 } });
        assert.match(html, /aria-required="true"/);
    });

    it("adds aria-required to required selects", () => {
        const schema = z.object({ role: z.enum(["admin", "editor"]) });
        const html = renderToHtml(schema, { value: { role: "admin" } });
        assert.ok(html.includes('aria-required="true"'));
    });

    it("adds aria-required to required checkboxes", () => {
        const schema = z.object({ active: z.boolean() });
        const html = renderToHtml(schema, { value: { active: true } });
        assert.match(html, /aria-required="true"/);
    });

    it("omits aria-required for optional fields", () => {
        const schema = z.object({ name: z.string().optional() });
        const html = renderToHtml(schema, { value: { name: "Ada" } });
        assert.doesNotMatch(html, /aria-required/);
    });
});

// ---------------------------------------------------------------------------
// Required indicator (*)
// ---------------------------------------------------------------------------

describe("Required indicator", () => {
    it("shows asterisk for required fields", () => {
        const schema = z.object({ name: z.string() });
        const html = renderToHtml(schema, { value: { name: "Ada" } });
        assert.match(html, /sc-required/);
        assert.match(html, /aria-hidden="true"/);
    });

    it("omits asterisk for optional fields", () => {
        const schema = z.object({ name: z.string().optional() });
        const html = renderToHtml(schema, { value: { name: "Ada" } });
        assert.doesNotMatch(html, /sc-required/);
    });
});

// ---------------------------------------------------------------------------
// aria-describedby + constraint hints
// ---------------------------------------------------------------------------

describe("Constraint hints", () => {
    it("shows minLength constraint hint", () => {
        const schema = z.object({ name: z.string().min(3) });
        const html = renderToHtml(schema, { value: { name: "Ada" } });
        assert.match(html, /aria-describedby="sc-name-hint"/);
        assert.match(html, /id="sc-name-hint"/);
        assert.match(html, /Minimum 3 characters/);
    });

    it("shows maxLength constraint hint", () => {
        const schema = z.object({ name: z.string().max(50) });
        const html = renderToHtml(schema, { value: { name: "Ada" } });
        assert.match(html, /Maximum 50 characters/);
    });

    it("shows min/max constraint hint for numbers", () => {
        const schema = z.object({ age: z.number().min(0).max(150) });
        const html = renderToHtml(schema, { value: { age: 36 } });
        assert.match(html, /aria-describedby="sc-age-hint"/);
        assert.match(html, /Minimum 0/);
        assert.match(html, /Maximum 150/);
    });

    it("shows minItems constraint hint for arrays", () => {
        const schema = z.object({ tags: z.array(z.string()).min(1) });
        const html = renderToHtml(schema, { value: { tags: ["a"] } });
        assert.match(html, /Minimum 1 items/);
    });

    it("omits hint when no constraints", () => {
        const schema = z.object({ name: z.string() });
        const html = renderToHtml(schema, { value: { name: "Ada" } });
        // No min/max/etc → no hint element
        assert.doesNotMatch(html, /sc-hint/);
        assert.doesNotMatch(html, /aria-describedby/);
    });
});

// ---------------------------------------------------------------------------
// id attributes on inputs
// ---------------------------------------------------------------------------

describe("Input IDs", () => {
    it("adds id to string inputs", () => {
        const schema = z.object({ name: z.string() });
        const html = renderToHtml(schema, { value: { name: "Ada" } });
        assert.match(html, /id="sc-name"/);
    });

    it("adds id to number inputs", () => {
        const schema = z.object({ age: z.number() });
        const html = renderToHtml(schema, { value: { age: 36 } });
        assert.match(html, /id="sc-age"/);
    });

    it("adds id to selects", () => {
        const schema = z.object({ role: z.enum(["admin"]) });
        const html = renderToHtml(schema, { value: { role: "admin" } });
        assert.match(html, /id="sc-role"/);
    });

    it("adds id to checkboxes", () => {
        const schema = z.object({ active: z.boolean() });
        const html = renderToHtml(schema, { value: { active: true } });
        assert.match(html, /id="sc-active"/);
    });
});

// ---------------------------------------------------------------------------
// aria-label on checkboxes
// ---------------------------------------------------------------------------

describe("Checkbox aria-label", () => {
    it("adds aria-label from description", () => {
        const schema = z.object({
            active: z.boolean().meta({ description: "Active" }),
        });
        const html = renderToHtml(schema, { value: { active: true } });
        assert.match(html, /aria-label="Active"/);
    });

    it("omits aria-label when no description", () => {
        const schema = z.object({ active: z.boolean() });
        const html = renderToHtml(schema, { value: { active: true } });
        assert.doesNotMatch(html, /aria-label/);
    });
});

// ---------------------------------------------------------------------------
// aria-readonly on read-only values
// ---------------------------------------------------------------------------

describe("aria-readonly", () => {
    it("adds aria-readonly to read-only string values", () => {
        const schema = z.object({ name: z.string() });
        const html = renderToHtml(schema, {
            value: { name: "Ada" },
            readOnly: true,
        });
        assert.match(html, /aria-readonly="true"/);
    });

    it("adds aria-readonly to read-only number values", () => {
        const schema = z.object({ age: z.number() });
        const html = renderToHtml(schema, {
            value: { age: 36 },
            readOnly: true,
        });
        assert.match(html, /aria-readonly="true"/);
    });

    it("adds aria-readonly to read-only boolean values", () => {
        const schema = z.object({ active: z.boolean() });
        const html = renderToHtml(schema, {
            value: { active: true },
            readOnly: true,
        });
        assert.match(html, /aria-readonly="true"/);
    });

    it("adds aria-readonly to read-only enum values", () => {
        const schema = z.object({ role: z.enum(["admin"]) });
        const html = renderToHtml(schema, {
            value: { role: "admin" },
            readOnly: true,
        });
        assert.match(html, /aria-readonly="true"/);
    });
});

// ---------------------------------------------------------------------------
// role="group" on records
// ---------------------------------------------------------------------------

describe("Record role", () => {
    it("adds role=group to editable record", () => {
        const schema = z.object({
            meta: z.record(z.string(), z.string()),
        });
        const html = renderToHtml(schema, { value: { meta: { foo: "bar" } } });
        assert.match(html, /role="group"/);
    });
});
