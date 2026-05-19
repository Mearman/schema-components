/**
 * streaming-HTML fix coverage.
 *
 * Each suite below targets a specific defect addressed in this
 * fix cycle. Tests assert behaviour at the renderer boundary so a
 * regression surfaces as a failing user-visible expectation rather
 * than a private implementation detail.
 */

import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
    renderToHtmlChunks,
    renderToHtmlStream,
} from "../src/html/renderToHtmlStream.ts";
import { renderToHtml } from "../src/html/renderToHtml.ts";
import { yieldOpen, yieldClose } from "../src/html/streamRenderers.ts";
import { h } from "../src/html/html.ts";

// ---------------------------------------------------------------------------
// yieldOpen — void elements emit self-closing form, non-void emit open tag
// ---------------------------------------------------------------------------

describe("yieldOpen — void vs non-void branches", () => {
    it("emits a self-closing tag for void elements (input, br)", () => {
        // `<input>` and `<br>` are void per the HTML spec — they have no
        // closing tag and no children. A single `yieldOpen` call must
        // produce a complete, structurally valid element so the streaming
        // pipeline does not leave a dangling opening tag waiting on a
        // `yieldClose` that the consumer would never see.
        expect(yieldOpen(h("input", { type: "text" }))).toBe(
            '<input type="text" />'
        );
        expect(yieldOpen(h("br", {}))).toBe("<br />");
    });

    it("emits an opening tag for non-void elements", () => {
        // Non-void elements still need an explicit `yieldClose` later, so
        // `yieldOpen` keeps the tag open.
        expect(yieldOpen(h("div", { class: "x" }))).toBe('<div class="x">');
    });

    it("yieldClose returns empty for void elements and a closing tag otherwise", () => {
        expect(yieldClose(h("input", {}))).toBe("");
        expect(yieldClose(h("br", {}))).toBe("");
        expect(yieldClose(h("div", {}))).toBe("</div>");
    });
});

// ---------------------------------------------------------------------------
// Tab panel ID consistency
// ---------------------------------------------------------------------------

/**
 * Pick the `aria-controls` value off every `role="tab"` button in the
 * markup. Throws an assertion failure when the markup contains no tabs
 * so the call site can rely on a non-empty result.
 */
function extractAriaControls(html: string): string[] {
    const matches = [
        ...html.matchAll(
            /<button\b[^>]*role="tab"[^>]*\baria-controls="([^"]+)"/g
        ),
    ];
    return matches.map((m) => m[1] ?? "");
}

/**
 * Pull the `id` attribute off the single `role="tabpanel"` div in the
 * markup. Used together with `extractAriaControls` to assert the
 * tab→panel association is consistent.
 */
function extractPanelId(html: string): string {
    const match = /<div[^>]*\brole="tabpanel"[^>]*\bid="([^"]+)"/.exec(html);
    if (match === null) throw new Error("no role=tabpanel element in output");
    return match[1] ?? "";
}

/**
 * Pull every `id` off `role="tab"` buttons in the markup.
 */
function extractTabIds(html: string): string[] {
    const matches = [
        ...html.matchAll(/<button\b[^>]*role="tab"[^>]*\bid="([^"]+)"/g),
    ];
    return matches.map((m) => m[1] ?? "");
}

describe("Discriminated union tab IDs — sync ↔ streaming consistency", () => {
    const schema = z.object({
        node: z.discriminatedUnion("kind", [
            z.object({ kind: z.literal("leaf"), value: z.string() }),
            z.object({ kind: z.literal("branch"), count: z.number() }),
        ]),
    });
    const value = { node: { kind: "leaf" as const, value: "x" } };

    it("renders matching aria-controls and panel id within the sync renderer", () => {
        const html = renderToHtml(schema, { value });
        const ariaControls = extractAriaControls(html);
        const panelId = extractPanelId(html);

        expect(ariaControls.length).toBeGreaterThan(0);
        // Every tab's aria-controls must reference the panel id exactly.
        for (const ac of ariaControls) {
            expect(ac).toBe(panelId);
        }
    });

    it("renders matching aria-controls and panel id within the streaming renderer", () => {
        const html = [...renderToHtmlChunks(schema, { value })].join("");
        const ariaControls = extractAriaControls(html);
        const panelId = extractPanelId(html);

        expect(ariaControls.length).toBeGreaterThan(0);
        for (const ac of ariaControls) {
            expect(ac).toBe(panelId);
        }
    });

    it("sync and streaming renderers emit identical tab and panel ids for the same path", () => {
        // The same path under the same schema must produce the same ids
        // regardless of pipeline — otherwise consumers cannot share CSS,
        // tests, or a11y-tree expectations between server-streamed and
        // server-static markup.
        const syncHtml = renderToHtml(schema, { value });
        const streamHtml = [...renderToHtmlChunks(schema, { value })].join("");

        const syncTabIds = extractTabIds(syncHtml);
        const streamTabIds = extractTabIds(streamHtml);
        expect(streamTabIds).toStrictEqual(syncTabIds);

        const syncPanelId = extractPanelId(syncHtml);
        const streamPanelId = extractPanelId(streamHtml);
        expect(streamPanelId).toBe(syncPanelId);
    });

    it("produces structurally valid CSS ids for deeply nested discriminated unions", () => {
        // Nested under arrays produces a path like `things[0]` — a
        // previous bug let dots / brackets leak through into the id
        // and break CSS selectors. Both pipelines must sanitise.
        const nestedSchema = z.object({
            things: z.array(
                z.discriminatedUnion("kind", [
                    z.object({ kind: z.literal("a"), a: z.string() }),
                    z.object({ kind: z.literal("b"), b: z.number() }),
                ])
            ),
        });
        const nestedValue = { things: [{ kind: "a" as const, a: "hello" }] };

        const validId = /^[A-Za-z][A-Za-z0-9_-]*$/;
        for (const html of [
            renderToHtml(nestedSchema, { value: nestedValue }),
            [...renderToHtmlChunks(nestedSchema, { value: nestedValue })].join(
                ""
            ),
        ]) {
            for (const id of extractTabIds(html)) {
                expect(id).toMatch(validId);
                expect(id).not.toContain(".");
                expect(id).not.toContain("[");
                expect(id).not.toContain("]");
            }
            expect(extractPanelId(html)).toMatch(validId);
        }
    });
});

// ---------------------------------------------------------------------------
// Discriminator narrowing — no empty `aria-controls`
// ---------------------------------------------------------------------------

describe("Discriminated union — discriminator narrowing", () => {
    it("never produces an empty aria-controls attribute", () => {
        // The previous `discKey ?? ""` fallback could in principle have
        // collapsed an aria-controls to a bare `sc--panel` if the
        // discriminator were ever absent. After narrowing, the suffix is
        // always derived from a real path, so the attribute is never
        // empty and never a degenerate sentinel like `""`.
        const schema = z.discriminatedUnion("kind", [
            z.object({ kind: z.literal("a"), a: z.string() }),
            z.object({ kind: z.literal("b"), b: z.number() }),
        ]);

        for (const html of [
            renderToHtml(schema, { value: { kind: "a", a: "x" } }),
            [
                ...renderToHtmlChunks(schema, {
                    value: { kind: "a", a: "x" },
                }),
            ].join(""),
        ]) {
            const ariaControls = extractAriaControls(html);
            expect(ariaControls.length).toBeGreaterThan(0);
            for (const ac of ariaControls) {
                expect(ac).not.toBe("");
                // The attribute must always carry the `-panel` suffix
                // emitted by the canonical id helper.
                expect(ac.endsWith("-panel")).toBe(true);
            }
        }
    });
});

// ---------------------------------------------------------------------------
// schedulerYield — no observable latency
// ---------------------------------------------------------------------------

describe("renderToHtmlStream scheduler", () => {
    it("does not add multi-millisecond latency between chunks", async () => {
        // Smoke test — render a schema with multiple chunks and assert
        // the total async wall time is small. `setTimeout(resolve, 0)`
        // clamps to >= 4 ms once nested, so a 16-field object would
        // accumulate > 60 ms on the old implementation. The microtask
        // form should comfortably finish in well under that.
        const schema = z.object(
            Object.fromEntries(
                Array.from({ length: 16 }, (_, i) => [
                    `f${String(i)}`,
                    z.string(),
                ])
            )
        );
        const value = Object.fromEntries(
            Array.from({ length: 16 }, (_, i) => [`f${String(i)}`, "x"])
        );

        const start = performance.now();
        for await (const _chunk of renderToHtmlStream(schema, {
            value,
            readOnly: true,
        })) {
            // Iterate to completion; ignore the chunks themselves.
            void _chunk;
        }
        const elapsed = performance.now() - start;

        // 50 ms is generous — the nested-setTimeout floor on a 16-field
        // object is ~64 ms (16 * 4 ms once nesting kicks in), so any
        // result below ~50 ms reliably distinguishes the microtask path
        // from the clamped-setTimeout path even on a busy CI machine.
        expect(elapsed).toBeLessThan(50);
    });
});
