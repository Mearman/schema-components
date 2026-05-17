/**
 * Streaming HTML renderer — safety, recursion, and structural tests.
 *
 * Covers:
 * - Cyclic walked-field graphs terminate via the recursion sentinel
 *   instead of overflowing the stack.
 * - `streamObject`/`streamRecord`/`streamArray` emit a diagnostic and
 *   render a placeholder when the value shape disagrees with the field
 *   type — never silently coercing to `{}` / `[]`.
 * - Array item paths are derived from indices, not descriptions, so
 *   sibling items get distinct ids and free-text descriptions cannot
 *   leak invalid characters into id attributes.
 */

import { describe, it, expect } from "vitest";
import { z } from "zod";
import { renderToHtmlChunks } from "../src/html/renderToHtmlStream.ts";
import { streamField } from "../src/html/streamRenderers.ts";
import { walk } from "../src/core/walker.ts";
import { normaliseSchema } from "../src/core/adapter.ts";
import { mergeHtmlResolvers } from "../src/core/renderer.ts";
import { defaultHtmlResolver } from "../src/html/renderers.ts";
import type { Diagnostic } from "../src/core/diagnostics.ts";
import type { WalkedField } from "../src/core/types.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function streamHtml(schema: unknown, value: unknown): string {
    return [...renderToHtmlChunks(schema, { value, readOnly: true })].join("");
}

// ---------------------------------------------------------------------------
// Issue 2 — recursion guard in streamField
// ---------------------------------------------------------------------------

describe("streaming HTML — recursion guard", () => {
    it("terminates a cyclic walked-field graph with the recursion sentinel", () => {
        // The walker collapses `z.lazy` into a graph where descending into
        // the recursive position eventually returns the same field
        // reference — a true graph cycle, not just a deep tree. Without
        // the streaming recursion guard the call stack would blow up
        // chasing that cycle indefinitely.
        const treeSchema: z.ZodType = z.object({
            label: z.string(),
            children: z.array(z.lazy(() => treeSchema)).optional(),
        });

        function makeDeep(depth: number): {
            label: string;
            children: ReturnType<typeof makeDeep>[];
        } {
            if (depth === 0) return { label: "leaf", children: [] };
            return {
                label: `n-${String(depth)}`,
                children: [makeDeep(depth - 1)],
            };
        }
        const value = makeDeep(20);

        const html = streamHtml(treeSchema, value);

        // Sentinel marker proves the cap fired.
        expect(html).toContain("(recursive)");
        // And output is structurally non-empty without throwing.
        expect(html.length).toBeGreaterThan(0);
    });

    it("escapes <script> in the streaming recursion sentinel label", () => {
        const xssDescription = '<script>alert("xss")</script>';
        const treeSchema: z.ZodType = z.object({
            label: z.string(),
            children: z
                .array(z.lazy(() => treeSchema))
                .optional()
                .meta({ description: xssDescription }),
        });

        function makeDeep(depth: number): {
            label: string;
            children: ReturnType<typeof makeDeep>[];
        } {
            if (depth === 0) return { label: "leaf", children: [] };
            return {
                label: `n-${String(depth)}`,
                children: [makeDeep(depth - 1)],
            };
        }
        const html = streamHtml(treeSchema, makeDeep(15));

        expect(html).toContain("(recursive)");
        expect(html).not.toContain("<script>alert");
        expect(html).toContain("&lt;script&gt;");
    });
});

// ---------------------------------------------------------------------------
// Issue 3 — type-mismatch diagnostic + placeholder
// ---------------------------------------------------------------------------

describe("streaming HTML — type-mismatch diagnostic", () => {
    function buildStreamArgs(schema: unknown): {
        tree: WalkedField;
        mergedResolver: ReturnType<typeof mergeHtmlResolvers>;
    } {
        const { jsonSchema, rootMeta, rootDocument } = normaliseSchema(schema);
        const tree = walk(jsonSchema, {
            rootMeta,
            rootDocument,
            componentMeta: { readOnly: true },
        });
        return {
            tree,
            mergedResolver: mergeHtmlResolvers({}, defaultHtmlResolver),
        };
    }

    it("emits a type-mismatch diagnostic when an object schema receives a non-object", () => {
        const schema = z.object({ name: z.string() });
        const { tree, mergedResolver } = buildStreamArgs(schema);

        const received: Diagnostic[] = [];
        const html = [
            ...streamField(
                tree,
                42,
                mergedResolver,
                "",
                defaultHtmlResolver,
                0,
                { diagnostics: (d: Diagnostic) => received.push(d) }
            ),
        ].join("");

        expect(received.length).toBeGreaterThan(0);
        expect(received[0]?.code).toBe("type-mismatch");
        // Placeholder is rendered and escaped.
        expect(html).toContain("sc-value--invalid");
        expect(html).toContain("invalid value (expected object)");
    });

    it("emits a type-mismatch diagnostic when an array schema receives a non-array", () => {
        const schema = z.array(z.string());
        const { tree, mergedResolver } = buildStreamArgs(schema);

        const received: Diagnostic[] = [];
        const html = [
            ...streamField(
                tree,
                { not: "an array" },
                mergedResolver,
                "",
                defaultHtmlResolver,
                0,
                { diagnostics: (d: Diagnostic) => received.push(d) }
            ),
        ].join("");

        expect(received.length).toBeGreaterThan(0);
        expect(received[0]?.code).toBe("type-mismatch");
        expect(html).toContain("invalid value (expected array)");
    });

    it("emits a type-mismatch diagnostic when a record schema receives a non-object", () => {
        const jsonSchema = {
            type: "object" as const,
            additionalProperties: { type: "string" as const },
        };
        const { tree, mergedResolver } = buildStreamArgs(jsonSchema);

        const received: Diagnostic[] = [];
        const html = [
            ...streamField(
                tree,
                ["unexpected", "array"],
                mergedResolver,
                "",
                defaultHtmlResolver,
                0,
                { diagnostics: (d: Diagnostic) => received.push(d) }
            ),
        ].join("");

        expect(received.length).toBeGreaterThan(0);
        expect(received[0]?.code).toBe("type-mismatch");
        expect(html).toContain("invalid value (expected object)");
    });

    it("does not throw when no diagnostics sink is provided", () => {
        const schema = z.object({ name: z.string() });
        const { tree, mergedResolver } = buildStreamArgs(schema);
        // Must not throw even without a sink.
        const html = [
            ...streamField(
                tree,
                "definitely not an object",
                mergedResolver,
                "",
                defaultHtmlResolver,
                0,
                undefined
            ),
        ].join("");
        expect(html).toContain("invalid value (expected object)");
    });

    it("escapes type-mismatch placeholder content", () => {
        // The placeholder text is fixed but the path includes user data
        // — confirm the body is routed through the serialiser by spot
        // checking that the placeholder is properly tagged and class-named.
        const schema = z.object({ name: z.string() });
        const { tree, mergedResolver } = buildStreamArgs(schema);
        const html = [
            ...streamField(
                tree,
                123,
                mergedResolver,
                "",
                defaultHtmlResolver,
                0,
                undefined
            ),
        ].join("");
        expect(html).toMatch(/^<span class="sc-value sc-value--invalid"/);
    });

    it("does not emit a diagnostic for an absent value", () => {
        const schema = z.object({ name: z.string() });
        const { tree, mergedResolver } = buildStreamArgs(schema);
        const received: Diagnostic[] = [];
        // undefined / null are absence, not disagreement.
        const chunks = [
            ...streamField(
                tree,
                undefined,
                mergedResolver,
                "",
                defaultHtmlResolver,
                0,
                { diagnostics: (d: Diagnostic) => received.push(d) }
            ),
        ];
        expect(chunks.length).toBeGreaterThan(0);
        expect(received.filter((d) => d.code === "type-mismatch")).toHaveLength(
            0
        );
    });
});

// ---------------------------------------------------------------------------
// Issue 4 — element path derived from index, not description
// ---------------------------------------------------------------------------

describe("streaming HTML — array item path derivation", () => {
    it("gives sibling array items distinct ids", () => {
        // Editable mode produces labels with `for=` attributes that
        // expose the input id; checking ids is therefore visible from
        // the rendered HTML.
        const schema = z.object({
            tags: z.array(
                z.object({
                    name: z.string().meta({ description: "Tag name" }),
                })
            ),
        });
        const value = {
            tags: [{ name: "first" }, { name: "second" }, { name: "third" }],
        };
        const html = [...renderToHtmlChunks(schema, { value })].join("");

        // Pull every `for="..."` value out of the rendered HTML. With
        // description-as-path each tag's `name` input would have the
        // same `for` value; with index-derived paths they must differ.
        const forIds = [...html.matchAll(/for="([^"]+)"/g)].map((m) => m[1]);
        const nameInputIds = forIds.filter((id) => id?.endsWith("-name"));
        const unique = new Set(nameInputIds);
        expect(nameInputIds.length).toBeGreaterThanOrEqual(3);
        expect(unique.size).toBe(nameInputIds.length);
    });

    it("produces structurally valid ids when array element descriptions contain spaces", () => {
        const schema = z.object({
            entries: z.array(
                z
                    .object({ key: z.string() })
                    .meta({ description: "An entry with spaces" })
            ),
        });
        const value = { entries: [{ key: "a" }, { key: "b" }] };
        const html = [...renderToHtmlChunks(schema, { value })].join("");

        // Every `id="..."` value must match the valid-CSS-token whitelist.
        const ids = [...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
        expect(ids.length).toBeGreaterThan(0);
        for (const id of ids) {
            expect(id, `Invalid id: ${String(id)}`).toMatch(
                /^[A-Za-z][A-Za-z0-9_-]*$/
            );
        }
    });
});

// ---------------------------------------------------------------------------
// Issue 4 (a11y.ts) — normaliseIdSegment whitelist
// ---------------------------------------------------------------------------

describe("a11y — buildInputId tolerates pathological path segments", () => {
    it("strips arbitrary punctuation from path segments", async () => {
        const { buildInputId } = await import("../src/html/a11y.ts");
        // Path with spaces, slashes, quotes — every one must collapse
        // to a hyphen, never leak into the id token.
        const id = buildInputId("user info/!\"$&'", "first name");
        expect(id).toMatch(/^[A-Za-z][A-Za-z0-9_-]*$/);
        // No raw whitespace, slashes, or quotes survive.
        expect(id).not.toMatch(/[ \t/!"$&']/);
    });
});
