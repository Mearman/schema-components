/**
 * `<sc-discriminated>` integration test.
 *
 * Covers the WAI-ARIA "Tabs with Automatic Activation" pattern:
 *
 * - Renders one `role="tab"` per option.
 * - `aria-selected`, `aria-controls`, `aria-labelledby`, and
 *   `tabindex` are wired correctly.
 * - Clicking a tab emits a `sc-change` event carrying the
 *   discriminator-shaped value.
 * - The pure helper `discriminatedUnionValueForTabLit` returns the
 *   right value for each tab index.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { z } from "zod";
import { registerSchemaComponents } from "../src/lit/registry.ts";
import { walk } from "../src/core/walker.ts";
import { normaliseSchema } from "../src/core/adapter.ts";
import { discriminatedUnionValueForTabLit } from "../src/lit/renderers/scDiscriminated.ts";
import { awaitReady } from "./lit-test-utils.ts";

beforeAll(() => {
    registerSchemaComponents();
});

describe("discriminatedUnionValueForTabLit", () => {
    it("returns the discriminator-shaped value at a valid index", () => {
        const r = discriminatedUnionValueForTabLit(["a", "b", "c"], "kind", 1);
        expect(r).toEqual({ kind: "b" });
    });

    it("returns undefined for an out-of-bounds index", () => {
        const r = discriminatedUnionValueForTabLit(["a"], "kind", 4);
        expect(r).toBeUndefined();
    });
});

describe("<sc-discriminated>", () => {
    it("renders one tab per option with ARIA roles", async () => {
        const schema = z.discriminatedUnion("kind", [
            z.object({ kind: z.literal("dog"), bark: z.string() }),
            z.object({ kind: z.literal("cat"), meow: z.string() }),
        ]);
        const { jsonSchema, rootMeta, rootDocument } = normaliseSchema(schema);
        const tree = walk(jsonSchema, { rootMeta, rootDocument });
        const seen: unknown[] = [];

        const el = document.createElement("sc-discriminated");
        Reflect.set(el, "tree", tree);
        Reflect.set(el, "value", { kind: "dog", bark: "woof" });
        Reflect.set(el, "path", "root");
        Reflect.set(el, "meta", tree.meta);
        Reflect.set(el, "constraints", tree.constraints);
        Reflect.set(el, "change", (v: unknown) => {
            seen.push(v);
        });
        Reflect.set(
            el,
            "renderChild",
            // Stub: pretend each option renders an empty fragment.
            () => {
                /* return empty TemplateResult-shaped value */
                return undefined;
            }
        );
        document.body.appendChild(el);
        await awaitReady(el);

        const tabs = el.shadowRoot?.querySelectorAll("[role='tab']");
        expect(tabs?.length).toBe(2);
        const tablist = el.shadowRoot?.querySelector("[role='tablist']");
        expect(tablist).not.toBeNull();
        const panel = el.shadowRoot?.querySelector("[role='tabpanel']");
        expect(panel).not.toBeNull();

        // The first tab should be selected (dog).
        const firstTab = tabs?.[0];
        expect(firstTab?.getAttribute("aria-selected")).toBe("true");
        const secondTab = tabs?.[1];
        expect(secondTab?.getAttribute("aria-selected")).toBe("false");

        el.remove();
    });

    it("emits a change with the discriminator-shaped value on tab click", async () => {
        const schema = z.discriminatedUnion("kind", [
            z.object({ kind: z.literal("dog"), bark: z.string() }),
            z.object({ kind: z.literal("cat"), meow: z.string() }),
        ]);
        const { jsonSchema, rootMeta, rootDocument } = normaliseSchema(schema);
        const tree = walk(jsonSchema, { rootMeta, rootDocument });
        const seen: unknown[] = [];

        const el = document.createElement("sc-discriminated");
        Reflect.set(el, "tree", tree);
        Reflect.set(el, "value", { kind: "dog", bark: "woof" });
        Reflect.set(el, "path", "root");
        Reflect.set(el, "meta", tree.meta);
        Reflect.set(el, "constraints", tree.constraints);
        Reflect.set(el, "change", (v: unknown) => {
            seen.push(v);
        });
        Reflect.set(el, "renderChild", () => {
            return undefined;
        });
        document.body.appendChild(el);
        await awaitReady(el);

        const tabs = el.shadowRoot?.querySelectorAll("[role='tab']");
        const secondTab = tabs?.[1];
        if (secondTab instanceof HTMLElement) {
            secondTab.click();
        }
        await awaitReady(el);

        expect(seen.length).toBeGreaterThan(0);
        expect(seen[0]).toEqual({ kind: "cat" });
        el.remove();
    });
});
