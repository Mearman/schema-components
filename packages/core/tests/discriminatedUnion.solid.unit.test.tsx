/** @jsxImportSource solid-js */
/**
 * Tabs/keyboard-navigation tests for the Solid discriminated-union
 * renderer.
 *
 * Mirrors the React adapter's expectations: clicking a tab updates the
 * value, ArrowRight/ArrowLeft cycle through tabs (with wrap), Home/End
 * jump to the extremes, and `aria-selected` / `aria-controls` /
 * `tabindex` carry the correct ARIA semantics.
 */
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { cleanup, fireEvent, render } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { SchemaComponent } from "../src/solid/SchemaComponent.tsx";
import { discriminatedUnionValueForTab } from "../src/solid/renderers.tsx";

afterEach(() => {
    cleanup();
});

const variantSchema = z.discriminatedUnion("kind", [
    z.object({
        kind: z.literal("text"),
        body: z.string(),
    }),
    z.object({
        kind: z.literal("number"),
        count: z.number(),
    }),
    z.object({
        kind: z.literal("flag"),
        on: z.boolean(),
    }),
]);

describe("Solid discriminated-union tabs", () => {
    it("renders one role=tab per option with roving tabindex", () => {
        const { container } = render(() => (
            <SchemaComponent
                idPrefix="root"
                schema={variantSchema}
                value={{ kind: "text", body: "hi" }}
            />
        ));
        const tabs =
            container.querySelectorAll<HTMLButtonElement>('button[role="tab"]');
        expect(tabs.length).toBe(3);
        const tabAttrs = Array.from(tabs).map((tab) => ({
            selected: tab.getAttribute("aria-selected"),
            tabindex: tab.getAttribute("tabindex"),
            controls: tab.getAttribute("aria-controls"),
        }));
        // First tab is active for `kind: "text"` — selected/0, others
        // get false/-1.
        expect(tabAttrs[0]?.selected).toBe("true");
        expect(tabAttrs[0]?.tabindex).toBe("0");
        expect(tabAttrs[1]?.selected).toBe("false");
        expect(tabAttrs[1]?.tabindex).toBe("-1");
        expect(tabAttrs[2]?.selected).toBe("false");
        // All tabs control the same panel.
        expect(tabAttrs[0]?.controls).toBe(tabAttrs[1]?.controls);
    });

    it("emits the new discriminator value when a tab is clicked", () => {
        const [value, setValue] = createSignal<z.infer<typeof variantSchema>>({
            kind: "text",
            body: "hi",
        });
        const { container } = render(() => (
            <SchemaComponent
                idPrefix="root"
                schema={variantSchema}
                value={value()}
                onChange={(next) => {
                    setValue(next);
                }}
            />
        ));
        const tabs =
            container.querySelectorAll<HTMLButtonElement>('button[role="tab"]');
        // Click the second tab — should switch the discriminator to "number".
        const secondTab = tabs[1];
        expect(secondTab).toBeDefined();
        if (secondTab !== undefined) {
            fireEvent.click(secondTab);
        }
        const v = value();
        expect(v).toEqual({ kind: "number" });
    });

    it("ArrowRight on the tablist cycles to the next tab", () => {
        const [value, setValue] = createSignal<z.infer<typeof variantSchema>>({
            kind: "text",
            body: "hi",
        });
        const { container } = render(() => (
            <SchemaComponent
                idPrefix="root"
                schema={variantSchema}
                value={value()}
                onChange={(next) => {
                    setValue(next);
                }}
            />
        ));
        const tablist = container.querySelector('div[role="tablist"]');
        expect(tablist).not.toBeNull();
        if (tablist !== null) {
            fireEvent.keyDown(tablist, { key: "ArrowRight" });
        }
        const v = value();
        expect(v).toEqual({ kind: "number" });
    });

    it("ArrowLeft wraps to the last tab from the first", () => {
        const [value, setValue] = createSignal<z.infer<typeof variantSchema>>({
            kind: "text",
            body: "hi",
        });
        const { container } = render(() => (
            <SchemaComponent
                idPrefix="root"
                schema={variantSchema}
                value={value()}
                onChange={(next) => {
                    setValue(next);
                }}
            />
        ));
        const tablist = container.querySelector('div[role="tablist"]');
        if (tablist !== null) {
            fireEvent.keyDown(tablist, { key: "ArrowLeft" });
        }
        const v = value();
        expect(v).toEqual({ kind: "flag" });
    });

    it("End jumps to the last tab", () => {
        const [value, setValue] = createSignal<z.infer<typeof variantSchema>>({
            kind: "text",
            body: "hi",
        });
        const { container } = render(() => (
            <SchemaComponent
                idPrefix="root"
                schema={variantSchema}
                value={value()}
                onChange={(next) => {
                    setValue(next);
                }}
            />
        ));
        const tablist = container.querySelector('div[role="tablist"]');
        if (tablist !== null) {
            fireEvent.keyDown(tablist, { key: "End" });
        }
        const v = value();
        expect(v).toEqual({ kind: "flag" });
    });

    it("Home jumps to the first tab when starting elsewhere", () => {
        const [value, setValue] = createSignal<z.infer<typeof variantSchema>>({
            kind: "flag",
            on: true,
        });
        const { container } = render(() => (
            <SchemaComponent
                idPrefix="root"
                schema={variantSchema}
                value={value()}
                onChange={(next) => {
                    setValue(next);
                }}
            />
        ));
        const tablist = container.querySelector('div[role="tablist"]');
        if (tablist !== null) {
            fireEvent.keyDown(tablist, { key: "Home" });
        }
        const v = value();
        expect(v).toEqual({ kind: "text" });
    });

    it("discriminatedUnionValueForTab returns undefined for an out-of-bounds index", () => {
        const labels = ["a", "b"];
        expect(
            discriminatedUnionValueForTab(labels, "kind", -1)
        ).toBeUndefined();
        expect(
            discriminatedUnionValueForTab(labels, "kind", 2)
        ).toBeUndefined();
        expect(discriminatedUnionValueForTab(labels, "kind", 0)).toEqual({
            kind: "a",
        });
    });
});
