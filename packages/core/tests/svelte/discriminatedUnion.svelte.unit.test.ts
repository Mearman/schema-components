/**
 * Unit tests for the Svelte 5 discriminated-union tabs widget.
 *
 * Covers:
 *   1. Tablist rendering — one tab per option, correct
 *      `aria-selected` / `role="tab"` / `aria-controls` wiring.
 *   2. Click activation — clicking a tab fires the expected
 *      `onChange({ [discKey]: label })` payload.
 *   3. Keyboard activation — ArrowRight / ArrowLeft / Home / End
 *      move between tabs, wrapping at extremes.
 *   4. The pure helpers `discriminatedUnionValueForTab` and
 *      `wrapTabIndex` behave correctly in isolation.
 */

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/svelte";
import DiscriminatedUnion from "../../src/svelte/renderers/DiscriminatedUnion.svelte";
import type { SvelteRenderProps } from "../../src/svelte/types.ts";
import type { WalkedField } from "../../src/core/types.ts";
import {
    discriminatedUnionValueForTab,
    wrapTabIndex,
} from "../../src/svelte/headlessFns.ts";
import StringSvelte from "../../src/svelte/renderers/String.svelte";

afterEach(() => {
    cleanup();
});

/**
 * Assert that `element` is present and return it narrowed.
 * Replaces the `!` non-null assertion the lint rule
 * `@typescript-eslint/no-non-null-assertion` bans in tests.
 */
function requireElement<E extends Element>(element: E | null | undefined): E {
    if (element === null || element === undefined) {
        throw new Error("Expected element to be present in the DOM.");
    }
    return element;
}

function leaf(): WalkedField {
    return {
        type: "string",
        meta: {},
        constraints: {},
        isOptional: false,
        editability: "editable",
    } as unknown as WalkedField;
}

function buildOption(label: string): WalkedField {
    return {
        type: "object",
        meta: {},
        constraints: {},
        isOptional: false,
        editability: "editable",
        requiredFields: ["kind"],
        fields: {
            kind: {
                type: "literal",
                meta: {},
                constraints: {},
                isOptional: false,
                editability: "editable",
                literalValues: [label],
            } as unknown as WalkedField,
        },
    } as unknown as WalkedField;
}

function buildProps(
    tree: WalkedField,
    value: unknown,
    onChange: (v: unknown) => void
): SvelteRenderProps {
    return {
        tree,
        value,
        onChange,
        readOnly: false,
        writeOnly: false,
        meta: tree.meta,
        constraints: tree.constraints,
        path: "test",
        renderChild: (childTree, childValue, childOnChange) => {
            return {
                component: StringSvelte,
                props: {
                    tree: leaf(),
                    value: childValue,
                    onChange: childOnChange,
                    readOnly: false,
                    writeOnly: false,
                    meta: {},
                    constraints: {},
                    path: "child",
                    renderChild: () => null,
                },
            };
        },
    };
}

describe("DiscriminatedUnion — pure helpers", () => {
    it("discriminatedUnionValueForTab returns the labelled value", () => {
        const out = discriminatedUnionValueForTab(["a", "b", "c"], "kind", 1);
        expect(out).toEqual({ kind: "b" });
    });

    it("discriminatedUnionValueForTab returns undefined on out-of-bounds index", () => {
        expect(
            discriminatedUnionValueForTab(["a"], "kind", -1)
        ).toBeUndefined();
        expect(discriminatedUnionValueForTab(["a"], "kind", 5)).toBeUndefined();
    });

    it("wrapTabIndex wraps around the bounds with floored modulo", () => {
        expect(wrapTabIndex(0, 3)).toBe(0);
        expect(wrapTabIndex(3, 3)).toBe(0);
        expect(wrapTabIndex(-1, 3)).toBe(2);
        expect(wrapTabIndex(4, 3)).toBe(1);
    });
});

describe("DiscriminatedUnion — render", () => {
    it("renders one tab per option with correct ARIA wiring", () => {
        const optionA = buildOption("a");
        const optionB = buildOption("b");
        const tree = {
            type: "discriminatedUnion",
            meta: {},
            constraints: {},
            isOptional: false,
            editability: "editable",
            options: [optionA, optionB],
            discriminator: "kind",
        } as unknown as WalkedField;

        const { container } = render(DiscriminatedUnion, {
            props: buildProps(tree, { kind: "a" }, () => {
                /* noop */
            }),
        });

        const tablist = container.querySelector('[role="tablist"]');
        expect(tablist).not.toBeNull();
        const tabs = container.querySelectorAll('[role="tab"]');
        expect(tabs.length).toBe(2);
        expect(tabs[0]?.getAttribute("aria-selected")).toBe("true");
        expect(tabs[1]?.getAttribute("aria-selected")).toBe("false");
        // Roving tabindex: active tab is 0, inactive is -1.
        expect(tabs[0]?.getAttribute("tabindex")).toBe("0");
        expect(tabs[1]?.getAttribute("tabindex")).toBe("-1");

        const tabPanel = container.querySelector('[role="tabpanel"]');
        expect(tabPanel).not.toBeNull();
    });

    it("fires onChange({ [discKey]: label }) when a tab is clicked", async () => {
        const optionA = buildOption("a");
        const optionB = buildOption("b");
        const tree = {
            type: "discriminatedUnion",
            meta: {},
            constraints: {},
            isOptional: false,
            editability: "editable",
            options: [optionA, optionB],
            discriminator: "kind",
        } as unknown as WalkedField;

        const calls: unknown[] = [];
        const { container } = render(DiscriminatedUnion, {
            props: buildProps(tree, { kind: "a" }, (v) => {
                calls.push(v);
            }),
        });

        const tabs = container.querySelectorAll('[role="tab"]');
        await fireEvent.click(requireElement(tabs[1]));
        expect(calls[calls.length - 1]).toEqual({ kind: "b" });
    });

    it("ArrowRight moves activation forward with wrap", async () => {
        const optionA = buildOption("a");
        const optionB = buildOption("b");
        const tree = {
            type: "discriminatedUnion",
            meta: {},
            constraints: {},
            isOptional: false,
            editability: "editable",
            options: [optionA, optionB],
            discriminator: "kind",
        } as unknown as WalkedField;

        const calls: unknown[] = [];
        const { container } = render(DiscriminatedUnion, {
            props: buildProps(tree, { kind: "a" }, (v) => {
                calls.push(v);
            }),
        });

        const tablist = container.querySelector('[role="tablist"]');
        await fireEvent.keyDown(requireElement(tablist), { key: "ArrowRight" });
        expect(calls[calls.length - 1]).toEqual({ kind: "b" });
    });

    it("Home jumps to the first tab", async () => {
        const optionA = buildOption("a");
        const optionB = buildOption("b");
        const optionC = buildOption("c");
        const tree = {
            type: "discriminatedUnion",
            meta: {},
            constraints: {},
            isOptional: false,
            editability: "editable",
            options: [optionA, optionB, optionC],
            discriminator: "kind",
        } as unknown as WalkedField;

        const calls: unknown[] = [];
        const { container } = render(DiscriminatedUnion, {
            props: buildProps(tree, { kind: "c" }, (v) => {
                calls.push(v);
            }),
        });

        const tablist = container.querySelector('[role="tablist"]');
        await fireEvent.keyDown(requireElement(tablist), { key: "Home" });
        expect(calls[calls.length - 1]).toEqual({ kind: "a" });
    });

    it("End jumps to the last tab", async () => {
        const optionA = buildOption("a");
        const optionB = buildOption("b");
        const optionC = buildOption("c");
        const tree = {
            type: "discriminatedUnion",
            meta: {},
            constraints: {},
            isOptional: false,
            editability: "editable",
            options: [optionA, optionB, optionC],
            discriminator: "kind",
        } as unknown as WalkedField;

        const calls: unknown[] = [];
        const { container } = render(DiscriminatedUnion, {
            props: buildProps(tree, { kind: "a" }, (v) => {
                calls.push(v);
            }),
        });

        const tablist = container.querySelector('[role="tablist"]');
        await fireEvent.keyDown(requireElement(tablist), { key: "End" });
        expect(calls[calls.length - 1]).toEqual({ kind: "c" });
    });
});
