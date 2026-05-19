/**
 * Direct tests for the Vue headless renderer functions.
 *
 * Mirrors the React headless renderer tests — each function gets a
 * minimal `VueRenderProps` fixture, the render output is mounted
 * through `@vue/test-utils`, and the resulting markup is asserted
 * against the same accessibility and structural rules the React
 * adapter guarantees.
 */

import { describe, expect, it } from "vitest";
import { defineComponent, h, type VNode } from "vue";
import { mount } from "@vue/test-utils";
import {
    renderArray,
    renderBoolean,
    renderConditional,
    renderDiscriminatedUnion,
    renderEnum,
    renderFile,
    renderLiteral,
    renderNegation,
    renderNever,
    renderNull,
    renderNumber,
    renderObject,
    renderRecord,
    renderString,
    renderTuple,
    renderUnion,
    renderUnknown,
    discriminatedUnionValueForTab,
    defaultRecordValue,
    nextRecordKey,
    renameRecordKey,
    inputId,
} from "../src/vue/renderers.ts";
import type { VueRenderProps } from "../src/vue/types.ts";
import type { WalkedField } from "../src/core/types.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ROOT_PATH = "test";

function noopChange(): void {
    /* no-op */
}

function noopRenderChild(_: WalkedField, value: unknown): VNode {
    return h("span", { class: "child" }, String(value));
}

function defaultMeta(): VueRenderProps["meta"] {
    return {};
}

function defaultConstraints(): VueRenderProps["constraints"] {
    return {};
}

function makeProps(
    overrides: Partial<VueRenderProps> & Pick<VueRenderProps, "tree">
): VueRenderProps {
    return {
        value: undefined,
        readOnly: false,
        writeOnly: false,
        meta: defaultMeta(),
        constraints: defaultConstraints(),
        path: ROOT_PATH,
        onChange: noopChange,
        renderChild: noopRenderChild,
        ...overrides,
    };
}

/**
 * Mount a render function's output via a thin host component so
 * `@vue/test-utils` can attach selector helpers. Returns the
 * `VueWrapper`.
 */
function mountRender(node: VNode) {
    const Host = defineComponent({
        setup: () => () => node,
    });
    return mount(Host);
}

// ---------------------------------------------------------------------------
// renderString
// ---------------------------------------------------------------------------

describe("renderString", () => {
    const stringTree: WalkedField = {
        type: "string",
        meta: defaultMeta(),
        constraints: defaultConstraints(),
        isOptional: false,
        editability: "editable",
    } as unknown as WalkedField;

    it("renders an <input> in editable mode", () => {
        const node = renderString(
            makeProps({ tree: stringTree, value: "hello" })
        );
        const wrapper = mountRender(node);
        const input = wrapper.find("input");
        expect(input.exists()).toBe(true);
        expect(input.element.value).toBe("hello");
        expect(input.attributes("id")).toBe(inputId(ROOT_PATH));
    });

    it("renders read-only value as a <span>", () => {
        const node = renderString(
            makeProps({ tree: stringTree, value: "hello", readOnly: true })
        );
        const wrapper = mountRender(node);
        expect(wrapper.find("span").exists()).toBe(true);
        expect(wrapper.text()).toBe("hello");
    });

    it("renders an em-dash for empty read-only string", () => {
        const node = renderString(
            makeProps({ tree: stringTree, value: undefined, readOnly: true })
        );
        const wrapper = mountRender(node);
        expect(wrapper.text()).toBe("—");
    });

    it("renders an email value as a mailto link in read-only mode", () => {
        const node = renderString(
            makeProps({
                tree: stringTree,
                value: "ada@example.com",
                readOnly: true,
                constraints: { format: "email" },
            })
        );
        const wrapper = mountRender(node);
        const a = wrapper.find("a");
        expect(a.exists()).toBe(true);
        expect(a.attributes("href")).toBe("mailto:ada@example.com");
    });
});

// ---------------------------------------------------------------------------
// renderNumber
// ---------------------------------------------------------------------------

describe("renderNumber", () => {
    const numberTree: WalkedField = {
        type: "number",
        isInteger: false,
        meta: defaultMeta(),
        constraints: defaultConstraints(),
        isOptional: false,
        editability: "editable",
    } as unknown as WalkedField;

    it("renders a number input with the supplied value", () => {
        const node = renderNumber(makeProps({ tree: numberTree, value: 42 }));
        const wrapper = mountRender(node);
        const input = wrapper.find("input");
        expect(input.exists()).toBe(true);
        expect(input.attributes("type")).toBe("number");
        expect(Number(input.element.value)).toBe(42);
    });

    it("renders read-only numbers as a formatted span", () => {
        const node = renderNumber(
            makeProps({ tree: numberTree, value: 1234, readOnly: true })
        );
        const wrapper = mountRender(node);
        expect(wrapper.find("input").exists()).toBe(false);
        expect(wrapper.text()).toContain("1,234");
    });

    it("emits the parsed number on input", async () => {
        let last: unknown = undefined;
        const props = makeProps({
            tree: numberTree,
            value: 0,
            onChange: (v) => {
                last = v;
            },
        });
        const node = renderNumber(props);
        const wrapper = mountRender(node);
        const input = wrapper.find("input");
        await input.setValue(7);
        expect(last).toBe(7);
    });
});

// ---------------------------------------------------------------------------
// renderBoolean
// ---------------------------------------------------------------------------

describe("renderBoolean", () => {
    const booleanTree: WalkedField = {
        type: "boolean",
        meta: defaultMeta(),
        constraints: defaultConstraints(),
        isOptional: false,
        editability: "editable",
    } as unknown as WalkedField;

    it("renders a checkbox checked when value is true", () => {
        const node = renderBoolean(
            makeProps({ tree: booleanTree, value: true })
        );
        const wrapper = mountRender(node);
        const input = wrapper.find("input");
        expect(input.attributes("type")).toBe("checkbox");
        expect((input.element as HTMLInputElement).checked).toBe(true);
    });

    it("renders Yes/No in read-only mode", () => {
        const trueNode = renderBoolean(
            makeProps({
                tree: booleanTree,
                value: true,
                readOnly: true,
            })
        );
        const falseNode = renderBoolean(
            makeProps({
                tree: booleanTree,
                value: false,
                readOnly: true,
            })
        );
        expect(mountRender(trueNode).text()).toBe("Yes");
        expect(mountRender(falseNode).text()).toBe("No");
    });
});

// ---------------------------------------------------------------------------
// renderEnum
// ---------------------------------------------------------------------------

describe("renderEnum", () => {
    const enumTree: WalkedField = {
        type: "enum",
        enumValues: ["admin", "editor", "viewer"],
        meta: defaultMeta(),
        constraints: defaultConstraints(),
        isOptional: false,
        editability: "editable",
    } as unknown as WalkedField;

    it("renders a <select> with each enum option", () => {
        const node = renderEnum(makeProps({ tree: enumTree, value: "editor" }));
        const wrapper = mountRender(node);
        expect(wrapper.find("select").exists()).toBe(true);
        const options = wrapper.findAll("option");
        // Default placeholder + 3 enum values.
        expect(options.length).toBe(4);
        expect(options[1]?.attributes("value")).toBe("admin");
    });

    it("renders read-only as a span containing the value", () => {
        const node = renderEnum(
            makeProps({
                tree: enumTree,
                value: "editor",
                readOnly: true,
            })
        );
        const wrapper = mountRender(node);
        expect(wrapper.find("select").exists()).toBe(false);
        expect(wrapper.text()).toBe("editor");
    });
});

// ---------------------------------------------------------------------------
// renderObject
// ---------------------------------------------------------------------------

describe("renderObject", () => {
    const objectTree: WalkedField = {
        type: "object",
        fields: {
            name: {
                type: "string",
                meta: { description: "Full name" },
                constraints: defaultConstraints(),
                isOptional: false,
                editability: "editable",
            } as unknown as WalkedField,
        },
        meta: defaultMeta(),
        constraints: defaultConstraints(),
        isOptional: false,
        editability: "editable",
    } as unknown as WalkedField;

    it("renders a <fieldset> with one row per field", () => {
        const node = renderObject(
            makeProps({
                tree: objectTree,
                value: { name: "Ada" },
                renderChild: (_, v) => h("input", { value: String(v) }),
            })
        );
        const wrapper = mountRender(node);
        expect(wrapper.find("fieldset").exists()).toBe(true);
        expect(wrapper.find("label").exists()).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// renderArray
// ---------------------------------------------------------------------------

describe("renderArray", () => {
    const stringElement: WalkedField = {
        type: "string",
        meta: defaultMeta(),
        constraints: defaultConstraints(),
        isOptional: false,
        editability: "editable",
    } as unknown as WalkedField;

    const arrayTree: WalkedField = {
        type: "array",
        element: stringElement,
        meta: defaultMeta(),
        constraints: defaultConstraints(),
        isOptional: false,
        editability: "editable",
    } as unknown as WalkedField;

    it("renders a row per array item plus an Add button", () => {
        const node = renderArray(
            makeProps({
                tree: arrayTree,
                value: ["a", "b"],
                renderChild: (_, v) => h("span", { class: "item" }, String(v)),
            })
        );
        const wrapper = mountRender(node);
        const items = wrapper.findAll("li");
        expect(items.length).toBe(2);
        const addButton = wrapper
            .findAll("button")
            .find((b) => b.text() === "Add");
        expect(addButton?.exists()).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// renderRecord
// ---------------------------------------------------------------------------

describe("renderRecord helpers", () => {
    it("nextRecordKey returns base when unused", () => {
        expect(nextRecordKey([])).toBe("key");
    });

    it("nextRecordKey appends -1 when base exists", () => {
        expect(nextRecordKey(["key"])).toBe("key-1");
    });

    it("renameRecordKey rejects collisions", () => {
        const obj = { a: 1, b: 2 };
        expect(renameRecordKey(obj, "a", "b")).toBe(obj);
    });

    it("defaultRecordValue returns 0 for number fields", () => {
        const tree = { type: "number" } as unknown as WalkedField;
        expect(defaultRecordValue(tree)).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// renderLiteral / renderNull / renderNever
// ---------------------------------------------------------------------------

describe("renderLiteral", () => {
    it("renders comma-joined literal values", () => {
        const tree = {
            type: "literal",
            literalValues: ["a", "b"],
            meta: defaultMeta(),
            constraints: defaultConstraints(),
            isOptional: true,
            editability: "presentation",
        } as unknown as WalkedField;
        const node = renderLiteral(makeProps({ tree }));
        expect(mountRender(node).text()).toBe("a, b");
    });
});

describe("renderNull", () => {
    it("renders an em-dash regardless of value", () => {
        const tree = {
            type: "null",
            meta: defaultMeta(),
            constraints: defaultConstraints(),
            isOptional: true,
            editability: "presentation",
        } as unknown as WalkedField;
        const node = renderNull(makeProps({ tree }));
        expect(mountRender(node).text()).toBe("—");
    });
});

describe("renderNever", () => {
    it("renders a 'never matches' indicator", () => {
        const tree = {
            type: "never",
            meta: defaultMeta(),
            constraints: defaultConstraints(),
            isOptional: false,
            editability: "presentation",
        } as unknown as WalkedField;
        const node = renderNever(makeProps({ tree }));
        expect(mountRender(node).text()).toContain("never matches");
    });
});

// ---------------------------------------------------------------------------
// renderUnknown
// ---------------------------------------------------------------------------

describe("renderUnknown", () => {
    const unknownTree = {
        type: "unknown",
        meta: defaultMeta(),
        constraints: defaultConstraints(),
        isOptional: false,
        editability: "editable",
    } as unknown as WalkedField;

    it("renders a text input in editable mode", () => {
        const node = renderUnknown(
            makeProps({ tree: unknownTree, value: "hi" })
        );
        const wrapper = mountRender(node);
        expect(wrapper.find("input").exists()).toBe(true);
    });

    it("stringifies non-string values in read-only mode", () => {
        const node = renderUnknown(
            makeProps({
                tree: unknownTree,
                value: { a: 1 },
                readOnly: true,
            })
        );
        expect(mountRender(node).text()).toBe('{"a":1}');
    });
});

// ---------------------------------------------------------------------------
// renderFile
// ---------------------------------------------------------------------------

describe("renderFile", () => {
    const fileTree = {
        type: "file",
        meta: defaultMeta(),
        constraints: { mimeTypes: ["image/png", "image/jpeg"] },
        isOptional: false,
        editability: "editable",
    } as unknown as WalkedField;

    it("renders a file input with the accept attribute", () => {
        const node = renderFile(
            makeProps({
                tree: fileTree,
                constraints: { mimeTypes: ["image/png", "image/jpeg"] },
            })
        );
        const wrapper = mountRender(node);
        const input = wrapper.find("input");
        expect(input.attributes("type")).toBe("file");
        expect(input.attributes("accept")).toBe("image/png,image/jpeg");
    });

    it("renders a 'File field' span in read-only mode", () => {
        const node = renderFile(
            makeProps({
                tree: fileTree,
                readOnly: true,
            })
        );
        expect(mountRender(node).text()).toContain("File field");
    });
});

// ---------------------------------------------------------------------------
// renderTuple
// ---------------------------------------------------------------------------

describe("renderTuple", () => {
    const tupleTree = {
        type: "tuple",
        prefixItems: [
            {
                type: "string",
                meta: defaultMeta(),
                constraints: defaultConstraints(),
                isOptional: false,
                editability: "editable",
            } as unknown as WalkedField,
            {
                type: "number",
                meta: defaultMeta(),
                constraints: defaultConstraints(),
                isOptional: false,
                editability: "editable",
            } as unknown as WalkedField,
        ],
        restItems: undefined,
        meta: defaultMeta(),
        constraints: defaultConstraints(),
        isOptional: false,
        editability: "editable",
    } as unknown as WalkedField;

    it("renders one row per prefix item", () => {
        const node = renderTuple(
            makeProps({
                tree: tupleTree,
                value: ["hi", 42],
                renderChild: (_, v) => h("span", { class: "cell" }, String(v)),
            })
        );
        const wrapper = mountRender(node);
        expect(wrapper.findAll("span.cell").length).toBe(2);
    });
});

// ---------------------------------------------------------------------------
// renderUnion
// ---------------------------------------------------------------------------

describe("renderUnion", () => {
    it("picks the matching option for a string value", () => {
        const stringOpt = {
            type: "string",
            meta: defaultMeta(),
            constraints: defaultConstraints(),
            isOptional: false,
            editability: "editable",
        } as unknown as WalkedField;
        const numberOpt = {
            type: "number",
            meta: defaultMeta(),
            constraints: defaultConstraints(),
            isOptional: false,
            editability: "editable",
        } as unknown as WalkedField;
        const tree = {
            type: "union",
            options: [stringOpt, numberOpt],
            meta: defaultMeta(),
            constraints: defaultConstraints(),
            isOptional: false,
            editability: "editable",
        } as unknown as WalkedField;
        let picked: WalkedField | undefined;
        const node = renderUnion(
            makeProps({
                tree,
                value: "hello",
                renderChild: (child, v) => {
                    picked = child;
                    return h("span", undefined, String(v));
                },
            })
        );
        mountRender(node);
        expect(picked?.type).toBe("string");
    });
});

// ---------------------------------------------------------------------------
// discriminated union helpers
// ---------------------------------------------------------------------------

describe("discriminatedUnionValueForTab", () => {
    it("returns a fresh discriminator value for a valid index", () => {
        expect(
            discriminatedUnionValueForTab(["a", "b", "c"], "kind", 1)
        ).toEqual({ kind: "b" });
    });

    it("returns undefined for an out-of-range index", () => {
        expect(discriminatedUnionValueForTab(["a"], "kind", 5)).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// renderConditional / renderNegation
// ---------------------------------------------------------------------------

describe("renderConditional", () => {
    it("renders if/then/else clauses when present", () => {
        const stringClause = {
            type: "string",
            meta: defaultMeta(),
            constraints: defaultConstraints(),
            isOptional: false,
            editability: "editable",
        } as unknown as WalkedField;
        const tree = {
            type: "conditional",
            ifClause: stringClause,
            thenClause: stringClause,
            elseClause: stringClause,
            meta: defaultMeta(),
            constraints: defaultConstraints(),
            isOptional: false,
            editability: "editable",
        } as unknown as WalkedField;
        const node = renderConditional(
            makeProps({
                tree,
                renderChild: () => h("span"),
            })
        );
        const wrapper = mountRender(node);
        expect(wrapper.text()).toContain("if:");
        expect(wrapper.text()).toContain("then:");
        expect(wrapper.text()).toContain("else:");
    });
});

describe("renderNegation", () => {
    it("renders the 'Must NOT match' preamble", () => {
        const tree = {
            type: "negation",
            negated: {
                type: "string",
                meta: defaultMeta(),
                constraints: defaultConstraints(),
                isOptional: false,
                editability: "editable",
            } as unknown as WalkedField,
            meta: defaultMeta(),
            constraints: defaultConstraints(),
            isOptional: false,
            editability: "editable",
        } as unknown as WalkedField;
        const node = renderNegation(
            makeProps({
                tree,
                renderChild: () => h("span"),
            })
        );
        expect(mountRender(node).text()).toContain("Must NOT match:");
    });
});

// ---------------------------------------------------------------------------
// renderRecord with read-only mode (smoke test on the path closure)
// ---------------------------------------------------------------------------

describe("renderRecord", () => {
    const recordTree = {
        type: "record",
        valueType: {
            type: "string",
            meta: defaultMeta(),
            constraints: defaultConstraints(),
            isOptional: false,
            editability: "editable",
        } as unknown as WalkedField,
        meta: defaultMeta(),
        constraints: defaultConstraints(),
        isOptional: false,
        editability: "editable",
    } as unknown as WalkedField;

    it("renders an em-dash for an empty read-only record", () => {
        const node = renderRecord(
            makeProps({
                tree: recordTree,
                value: {},
                readOnly: true,
            })
        );
        expect(mountRender(node).text()).toBe("—");
    });

    it("renders an Add button in editable mode", () => {
        const node = renderRecord(
            makeProps({
                tree: recordTree,
                value: { a: "1" },
                renderChild: (_, v) => h("span", undefined, String(v)),
            })
        );
        const wrapper = mountRender(node);
        const addButton = wrapper
            .findAll("button")
            .find((b) => b.text() === "Add");
        expect(addButton?.exists()).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// renderDiscriminatedUnion — smoke test (deeper keyboard tests live in
// `discriminatedUnion.vue.unit.test.ts`)
// ---------------------------------------------------------------------------

describe("renderDiscriminatedUnion", () => {
    it("renders a tablist for a discriminated union", () => {
        const optA = {
            type: "object",
            fields: {
                kind: {
                    type: "literal",
                    literalValues: ["a"],
                    meta: defaultMeta(),
                    constraints: defaultConstraints(),
                    isOptional: false,
                    editability: "presentation",
                } as unknown as WalkedField,
            },
            meta: defaultMeta(),
            constraints: defaultConstraints(),
            isOptional: false,
            editability: "editable",
        } as unknown as WalkedField;
        const optB = {
            type: "object",
            fields: {
                kind: {
                    type: "literal",
                    literalValues: ["b"],
                    meta: defaultMeta(),
                    constraints: defaultConstraints(),
                    isOptional: false,
                    editability: "presentation",
                } as unknown as WalkedField,
            },
            meta: defaultMeta(),
            constraints: defaultConstraints(),
            isOptional: false,
            editability: "editable",
        } as unknown as WalkedField;
        const tree = {
            type: "discriminatedUnion",
            options: [optA, optB],
            discriminator: "kind",
            meta: defaultMeta(),
            constraints: defaultConstraints(),
            isOptional: false,
            editability: "editable",
        } as unknown as WalkedField;
        const node = renderDiscriminatedUnion(
            makeProps({
                tree,
                value: { kind: "a" },
                renderChild: () => h("span", undefined, "child"),
            })
        );
        const wrapper = mountRender(node);
        expect(wrapper.find('[role="tablist"]').exists()).toBe(true);
        expect(wrapper.findAll('[role="tab"]').length).toBe(2);
    });
});
