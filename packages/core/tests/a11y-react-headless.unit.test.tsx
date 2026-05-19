/**
 * @vitest-environment happy-dom
 *
 * Accessibility regression tests for the React headless renderer.
 *
 * Each `describe` block pins one of the AC findings documented in the
 * pre-fix review so future refactors that reintroduce the bug fail
 * loudly:
 *
 * - AC2: `aria-describedby` + `<small class="sc-hint">` mirror the HTML
 *   pipeline for constrained string / number / enum / file inputs.
 * - AC3: Object fields fall back to the structural key as the label
 *   text when no `description` is supplied (mirrors the HTML pipeline).
 * - AC10: Editable arrays render add/remove controls and a `<ul>` list
 *   container, matching the renderer's documented contract.
 */
import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { z } from "zod";
import { SchemaComponent } from "../src/react/SchemaComponent.tsx";

// ---------------------------------------------------------------------------
// AC2 — aria-describedby + hint element
// ---------------------------------------------------------------------------

describe("React headless renderer — aria-describedby + hint (AC2)", () => {
    it("links string input to hint via aria-describedby and renders <small>", () => {
        const schema = z.object({
            name: z.string().min(3).max(50).meta({ description: "Name" }),
        });
        const html = renderToString(
            <SchemaComponent
                idPrefix="root"
                schema={schema}
                value={{ name: "Ada" }}
            />
        );
        // The id is derived from `idPrefix + "." + key` — `sc-root-name`.
        expect(html).toMatch(/aria-describedby="sc-root-name-hint"/);
        expect(html).toMatch(/id="sc-root-name-hint"/);
        expect(html).toContain('class="sc-hint"');
        expect(html).toContain("Minimum 3 characters");
        expect(html).toContain("Maximum 50 characters");
    });

    it("omits aria-describedby and hint when string has no constraints", () => {
        const schema = z.object({
            name: z.string().meta({ description: "Name" }),
        });
        const html = renderToString(
            <SchemaComponent
                idPrefix="root"
                schema={schema}
                value={{ name: "Ada" }}
            />
        );
        expect(html).not.toMatch(/aria-describedby=/);
        expect(html).not.toContain("sc-hint");
    });

    it("links number input to hint via aria-describedby", () => {
        const schema = z.object({
            age: z.number().min(0).max(150).meta({ description: "Age" }),
        });
        const html = renderToString(
            <SchemaComponent
                idPrefix="root"
                schema={schema}
                value={{ age: 36 }}
            />
        );
        expect(html).toMatch(/aria-describedby="sc-root-age-hint"/);
        expect(html).toMatch(/id="sc-root-age-hint"/);
        expect(html).toContain("Minimum 0");
        expect(html).toContain("Maximum 150");
    });
});

// ---------------------------------------------------------------------------
// AC3 — label text falls back to the field key when description is absent
// ---------------------------------------------------------------------------

describe("React headless renderer — label fallback (AC3)", () => {
    it("renders a label using the field key when description is missing", () => {
        // `z.object({ name: z.string() })` has no `description`. The
        // HTML pipeline already falls back to the structural key; the
        // React pipeline must follow suit so screen-reader users still
        // hear "name" announced for the input.
        const schema = z.object({ name: z.string() });
        const html = renderToString(
            <SchemaComponent
                idPrefix="root"
                schema={schema}
                value={{ name: "Ada" }}
            />
        );
        expect(html).toMatch(/<label[^>]*for="sc-root-name"[^>]*>name/);
    });

    it("prefers description over the key when both are available", () => {
        const schema = z.object({
            name: z.string().meta({ description: "Full name" }),
        });
        const html = renderToString(
            <SchemaComponent
                idPrefix="root"
                schema={schema}
                value={{ name: "Ada" }}
            />
        );
        expect(html).toMatch(/<label[^>]*for="sc-root-name"[^>]*>Full name/);
    });
});

// ---------------------------------------------------------------------------
// AC10 — editable array exposes add / remove controls
// ---------------------------------------------------------------------------

describe("React headless renderer — array add/remove controls (AC10)", () => {
    it("renders an add button for an editable array", () => {
        const schema = z.object({
            tags: z.array(z.string()).meta({ description: "Tags" }),
        });
        const html = renderToString(
            <SchemaComponent
                idPrefix="root"
                schema={schema}
                value={{ tags: ["alpha"] }}
            />
        );
        expect(html).toMatch(/<button[^>]*aria-label="Add item"/);
    });

    it("renders a remove button per existing item", () => {
        const schema = z.object({
            tags: z.array(z.string()).meta({ description: "Tags" }),
        });
        const html = renderToString(
            <SchemaComponent
                idPrefix="root"
                schema={schema}
                value={{ tags: ["alpha", "beta"] }}
            />
        );
        const matches = html.match(/aria-label="Remove item \d+"/g) ?? [];
        expect(matches.length).toBe(2);
    });

    it("wraps items in a <ul>", () => {
        const schema = z.object({
            tags: z.array(z.string()).meta({ description: "Tags" }),
        });
        const html = renderToString(
            <SchemaComponent
                idPrefix="root"
                schema={schema}
                value={{ tags: ["alpha"] }}
            />
        );
        expect(html).toContain("<ul");
        expect(html).toContain("<li");
    });

    it("still renders the add button on an empty editable array", () => {
        const schema = z.object({
            tags: z.array(z.string()).meta({ description: "Tags" }),
        });
        const html = renderToString(
            <SchemaComponent
                idPrefix="root"
                schema={schema}
                value={{ tags: [] }}
            />
        );
        expect(html).toMatch(/<button[^>]*aria-label="Add item"/);
    });
});
