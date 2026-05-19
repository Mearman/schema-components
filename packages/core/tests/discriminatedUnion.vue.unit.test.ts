/**
 * Tab keyboard navigation, ARIA wiring, and active-index semantics
 * for the Vue discriminated-union tabs widget.
 *
 * Mirrors the React `headlessRenderers` discriminated-union test
 * coverage. A real `<SchemaComponent>` is mounted with a
 * discriminated union so the widget initialises with its full
 * surface (refs, key handlers, focus state machine).
 */

import { describe, expect, it } from "vitest";
import { defineComponent, ref } from "vue";
import { mount } from "@vue/test-utils";
import { z } from "zod";
import SchemaComponent from "../src/vue/SchemaComponent.vue";
import { discriminatedUnionValueForTab } from "../src/vue/renderers.ts";

const unionSchema = z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("text"), value: z.string() }),
    z.object({ kind: z.literal("number"), value: z.number() }),
    z.object({ kind: z.literal("flag"), value: z.boolean() }),
]);

function mountUnion(value: unknown = { kind: "text", value: "hi" }) {
    const Holder = defineComponent({
        components: { SchemaComponent },
        template: `<SchemaComponent :schema="unionSchema" v-model="model" />`,
        setup() {
            const model = ref(value);
            return { unionSchema, model };
        },
    });
    return mount(Holder);
}

describe("discriminated-union tabs", () => {
    it("renders one tab per option with the correct ARIA attributes", () => {
        const wrapper = mountUnion();
        const tablist = wrapper.find('[role="tablist"]');
        expect(tablist.exists()).toBe(true);
        const tabs = wrapper.findAll('[role="tab"]');
        expect(tabs.length).toBe(3);
        // Every tab carries an aria-selected literal (true / false) —
        // never omitted.
        for (const tab of tabs) {
            const ariaSelected = tab.attributes("aria-selected");
            expect(ariaSelected === "true" || ariaSelected === "false").toBe(
                true
            );
        }
        // Exactly one tab is selected.
        const selected = tabs.filter(
            (t) => t.attributes("aria-selected") === "true"
        );
        expect(selected.length).toBe(1);
    });

    it("renders a tabpanel whose aria-labelledby points to the active tab", () => {
        const wrapper = mountUnion();
        const panel = wrapper.find('[role="tabpanel"]');
        expect(panel.exists()).toBe(true);
        const labelledBy = panel.attributes("aria-labelledby");
        expect(labelledBy).toBeDefined();
        const referenced = labelledBy
            ? wrapper.find(`#${labelledBy}`)
            : undefined;
        expect(referenced?.exists()).toBe(true);
        expect(referenced?.attributes("role")).toBe("tab");
    });

    it("activates the next tab on ArrowRight", async () => {
        const wrapper = mountUnion();
        const tablist = wrapper.find('[role="tablist"]');
        await tablist.trigger("keydown", { key: "ArrowRight" });
        const tabs = wrapper.findAll('[role="tab"]');
        // After the first ArrowRight, tab index 1 should be selected.
        expect(tabs[1]?.attributes("aria-selected")).toBe("true");
        expect(tabs[0]?.attributes("aria-selected")).toBe("false");
    });

    it("wraps around from the last tab on ArrowRight", async () => {
        const wrapper = mountUnion({ kind: "flag", value: true });
        const tablist = wrapper.find('[role="tablist"]');
        await tablist.trigger("keydown", { key: "ArrowRight" });
        const tabs = wrapper.findAll('[role="tab"]');
        expect(tabs[0]?.attributes("aria-selected")).toBe("true");
    });

    it("activates the previous tab on ArrowLeft (wrapping)", async () => {
        const wrapper = mountUnion();
        const tablist = wrapper.find('[role="tablist"]');
        await tablist.trigger("keydown", { key: "ArrowLeft" });
        const tabs = wrapper.findAll('[role="tab"]');
        // From index 0, ArrowLeft wraps to the last tab.
        expect(tabs[tabs.length - 1]?.attributes("aria-selected")).toBe("true");
    });

    it("Home jumps to the first tab; End jumps to the last", async () => {
        const wrapper = mountUnion({ kind: "number", value: 42 });
        const tablist = wrapper.find('[role="tablist"]');

        await tablist.trigger("keydown", { key: "End" });
        let tabs = wrapper.findAll('[role="tab"]');
        expect(tabs[tabs.length - 1]?.attributes("aria-selected")).toBe("true");

        await tablist.trigger("keydown", { key: "Home" });
        tabs = wrapper.findAll('[role="tab"]');
        expect(tabs[0]?.attributes("aria-selected")).toBe("true");
    });

    it("uses roving tabindex (active tab tabindex=0, rest -1)", () => {
        const wrapper = mountUnion();
        const tabs = wrapper.findAll('[role="tab"]');
        const tabIndices = tabs.map((t) => t.attributes("tabindex"));
        const zeros = tabIndices.filter((v) => v === "0");
        const negatives = tabIndices.filter((v) => v === "-1");
        expect(zeros.length).toBe(1);
        expect(negatives.length).toBe(tabs.length - 1);
    });

    it("ignores irrelevant keys", async () => {
        const wrapper = mountUnion();
        const tablist = wrapper.find('[role="tablist"]');
        const before = wrapper.find('[aria-selected="true"]').attributes("id");
        await tablist.trigger("keydown", { key: "Tab" });
        await tablist.trigger("keydown", { key: " " });
        await tablist.trigger("keydown", { key: "x" });
        const after = wrapper.find('[aria-selected="true"]').attributes("id");
        expect(after).toBe(before);
    });
});

describe("discriminatedUnionValueForTab helper", () => {
    it("returns the discriminator object for a valid index", () => {
        expect(discriminatedUnionValueForTab(["a", "b"], "kind", 0)).toEqual({
            kind: "a",
        });
    });

    it("returns undefined for an out-of-range index", () => {
        expect(
            discriminatedUnionValueForTab(["a", "b"], "kind", 5)
        ).toBeUndefined();
    });
});
