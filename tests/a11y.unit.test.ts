/**
 * Accessibility attribute tests.
 */

import { describe, it, expect } from "vitest";
import { z } from "zod";
import { renderToHtml } from "../src/html/renderToHtml.ts";

// ---------------------------------------------------------------------------
// aria-required
// ---------------------------------------------------------------------------

describe("aria-required", () => {
    it("adds aria-required to required string inputs", () => {
        const schema = z.object({ name: z.string() });
        const html = renderToHtml(schema, { value: { name: "Ada" } });
        expect(html).toMatch(/aria-required="true"/);
    });

    it("adds aria-required to required number inputs", () => {
        const schema = z.object({ age: z.number() });
        const html = renderToHtml(schema, { value: { age: 36 } });
        expect(html).toMatch(/aria-required="true"/);
    });

    it("adds aria-required to required selects", () => {
        const schema = z.object({ role: z.enum(["admin", "editor"]) });
        const html = renderToHtml(schema, { value: { role: "admin" } });
        expect(html.includes('aria-required="true"')).toBeTruthy();
    });

    it("adds aria-required to required checkboxes", () => {
        const schema = z.object({ active: z.boolean() });
        const html = renderToHtml(schema, { value: { active: true } });
        expect(html).toMatch(/aria-required="true"/);
    });

    it("omits aria-required for optional fields", () => {
        const schema = z.object({ name: z.string().optional() });
        const html = renderToHtml(schema, { value: { name: "Ada" } });
        expect(html).not.toMatch(/aria-required/);
    });
});

// ---------------------------------------------------------------------------
// Required indicator (*)
// ---------------------------------------------------------------------------

describe("Required indicator", () => {
    it("shows asterisk for required fields", () => {
        const schema = z.object({ name: z.string() });
        const html = renderToHtml(schema, { value: { name: "Ada" } });
        expect(html).toMatch(/sc-required/);
        expect(html).toMatch(/aria-hidden="true"/);
    });

    it("omits asterisk for optional fields", () => {
        const schema = z.object({ name: z.string().optional() });
        const html = renderToHtml(schema, { value: { name: "Ada" } });
        expect(html).not.toMatch(/sc-required/);
    });
});

// ---------------------------------------------------------------------------
// aria-describedby + constraint hints
// ---------------------------------------------------------------------------

describe("Constraint hints", () => {
    it("shows minLength constraint hint", () => {
        const schema = z.object({ name: z.string().min(3) });
        const html = renderToHtml(schema, { value: { name: "Ada" } });
        expect(html).toMatch(/aria-describedby="sc-name-hint"/);
        expect(html).toMatch(/id="sc-name-hint"/);
        expect(html).toMatch(/Minimum 3 characters/);
    });

    it("shows maxLength constraint hint", () => {
        const schema = z.object({ name: z.string().max(50) });
        const html = renderToHtml(schema, { value: { name: "Ada" } });
        expect(html).toMatch(/Maximum 50 characters/);
    });

    it("shows min/max constraint hint for numbers", () => {
        const schema = z.object({ age: z.number().min(0).max(150) });
        const html = renderToHtml(schema, { value: { age: 36 } });
        expect(html).toMatch(/aria-describedby="sc-age-hint"/);
        expect(html).toMatch(/Minimum 0/);
        expect(html).toMatch(/Maximum 150/);
    });

    it("shows minItems constraint hint for arrays", () => {
        const schema = z.object({ tags: z.array(z.string()).min(1) });
        const html = renderToHtml(schema, { value: { tags: ["a"] } });
        expect(html).toMatch(/Minimum 1 items/);
    });

    it("omits hint when no constraints", () => {
        const schema = z.object({ name: z.string() });
        const html = renderToHtml(schema, { value: { name: "Ada" } });
        // No min/max/etc → no hint element
        expect(html).not.toMatch(/sc-hint/);
        expect(html).not.toMatch(/aria-describedby/);
    });
});

// ---------------------------------------------------------------------------
// id attributes on inputs
// ---------------------------------------------------------------------------

describe("Input IDs", () => {
    it("adds id to string inputs", () => {
        const schema = z.object({ name: z.string() });
        const html = renderToHtml(schema, { value: { name: "Ada" } });
        expect(html).toMatch(/id="sc-name"/);
    });

    it("adds id to number inputs", () => {
        const schema = z.object({ age: z.number() });
        const html = renderToHtml(schema, { value: { age: 36 } });
        expect(html).toMatch(/id="sc-age"/);
    });

    it("adds id to selects", () => {
        const schema = z.object({ role: z.enum(["admin"]) });
        const html = renderToHtml(schema, { value: { role: "admin" } });
        expect(html).toMatch(/id="sc-role"/);
    });

    it("adds id to checkboxes", () => {
        const schema = z.object({ active: z.boolean() });
        const html = renderToHtml(schema, { value: { active: true } });
        expect(html).toMatch(/id="sc-active"/);
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
        expect(html).toMatch(/aria-label="Active"/);
    });

    it("omits aria-label when no description", () => {
        const schema = z.object({ active: z.boolean() });
        const html = renderToHtml(schema, { value: { active: true } });
        expect(html).not.toMatch(/aria-label/);
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
        expect(html).toMatch(/aria-readonly="true"/);
    });

    it("adds aria-readonly to read-only number values", () => {
        const schema = z.object({ age: z.number() });
        const html = renderToHtml(schema, {
            value: { age: 36 },
            readOnly: true,
        });
        expect(html).toMatch(/aria-readonly="true"/);
    });

    it("adds aria-readonly to read-only boolean values", () => {
        const schema = z.object({ active: z.boolean() });
        const html = renderToHtml(schema, {
            value: { active: true },
            readOnly: true,
        });
        expect(html).toMatch(/aria-readonly="true"/);
    });

    it("adds aria-readonly to read-only enum values", () => {
        const schema = z.object({ role: z.enum(["admin"]) });
        const html = renderToHtml(schema, {
            value: { role: "admin" },
            readOnly: true,
        });
        expect(html).toMatch(/aria-readonly="true"/);
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
        expect(html).toMatch(/role="group"/);
    });
});
