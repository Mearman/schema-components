/**
 * `<SchemaComponent>` end-to-end tests.
 *
 * Mounts a kitchen-sink-ish Zod schema, asserts every field type
 * produces sensible Vue markup, and exercises both the `v-model` /
 * `@change` event surface and the React-parallel `onChange` prop
 * surface.
 */

import { describe, expect, it } from "vitest";
import { defineComponent, ref } from "vue";
import { mount } from "@vue/test-utils";
import { z } from "zod";
import SchemaComponent from "../src/vue/SchemaComponent.vue";

describe("<SchemaComponent>", () => {
    it("renders a string input with the supplied value", () => {
        const wrapper = mount(SchemaComponent, {
            props: {
                schema: z.string(),
                modelValue: "hello",
            },
        });
        const input = wrapper.find("input");
        expect(input.exists()).toBe(true);
        expect(input.element.value).toBe("hello");
    });

    it("emits update:modelValue when the input changes", async () => {
        const wrapper = mount(SchemaComponent, {
            props: {
                schema: z.string(),
                modelValue: "before",
            },
        });
        const input = wrapper.find("input");
        await input.setValue("after");
        expect(wrapper.emitted("update:modelValue")?.[0]).toEqual(["after"]);
        expect(wrapper.emitted("change")?.[0]).toEqual(["after"]);
    });

    it("also invokes a React-parallel onChange callback", async () => {
        const captured: unknown[] = [];
        const wrapper = mount(SchemaComponent, {
            props: {
                schema: z.string(),
                modelValue: "",
                onChange: (v: unknown) => {
                    captured.push(v);
                },
            },
        });
        await wrapper.find("input").setValue("captured");
        expect(captured).toEqual(["captured"]);
    });

    it("renders a number input", () => {
        const wrapper = mount(SchemaComponent, {
            props: {
                schema: z.number(),
                modelValue: 42,
            },
        });
        const input = wrapper.find("input");
        expect(input.attributes("type")).toBe("number");
    });

    it("renders a checkbox for booleans", () => {
        const wrapper = mount(SchemaComponent, {
            props: {
                schema: z.boolean(),
                modelValue: true,
            },
        });
        const input = wrapper.find("input");
        expect(input.attributes("type")).toBe("checkbox");
    });

    it("renders a <select> for enums", () => {
        const wrapper = mount(SchemaComponent, {
            props: {
                schema: z.enum(["a", "b", "c"]),
                modelValue: "a",
            },
        });
        expect(wrapper.find("select").exists()).toBe(true);
        expect(wrapper.findAll("option").length).toBe(4);
    });

    it("renders an object schema as a fieldset with one input per field", () => {
        const wrapper = mount(SchemaComponent, {
            props: {
                schema: z.object({
                    name: z.string(),
                    age: z.number(),
                }),
                modelValue: { name: "Ada", age: 30 },
            },
        });
        expect(wrapper.find("fieldset").exists()).toBe(true);
        expect(wrapper.findAll("input").length).toBe(2);
    });

    it("renders an array schema with an Add button", () => {
        const wrapper = mount(SchemaComponent, {
            props: {
                schema: z.array(z.string()),
                modelValue: ["a", "b"],
            },
        });
        const addButton = wrapper
            .findAll("button")
            .find((b) => b.text() === "Add");
        expect(addButton?.exists()).toBe(true);
    });

    it("respects the readOnly prop on the root", () => {
        const wrapper = mount(SchemaComponent, {
            props: {
                schema: z.object({ name: z.string() }),
                modelValue: { name: "Ada" },
                readOnly: true,
            },
        });
        // Read-only renders <span>, not <input>.
        expect(wrapper.find("input").exists()).toBe(false);
        expect(wrapper.text()).toContain("Ada");
    });

    it("treats undefined modelValue as the schema default", () => {
        const wrapper = mount(SchemaComponent, {
            props: {
                schema: z.string().default("preset"),
                modelValue: undefined,
            },
        });
        expect(wrapper.find("input").element.value).toBe("preset");
    });

    it("composes with a parent component using v-model", async () => {
        const Parent = defineComponent({
            components: { SchemaComponent },
            template: `
                <SchemaComponent :schema="schema" v-model="value" />
            `,
            setup() {
                const schema = z.string();
                const value = ref("initial");
                return { schema, value };
            },
        });
        const wrapper = mount(Parent);
        await wrapper.find("input").setValue("updated");
        expect((wrapper.vm as unknown as { value: string }).value).toBe(
            "updated"
        );
    });

    it("honours an explicit idPrefix for deterministic ids", () => {
        const wrapper = mount(SchemaComponent, {
            props: {
                schema: z.string(),
                modelValue: "x",
                idPrefix: "stable",
            },
        });
        expect(wrapper.find("input").attributes("id")).toBe("sc-stable");
    });

    it("resolves the schemaRef sub-schema of an OpenAPI document, not the first schema", () => {
        // Two distinct sub-schemas under components/schemas. `User` is
        // first; if the renderer ignored or stripped `schemaRef`, the
        // adapter would normalise the whole document and surface `User`
        // (or the union of both). The test points `schemaRef` at
        // `Animal` and asserts only `Animal`'s fields render.
        const openApiDoc = {
            openapi: "3.1.0",
            info: { title: "Zoo", version: "1.0" },
            paths: {},
            components: {
                schemas: {
                    User: {
                        type: "object",
                        properties: {
                            userName: { type: "string" },
                            userEmail: { type: "string" },
                        },
                        required: ["userName", "userEmail"],
                    },
                    Animal: {
                        type: "object",
                        properties: {
                            species: { type: "string" },
                            legCount: { type: "number" },
                        },
                        required: ["species", "legCount"],
                    },
                },
            },
        };
        const wrapper = mount(SchemaComponent, {
            props: {
                schema: openApiDoc,
                schemaRef: "#/components/schemas/Animal",
                modelValue: { species: "Octopus", legCount: 8 },
            },
        });
        // The resolved sub-schema is Animal — two inputs, one per property.
        const inputs = wrapper.findAll("input");
        expect(inputs.length).toBe(2);
        // The first input carries Animal's string field value.
        expect(inputs[0]?.element.value).toBe("Octopus");
        expect(inputs[0]?.attributes("type")).not.toBe("number");
        // The second input is the numeric leg count.
        expect(inputs[1]?.attributes("type")).toBe("number");
        expect(inputs[1]?.element.value).toBe("8");
        // None of User's fields should appear in the rendered output.
        const html = wrapper.html();
        expect(html).not.toContain("userName");
        expect(html).not.toContain("userEmail");
    });
});
