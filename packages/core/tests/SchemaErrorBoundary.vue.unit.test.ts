/**
 * `<SchemaErrorBoundary>` tests.
 *
 * Verifies that a child component throwing during render is captured
 * and routed through the `fallback` slot, and that calling the
 * supplied `reset` callback clears the captured error so the
 * boundary re-renders its default slot.
 */

import { describe, expect, it } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";
import { mount } from "@vue/test-utils";
import SchemaErrorBoundary from "../src/vue/SchemaErrorBoundary.vue";

const Thrower = defineComponent({
    name: "Thrower",
    props: {
        message: { type: String, default: "boom" },
        shouldThrow: { type: Boolean, default: true },
    },
    setup(props) {
        return () => {
            if (props.shouldThrow) {
                throw new Error(props.message);
            }
            return h("span", undefined, "ok");
        };
    },
});

describe("<SchemaErrorBoundary>", () => {
    it("invokes the fallback slot when a child throws", async () => {
        const Parent = defineComponent({
            components: { SchemaErrorBoundary, Thrower },
            template: `
                <SchemaErrorBoundary>
                    <template #default>
                        <Thrower />
                    </template>
                    <template #fallback="{ error }">
                        error: {{ error.message }}
                    </template>
                </SchemaErrorBoundary>
            `,
        });
        const wrapper = mount(Parent, {
            global: {
                config: {
                    errorHandler: () => {
                        /* swallow */
                    },
                },
            },
        });
        // `onErrorCaptured` fires inside the child's render phase and
        // toggles the boundary's `captured` ref; Vue queues the
        // re-render so the fallback slot only appears after the next
        // tick.
        await nextTick();
        expect(wrapper.text()).toContain("error: boom");
    });

    it("renders the default slot when no error is captured", () => {
        const wrapper = mount(SchemaErrorBoundary, {
            slots: {
                default: () => h("span", undefined, "everything ok"),
                fallback: () => h("span", undefined, "should not appear"),
            },
        });
        expect(wrapper.text()).toBe("everything ok");
    });

    it("can be reset by the fallback slot", async () => {
        const shouldThrow = ref(true);
        const Parent = defineComponent({
            components: { SchemaErrorBoundary, Thrower },
            setup() {
                return { shouldThrow };
            },
            template: `
                <SchemaErrorBoundary>
                    <template #default>
                        <Thrower :should-throw="shouldThrow" />
                    </template>
                    <template #fallback="{ reset }">
                        <button class="reset" @click="reset()">reset</button>
                    </template>
                </SchemaErrorBoundary>
            `,
        });
        const wrapper = mount(Parent, {
            global: {
                config: {
                    errorHandler: () => {
                        /* swallow */
                    },
                },
            },
        });
        // Wait for the post-throw re-render that surfaces the fallback
        // slot containing the reset button.
        await nextTick();
        expect(wrapper.find("button.reset").exists()).toBe(true);
        shouldThrow.value = false;
        await wrapper.find("button.reset").trigger("click");
        await nextTick();
        expect(wrapper.text()).toBe("ok");
    });
});
