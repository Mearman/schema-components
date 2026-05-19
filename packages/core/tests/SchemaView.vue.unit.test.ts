/**
 * `<SchemaView>` — read-only Vue renderer tests.
 *
 * Mirrors `react/SchemaView.tsx`'s coverage: every scalar and
 * structural field type, plus the "no `<input>` elements ever
 * appear" invariant that distinguishes the read-only view from the
 * full `<SchemaComponent>`.
 */

import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { z } from "zod";
import SchemaView from "../src/vue/SchemaView.vue";

describe("<SchemaView>", () => {
    it("renders a string value", () => {
        const wrapper = mount(SchemaView, {
            props: { schema: z.string(), value: "hello" },
        });
        expect(wrapper.text()).toContain("hello");
        expect(wrapper.find("input").exists()).toBe(false);
    });

    it("renders an email value as a mailto link", () => {
        const wrapper = mount(SchemaView, {
            props: { schema: z.email(), value: "ada@example.com" },
        });
        const a = wrapper.find("a");
        expect(a.attributes("href")).toBe("mailto:ada@example.com");
    });

    it("renders a number value", () => {
        const wrapper = mount(SchemaView, {
            props: { schema: z.number(), value: 123 },
        });
        expect(wrapper.text()).toContain("123");
    });

    it("renders a boolean as Yes / No", () => {
        const yes = mount(SchemaView, {
            props: { schema: z.boolean(), value: true },
        });
        const no = mount(SchemaView, {
            props: { schema: z.boolean(), value: false },
        });
        expect(yes.text()).toBe("Yes");
        expect(no.text()).toBe("No");
    });

    it("renders an enum value (no <select>)", () => {
        const wrapper = mount(SchemaView, {
            props: {
                schema: z.enum(["admin", "editor", "viewer"]),
                value: "editor",
            },
        });
        expect(wrapper.text()).toContain("editor");
        expect(wrapper.find("select").exists()).toBe(false);
    });

    it("renders an object value with one label per field", () => {
        const wrapper = mount(SchemaView, {
            props: {
                schema: z.object({
                    name: z.string(),
                    age: z.number(),
                }),
                value: { name: "Ada", age: 36 },
            },
        });
        expect(wrapper.text()).toContain("Ada");
        expect(wrapper.text()).toContain("36");
        expect(wrapper.find("input").exists()).toBe(false);
        // Two labels (one per field).
        expect(wrapper.findAll("label").length).toBe(2);
    });

    it("renders an array value as a <ul>", () => {
        const wrapper = mount(SchemaView, {
            props: {
                schema: z.array(z.string()),
                value: ["red", "green", "blue"],
            },
        });
        expect(wrapper.find("ul").exists()).toBe(true);
        expect(wrapper.findAll("li").length).toBe(3);
    });

    it("renders a missing value as an em-dash placeholder", () => {
        const wrapper = mount(SchemaView, {
            props: { schema: z.string() },
        });
        expect(wrapper.text()).toContain("—");
    });

    it("honours a deterministic idPrefix", () => {
        const wrapper = mount(SchemaView, {
            props: {
                schema: z.string(),
                value: "x",
                idPrefix: "stable",
            },
        });
        expect(wrapper.find("span").attributes("id")).toBe("sc-stable");
    });
});
