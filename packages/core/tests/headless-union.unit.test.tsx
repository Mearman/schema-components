/**
 * Tests for the headless union renderer (`renderUnion`).
 *
 * `renderUnion` (packages/core/src/react/headlessRenderers.tsx, lines ~482-505)
 * matches a value to a union option by JavaScript type and delegates to that
 * option's renderer. When no value can be matched, it falls back to the
 * first option in editable mode, or an em-dash placeholder when read-only.
 */
import { describe, it, expect, vi } from "vitest";
import { isValidElement, type ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { z } from "zod";
import { SchemaComponent } from "../src/react/SchemaComponent.tsx";
import { renderUnion } from "../src/react/headlessRenderers.tsx";
import { walk } from "../src/core/walker.ts";
import { headlessResolver } from "../src/react/headless.tsx";
import { getRenderFunction } from "../src/core/renderer.ts";
import type { RenderProps } from "../src/core/renderer.ts";
import type { WalkedField } from "../src/core/types.ts";
import { asUnion } from "./helpers.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a UnionField by walking a Zod union schema. */
function walkUnion(schema: z.ZodType): WalkedField {
    const jsonSchema = z.toJSONSchema(schema) as Record<string, unknown>;
    return walk(jsonSchema);
}

/**
 * Build a `renderChild` callback that dispatches to the headless resolver.
 * Threads `onChange` through so child renderers fire the test's spy.
 */
function makeRenderChild(): RenderProps["renderChild"] {
    return (childTree, childValue, childOnChange) => {
        const fn = getRenderFunction(childTree.type, headlessResolver);
        if (fn === undefined) return null;
        return fn({
            value: childValue,
            onChange: childOnChange,
            readOnly: false,
            writeOnly: false,
            meta: childTree.meta,
            constraints: childTree.constraints,
            path: "child",
            tree: childTree,
            renderChild: makeRenderChild(),
        });
    };
}

/** Build the props passed to `renderUnion` for a given union tree. */
function buildUnionProps(
    tree: WalkedField,
    value: unknown,
    onChange: (v: unknown) => void,
    readOnly = false
): RenderProps {
    const union = asUnion(tree);
    return {
        value,
        onChange,
        readOnly,
        writeOnly: false,
        meta: union.meta,
        constraints: union.constraints,
        path: "field",
        tree: union,
        renderChild: makeRenderChild(),
    };
}

/** Assert a value is a ReactElement (narrows the type). */
function assertReactElement(value: unknown, message: string): ReactElement {
    if (!isValidElement(value)) {
        throw new Error(message);
    }
    return value;
}

/**
 * React 19 typings expose `element.props` as `unknown`. Tests need to read
 * specific known fields off the rendered element — narrow once via a type
 * guard so call sites stay readable.
 */
function elementProps(element: ReactElement): Record<string, unknown> {
    const props = element.props;
    if (typeof props !== "object" || props === null) {
        throw new Error("ReactElement.props is not an object");
    }
    // `object` lacks an index signature in TypeScript, so an unavoidable
    // cast is required after narrowing.
    return props as Record<string, unknown>;
}

type ChangeHandler = (e: { target: { value: string } }) => void;

function isChangeHandler(value: unknown): value is ChangeHandler {
    return typeof value === "function";
}

/**
 * Invoke a host element's `onChange` with a synthetic event-shaped payload.
 * Throws when the element lacks an `onChange` handler.
 */
function invokeOnChange(element: ReactElement, value: string): void {
    const handler = elementProps(element).onChange;
    if (!isChangeHandler(handler)) {
        throw new Error("Element has no onChange handler");
    }
    handler({ target: { value } });
}

const noop = (): void => {
    /* intentional no-op for callback parameters */
};

const EM_DASH = "—";

// ---------------------------------------------------------------------------
// Degenerate options — no resolved branches
// ---------------------------------------------------------------------------

describe("renderUnion — degenerate (no options)", () => {
    /** Build a synthetic union tree with zero options. */
    function emptyUnionTree(): WalkedField {
        return {
            type: "union",
            editability: "editable",
            meta: {},
            constraints: {},
            options: [],
        };
    }

    it("renders the em-dash placeholder when read-only with no value", () => {
        const tree = emptyUnionTree();
        const result = renderUnion(
            buildUnionProps(tree, undefined, noop, true)
        );
        const element = assertReactElement(result, "Expected ReactElement");
        expect(element.type).toBe("span");
        expect(elementProps(element).children).toBe(EM_DASH);
    });

    it("falls back to JSON.stringify for editable mode with a value", () => {
        const tree = emptyUnionTree();
        const result = renderUnion(
            buildUnionProps(tree, { foo: 1 }, noop, false)
        );
        const element = assertReactElement(result, "Expected ReactElement");
        expect(element.type).toBe("span");
        expect(elementProps(element).children).toBe('{"foo":1}');
    });

    it("renders em-dash for editable mode with no value", () => {
        const tree = emptyUnionTree();
        const result = renderUnion(buildUnionProps(tree, undefined, noop));
        const element = assertReactElement(result, "Expected ReactElement");
        expect(elementProps(element).children).toBe(EM_DASH);
    });
});

// ---------------------------------------------------------------------------
// string | number unions
// ---------------------------------------------------------------------------

describe("renderUnion — string | number", () => {
    const schema = z.union([z.string(), z.number()]);

    it("renders the em-dash placeholder in read-only mode when value is undefined", () => {
        const html = renderToString(
            <SchemaComponent schema={schema} value={undefined} readOnly />
        );
        expect(html).toContain(EM_DASH);
    });

    it("renders the first option's input in editable mode when value is undefined", () => {
        const html = renderToString(
            <SchemaComponent schema={schema} value={undefined} />
        );
        // Falls back to first option (string) — a text input
        expect(html).toContain('type="text"');
    });

    it("matches and renders the string branch when the value is a string", () => {
        const html = renderToString(
            <SchemaComponent schema={schema} value="hello" readOnly />
        );
        expect(html).toContain("hello");
        // Read-only string renders as a span, not an input
        expect(html).not.toContain("<input");
    });

    it("matches and renders the number branch when the value is a number", () => {
        const html = renderToString(
            <SchemaComponent schema={schema} value={42} />
        );
        // Editable number → input type="number"
        expect(html).toContain('type="number"');
        expect(html).toContain('value="42"');
    });

    it("fires onChange when the first option's input value is typed into", () => {
        const tree = walkUnion(schema);
        const onChange = vi.fn();
        const result = renderUnion(buildUnionProps(tree, undefined, onChange));
        const element = assertReactElement(result, "Expected ReactElement");
        // First option falls through to renderString → an <input>
        expect(element.type).toBe("input");
        invokeOnChange(element, "typed value");
        expect(onChange).toHaveBeenCalledTimes(1);
        expect(onChange).toHaveBeenCalledWith("typed value");
    });

    it("fires onChange via the matched number branch when the value is numeric", () => {
        const tree = walkUnion(schema);
        const onChange = vi.fn();
        const result = renderUnion(buildUnionProps(tree, 7, onChange));
        const element = assertReactElement(result, "Expected ReactElement");
        expect(element.type).toBe("input");
        expect(elementProps(element).type).toBe("number");
        invokeOnChange(element, "99");
        expect(onChange).toHaveBeenCalledWith(99);
    });
});

// ---------------------------------------------------------------------------
// boolean | object — type-keyed matching
// ---------------------------------------------------------------------------

describe("renderUnion — value-keyed matching", () => {
    const schema = z.union([z.boolean(), z.object({ name: z.string() })]);

    it("renders the boolean branch when the value is a boolean", () => {
        const html = renderToString(
            <SchemaComponent schema={schema} value={true} readOnly />
        );
        expect(html).toContain("Yes");
    });

    it("renders the object branch when the value is an object", () => {
        const html = renderToString(
            <SchemaComponent schema={schema} value={{ name: "Ada" }} readOnly />
        );
        expect(html).toContain("Ada");
    });
});
