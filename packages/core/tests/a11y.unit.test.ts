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
// Read-only presentation — conveyed structurally (no input), not via the
// invalid `aria-readonly` attribute on a plain `<span>`. ARIA 1.2 restricts
// `aria-readonly` to widget roles (textbox, combobox, gridcell, listbox),
// so emitting it on a non-widget element fails the `aria-attr-allowed`
// rule. The renderers now omit it; the read-only nature is communicated by
// the absence of any input element and the surrounding semantic structure
// (e.g. `<dl><dt><dd>` for objects).
// ---------------------------------------------------------------------------

describe("read-only presentation (no invalid aria-readonly)", () => {
    it("renders read-only strings without aria-readonly on the span", () => {
        const schema = z.object({ name: z.string() });
        const html = renderToHtml(schema, {
            value: { name: "Ada" },
            readOnly: true,
        });
        expect(html).not.toMatch(/<span[^>]*aria-readonly/);
        expect(html).not.toMatch(/<input/);
        expect(html).toContain("Ada");
    });

    it("renders read-only numbers without aria-readonly on the span", () => {
        const schema = z.object({ age: z.number() });
        const html = renderToHtml(schema, {
            value: { age: 36 },
            readOnly: true,
        });
        expect(html).not.toMatch(/<span[^>]*aria-readonly/);
        expect(html).not.toMatch(/<input/);
    });

    it("renders read-only booleans without aria-readonly on the span", () => {
        const schema = z.object({ active: z.boolean() });
        const html = renderToHtml(schema, {
            value: { active: true },
            readOnly: true,
        });
        expect(html).not.toMatch(/<span[^>]*aria-readonly/);
        expect(html).not.toMatch(/<input/);
        expect(html).toContain("Yes");
    });

    it("renders read-only enums without aria-readonly on the span", () => {
        const schema = z.object({ role: z.enum(["admin"]) });
        const html = renderToHtml(schema, {
            value: { role: "admin" },
            readOnly: true,
        });
        expect(html).not.toMatch(/<span[^>]*aria-readonly/);
        expect(html).not.toMatch(/<select/);
        expect(html).toContain("admin");
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

// ---------------------------------------------------------------------------
// AC7 — writeOnly + format:"password" renders as <input type="password">
// ---------------------------------------------------------------------------

describe("writeOnly password rendering", () => {
    it("renders writeOnly + format=password as <input type=password>", () => {
        const html = renderToHtml(
            { type: "string", writeOnly: true, format: "password" },
            { value: "secret" }
        );
        expect(html).toMatch(/type="password"/);
        // writeOnly clears the rendered value attribute so the secret
        // never leaks back to the DOM.
        expect(html).not.toMatch(/value="secret"/);
    });

    it("emits autocomplete=current-password when a writeOnly password has a value", () => {
        const html = renderToHtml(
            { type: "string", writeOnly: true, format: "password" },
            { value: "existing" }
        );
        expect(html).toMatch(/autocomplete="current-password"/);
    });

    it("emits autocomplete=new-password when a writeOnly password is empty", () => {
        const html = renderToHtml({
            type: "string",
            writeOnly: true,
            format: "password",
        });
        expect(html).toMatch(/autocomplete="new-password"/);
    });

    it("does not switch to password type without format=password", () => {
        // writeOnly alone is not enough — the field could be a non-credential
        // write-only value (e.g. an arbitrary internal token). Keep type=text.
        const html = renderToHtml(
            { type: "string", writeOnly: true },
            { value: "anything" }
        );
        expect(html).not.toMatch(/type="password"/);
        expect(html).toMatch(/type="text"/);
    });

    it("does not switch to password type when readable (no writeOnly)", () => {
        // `format: "password"` alone without `writeOnly` is treated as a
        // visible string — Swagger 2.0 explicitly documents the format as a
        // hint only when paired with write-only semantics.
        const html = renderToHtml(
            { type: "string", format: "password" },
            { value: "visible" }
        );
        expect(html).not.toMatch(/type="password"/);
        expect(html).toMatch(/type="text"/);
    });
});

// ---------------------------------------------------------------------------
// AC13 — Number inputs carry inputmode + step for mobile keypads
// ---------------------------------------------------------------------------

describe("Number input inputmode + step", () => {
    it("emits inputmode=numeric and step=1 on integer schemas", () => {
        const html = renderToHtml({ type: "integer" }, { value: 7 });
        expect(html).toMatch(/inputmode="numeric"/);
        expect(html).toMatch(/step="1"/);
    });

    it("emits inputmode=decimal and no implicit step on decimal schemas", () => {
        const html = renderToHtml({ type: "number" }, { value: 3.14 });
        expect(html).toMatch(/inputmode="decimal"/);
        // No `multipleOf`, not an integer — `step` must be absent so the
        // browser defaults to `step="any"`.
        expect(html).not.toMatch(/step=/);
    });

    it("derives step from multipleOf when supplied", () => {
        const html = renderToHtml(
            { type: "number", multipleOf: 0.25 },
            { value: 1.5 }
        );
        expect(html).toMatch(/step="0\.25"/);
    });

    it("derives step from multipleOf on integer schemas too", () => {
        const html = renderToHtml(
            { type: "integer", multipleOf: 5 },
            { value: 10 }
        );
        expect(html).toMatch(/step="5"/);
    });
});
