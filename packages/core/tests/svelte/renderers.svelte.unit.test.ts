/**
 * Direct unit tests for each of the 16 headless Svelte 5 renderer
 * components. Each test instantiates one renderer with a hand-built
 * `WalkedField` and the minimum supporting props, then asserts on
 * the DOM the component produces.
 *
 * The walked field shapes mirror the React adapter's parallel tests
 * — same per-type contract, same expected output, just observed
 * through Svelte's render harness instead of React Testing Library.
 */

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/svelte";
import type {
    SvelteRenderDescriptor,
    SvelteRenderProps,
} from "../../src/svelte/types.ts";
import type { WalkedField } from "../../src/core/types.ts";
import StringSvelte from "../../src/svelte/renderers/String.svelte";
import NumberSvelte from "../../src/svelte/renderers/Number.svelte";
import BooleanSvelte from "../../src/svelte/renderers/Boolean.svelte";
import EnumSvelte from "../../src/svelte/renderers/Enum.svelte";
import ObjectSvelte from "../../src/svelte/renderers/Object.svelte";
import ArraySvelte from "../../src/svelte/renderers/Array.svelte";
import TupleSvelte from "../../src/svelte/renderers/Tuple.svelte";
import RecordSvelte from "../../src/svelte/renderers/Record.svelte";
import UnionSvelte from "../../src/svelte/renderers/Union.svelte";
import LiteralSvelte from "../../src/svelte/renderers/Literal.svelte";
import NullSvelte from "../../src/svelte/renderers/Null.svelte";
import NeverSvelte from "../../src/svelte/renderers/Never.svelte";
import ConditionalSvelte from "../../src/svelte/renderers/Conditional.svelte";
import NegationSvelte from "../../src/svelte/renderers/Negation.svelte";
import FileSvelte from "../../src/svelte/renderers/File.svelte";
import UnknownSvelte from "../../src/svelte/renderers/Unknown.svelte";

afterEach(() => {
    cleanup();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Assert the queried element exists and is an `HTMLInputElement`.
 * Throws on absence so test assertions narrow without `!` or `as`.
 */
function queryInput(container: ParentNode, selector: string): HTMLInputElement {
    const el = container.querySelector(selector);
    if (el === null) {
        throw new Error(`Expected to find input matching ${selector}.`);
    }
    if (!(el instanceof HTMLInputElement)) {
        throw new Error(
            `Expected element matching ${selector} to be an HTMLInputElement.`
        );
    }
    return el;
}

/**
 * Assert the queried element exists and is an `HTMLSelectElement`.
 */
function querySelect(container: ParentNode): HTMLSelectElement {
    const el = container.querySelector("select");
    if (el === null) {
        throw new Error("Expected to find a <select> element.");
    }
    if (!(el instanceof HTMLSelectElement)) {
        throw new Error("Expected <select> to be an HTMLSelectElement.");
    }
    return el;
}

// ---------------------------------------------------------------------------
// Walked-field fixtures
// ---------------------------------------------------------------------------

/**
 * Construct a `WalkedField`-shaped fixture for direct renderer
 * tests. The double-cast through `unknown` is necessary because
 * `WalkedField` is a discriminated union with per-variant required
 * fields (e.g. `TupleField.prefixItems`) — typing a generic helper
 * over the whole union forces a structural mismatch that
 * `exactOptionalPropertyTypes: true` declines to widen. The tests
 * compensate by always supplying the variant-specific keys
 * (`enumValues`, `fields`, `element`, …) alongside the `type`.
 */
function baseField(
    type: WalkedField["type"],
    overrides: Record<string, unknown> = {}
): WalkedField {
    return {
        type,
        meta: {},
        constraints: {},
        isOptional: false,
        editability: "editable",
        ...overrides,
    } as unknown as WalkedField;
}

function buildProps(
    tree: WalkedField,
    value: unknown,
    onChange: (v: unknown) => void = () => {
        /* noop */
    },
    overrides: Partial<SvelteRenderProps> = {}
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
        renderChild: () => null,
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// Per-renderer tests
// ---------------------------------------------------------------------------

describe("renderers — String", () => {
    it("renders an <input type=text> for editable string fields", () => {
        const tree = baseField("string", { constraints: {}, meta: {} });
        const { container } = render(StringSvelte, {
            props: buildProps(tree, "hello"),
        });
        const input = queryInput(container, "input");
        expect(input.getAttribute("type")).toBe("text");
        expect(input.value).toBe("hello");
    });

    it("renders a <span> in read-only mode", () => {
        const tree = baseField("string");
        const { container } = render(StringSvelte, {
            props: buildProps(
                tree,
                "hello",
                () => {
                    /* noop */
                },
                { readOnly: true }
            ),
        });
        expect(container.querySelector("input")).toBeNull();
        expect(container.textContent).toContain("hello");
    });
});

describe("renderers — Number", () => {
    it("renders an <input type=number> with min/max", () => {
        const tree = baseField("number", {
            constraints: { minimum: 0, maximum: 10 },
            isInteger: true,
        });
        const { container } = render(NumberSvelte, {
            props: buildProps(tree, 5),
        });
        const input = queryInput(container, "input");
        expect(input.getAttribute("type")).toBe("number");
        expect(input.value).toBe("5");
        expect(input.getAttribute("min")).toBe("0");
        expect(input.getAttribute("max")).toBe("10");
    });
});

describe("renderers — Boolean", () => {
    it("renders an <input type=checkbox>", () => {
        const tree = baseField("boolean");
        const { container } = render(BooleanSvelte, {
            props: buildProps(tree, true),
        });
        const input = queryInput(container, 'input[type="checkbox"]');
        expect(input.checked).toBe(true);
    });

    it("emits onChange(boolean) when toggled", async () => {
        let lastValue: unknown;
        const tree = baseField("boolean");
        const { container } = render(BooleanSvelte, {
            props: buildProps(tree, false, (v) => {
                lastValue = v;
            }),
        });
        const input = queryInput(container, 'input[type="checkbox"]');
        await fireEvent.click(input);
        expect(lastValue).toBe(true);
    });
});

describe("renderers — Enum", () => {
    it("renders a <select> with one <option> per enum value", () => {
        const tree = baseField("enum", {
            enumValues: ["a", "b", "c"],
        });
        const { container } = render(EnumSvelte, {
            props: buildProps(tree, "b"),
        });
        const select = querySelect(container);
        const options = container.querySelectorAll("option");
        // One placeholder option + three values.
        expect(options.length).toBe(4);
        expect(select.value).toBe("b");
    });
});

describe("renderers — Object", () => {
    it("renders a <fieldset> wrapping its child labels", () => {
        const childTree = baseField("string");
        const tree = baseField("object", {
            fields: { name: childTree },
            requiredFields: ["name"],
        });
        let renderedKey: string | undefined;
        const renderChild: SvelteRenderProps["renderChild"] = (
            childField,
            childValue,
            childOnChange,
            pathSuffix
        ) => {
            renderedKey = pathSuffix;
            return {
                component: StringSvelte,
                props: buildProps(childField, childValue, childOnChange),
            } satisfies SvelteRenderDescriptor;
        };

        const { container } = render(ObjectSvelte, {
            props: buildProps(
                tree,
                { name: "Ada" },
                () => {
                    /* noop */
                },
                { renderChild }
            ),
        });

        expect(container.querySelector("fieldset")).not.toBeNull();
        expect(renderedKey).toBe("name");
        const label = container.querySelector("label");
        const labelText = label?.textContent ?? "";
        expect(labelText).toContain("name");
    });
});

describe("renderers — Array", () => {
    it("renders a list with Add/Remove buttons in editable mode", () => {
        const elementTree = baseField("string");
        const tree = baseField("array", { element: elementTree });
        const renderChild: SvelteRenderProps["renderChild"] = (t, v, c) => ({
            component: StringSvelte,
            props: buildProps(t, v, c),
        });

        const { container } = render(ArraySvelte, {
            props: buildProps(
                tree,
                ["a", "b"],
                () => {
                    /* noop */
                },
                { renderChild }
            ),
        });
        const buttons = container.querySelectorAll("button");
        // 2 Remove + 1 Add
        expect(buttons.length).toBe(3);
    });

    it("renders nothing for an empty array in read-only mode", () => {
        const elementTree = baseField("string");
        const tree = baseField("array", { element: elementTree });
        const { container } = render(ArraySvelte, {
            props: buildProps(
                tree,
                [],
                () => {
                    /* noop */
                },
                { readOnly: true }
            ),
        });
        expect(container.querySelector("ul")).toBeNull();
    });
});

describe("renderers — Tuple", () => {
    it("renders each prefixItems entry positionally", () => {
        const a = baseField("string");
        const b = baseField("number");
        const tree = baseField("tuple", {
            prefixItems: [a, b],
        });
        const calls: string[] = [];
        const renderChild: SvelteRenderProps["renderChild"] = (
            t,
            v,
            c,
            pathSuffix
        ) => {
            calls.push(pathSuffix ?? "");
            return {
                component: StringSvelte,
                props: buildProps(t, v, c),
            };
        };
        render(TupleSvelte, {
            props: buildProps(
                tree,
                ["hello", 1],
                () => {
                    /* noop */
                },
                { renderChild }
            ),
        });
        expect(calls).toEqual(["[0]", "[1]"]);
    });
});

describe("renderers — Record", () => {
    it("renders key-input pairs with Remove buttons in editable mode", () => {
        const valueType = baseField("string");
        const tree = baseField("record", { valueType });
        const renderChild: SvelteRenderProps["renderChild"] = (t, v, c) => ({
            component: StringSvelte,
            props: buildProps(t, v, c),
        });
        const { container } = render(RecordSvelte, {
            props: buildProps(
                tree,
                { x: "1", y: "2" },
                () => {
                    /* noop */
                },
                { renderChild }
            ),
        });
        const removeButtons = container.querySelectorAll("button");
        // 2 Remove + 1 Add
        expect(removeButtons.length).toBe(3);
    });

    it("renders the em-dash placeholder for an empty record in read-only mode", () => {
        const valueType = baseField("string");
        const tree = baseField("record", { valueType });
        const { container } = render(RecordSvelte, {
            props: buildProps(
                tree,
                {},
                () => {
                    /* noop */
                },
                { readOnly: true }
            ),
        });
        expect(container.textContent).toContain("—");
    });
});

describe("renderers — Union", () => {
    it("renders the structurally matching option", () => {
        const optionA = baseField("string");
        const optionB = baseField("number");
        const tree = baseField("union", {
            options: [optionA, optionB],
        });
        let matchedType: string | undefined;
        const renderChild: SvelteRenderProps["renderChild"] = (
            childTree,
            v,
            c
        ) => {
            matchedType = childTree.type;
            return {
                component:
                    childTree.type === "number" ? NumberSvelte : StringSvelte,
                props: buildProps(childTree, v, c),
            };
        };
        render(UnionSvelte, {
            props: buildProps(
                tree,
                42,
                () => {
                    /* noop */
                },
                { renderChild }
            ),
        });
        expect(matchedType).toBe("number");
    });
});

describe("renderers — Literal", () => {
    it("renders the literal value as a span", () => {
        const tree = baseField("literal", { literalValues: ["fixed"] });
        const { container } = render(LiteralSvelte, {
            props: buildProps(tree, "fixed"),
        });
        const span = container.querySelector("span");
        expect(span?.textContent).toBe("fixed");
    });

    it("joins multiple literal values with comma-space", () => {
        const tree = baseField("literal", { literalValues: ["a", "b"] });
        const { container } = render(LiteralSvelte, {
            props: buildProps(tree, "a"),
        });
        const span = container.querySelector("span");
        expect(span?.textContent).toBe("a, b");
    });
});

describe("renderers — Null", () => {
    it("renders an em-dash placeholder", () => {
        const tree = baseField("null");
        const { container } = render(NullSvelte, {
            props: buildProps(tree, null),
        });
        expect(container.textContent).toBe("—");
    });
});

describe("renderers — Never", () => {
    it("renders the 'never matches' indicator", () => {
        const tree = baseField("never");
        const { container } = render(NeverSvelte, {
            props: buildProps(tree, undefined),
        });
        expect(container.textContent).toContain("never matches");
    });
});

describe("renderers — Conditional", () => {
    it("renders if/then/else clauses inside a fieldset", () => {
        const ifClause = baseField("string");
        const thenClause = baseField("string");
        const elseClause = baseField("string");
        const tree = baseField("conditional", {
            ifClause,
            thenClause,
            elseClause,
        });
        const renderChild: SvelteRenderProps["renderChild"] = (t, v, c) => ({
            component: StringSvelte,
            props: buildProps(t, v, c),
        });
        const { container } = render(ConditionalSvelte, {
            props: buildProps(
                tree,
                undefined,
                () => {
                    /* noop */
                },
                { renderChild }
            ),
        });
        const text = container.textContent;
        expect(text).toContain("if:");
        expect(text).toContain("then:");
        expect(text).toContain("else:");
    });
});

describe("renderers — Negation", () => {
    it("renders the negated schema beneath a 'Must NOT match' preamble", () => {
        const negated = baseField("string");
        const tree = baseField("negation", { negated });
        const renderChild: SvelteRenderProps["renderChild"] = (t, v, c) => ({
            component: StringSvelte,
            props: buildProps(t, v, c),
        });
        const { container } = render(NegationSvelte, {
            props: buildProps(
                tree,
                undefined,
                () => {
                    /* noop */
                },
                { renderChild }
            ),
        });
        expect(container.textContent).toContain("Must NOT match:");
    });
});

describe("renderers — File", () => {
    it("renders an <input type=file>", () => {
        const tree = baseField("file");
        const { container } = render(FileSvelte, {
            props: buildProps(tree, undefined),
        });
        const input = container.querySelector('input[type="file"]');
        expect(input).not.toBeNull();
    });

    it("renders a placeholder span in read-only mode", () => {
        const tree = baseField("file");
        const { container } = render(FileSvelte, {
            props: buildProps(
                tree,
                undefined,
                () => {
                    /* noop */
                },
                { readOnly: true }
            ),
        });
        expect(container.querySelector("input")).toBeNull();
        expect(container.textContent).toContain("File field");
    });
});

describe("renderers — Unknown", () => {
    it("stringifies object values as JSON in read-only mode", () => {
        const tree = baseField("unknown");
        const { container } = render(UnknownSvelte, {
            props: buildProps(
                tree,
                { a: 1 },
                () => {
                    /* noop */
                },
                { readOnly: true }
            ),
        });
        expect(container.textContent).toBe('{"a":1}');
    });
});
