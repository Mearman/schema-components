/**
 * React record renderer tests — covers `renderRecord` in
 * packages/core/src/react/headlessRenderers.tsx.
 *
 * Editable records expose:
 * - A key input per row (renames the entry on blur)
 * - A value input per row (typed by the value-schema renderer)
 * - A per-row "Remove" button
 * - A footer "Add" button
 *
 * Read-only records render labelled key:value pairs with no controls.
 */
import { describe, expect, it, vi } from "vitest";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { z } from "zod";
import { SchemaComponent } from "../src/react/SchemaComponent.tsx";
import {
    renderRecord,
    defaultRecordValue,
    nextRecordKey,
    renameRecordKey,
} from "../src/react/headlessRenderers.tsx";
import { walk } from "../src/core/walker.ts";
import type { RenderProps } from "../src/core/renderer.ts";
import { getRenderFunction } from "../src/core/renderer.ts";
import { headlessResolver } from "../src/react/headless.tsx";
import { asRecord } from "./helpers.ts";

// ---------------------------------------------------------------------------
// Existing SSR coverage — retained as the baseline contract
// ---------------------------------------------------------------------------

const numberRecordSchema = {
    type: "object" as const,
    additionalProperties: { type: "number" as const },
} as const;

describe("React record renderer (SSR baseline)", () => {
    it("renders record entries instead of falling back to raw JSON", () => {
        const html = renderToString(
            <SchemaComponent
                schema={numberRecordSchema}
                value={{ react: 92, typescript: 88 }}
                readOnly
            />
        );

        expect(html).toContain("react");
        expect(html).toContain("92");
        expect(html).toContain("typescript");
        expect(html).toContain("88");
        expect(html).not.toContain("{&quot;react&quot;:92");
    });

    it("renders editable record values as typed child inputs", () => {
        const html = renderToString(
            <SchemaComponent
                schema={numberRecordSchema}
                value={{ react: 92 }}
            />
        );

        expect(html).toContain("react");
        expect(html).toContain('type="number"');
        expect(html).toContain('value="92"');
    });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a `renderChild` that dispatches to the headless resolver. */
function makeRenderChild(): RenderProps["renderChild"] {
    return (childTree, childValue, childOnChange) => {
        const fn = getRenderFunction(childTree.type, headlessResolver);
        if (fn === undefined) return null;
        const childProps: RenderProps = {
            value: childValue,
            onChange: childOnChange,
            readOnly: false,
            writeOnly: false,
            meta: childTree.meta,
            constraints: childTree.constraints,
            path: "child",
            tree: childTree,
            renderChild: makeRenderChild(),
        };
        return fn(childProps);
    };
}

const noop = (): void => {
    /* intentional no-op for callback parameters */
};

/** Type guard: React's `Array.isArray` narrow loses information. */
function isReactNodeArray(value: ReactNode): value is readonly ReactNode[] {
    return Array.isArray(value);
}

/** Build RenderProps for a record schema. */
function buildRecordProps(
    schema: z.ZodType,
    value: unknown,
    onChange: (v: unknown) => void,
    readOnly = false
): RenderProps {
    const tree = walk(z.toJSONSchema(schema));
    const record = asRecord(tree);
    return {
        value,
        onChange,
        readOnly,
        writeOnly: false,
        meta: record.meta,
        constraints: record.constraints,
        path: "record",
        tree: record,
        keyType: record.keyType,
        valueType: record.valueType,
        renderChild: makeRenderChild(),
    };
}

interface Clickable {
    ariaLabel: string | undefined;
    onClick: () => void;
    text: string | undefined;
}

/** Walk a React tree collecting every host element with a click handler. */
function collectClickables(node: ReactNode): Clickable[] {
    const found: Clickable[] = [];
    walkTree(node);
    return found;

    function walkTree(n: ReactNode): void {
        if (n === null || n === undefined) return;
        if (
            typeof n === "string" ||
            typeof n === "number" ||
            typeof n === "boolean"
        )
            return;
        if (isReactNodeArray(n)) {
            for (const child of n) walkTree(child);
            return;
        }
        if (!isValidElement(n)) return;

        const props = readHostProps(n);
        if (typeof props.onClick === "function") {
            found.push({
                ariaLabel:
                    typeof props["aria-label"] === "string"
                        ? props["aria-label"]
                        : undefined,
                onClick: props.onClick,
                text:
                    typeof props.children === "string"
                        ? props.children
                        : undefined,
            });
        }
        walkTree(props.children ?? null);
    }
}

/**
 * Read host element props as a known shape. Tests target intrinsic React
 * elements (button, input, div), so the prop set is well-defined. The cast
 * is unavoidable: React's `Element.props` is `unknown` and `object` has no
 * index signature in TypeScript.
 */
function readHostProps(el: ReactElement): {
    "aria-label"?: unknown;
    type?: unknown;
    defaultValue?: unknown;
    onClick?: () => void;
    onBlur?: (e: { target: { value: string } }) => void;
    onChange?: (e: { target: { value: string; checked?: boolean } }) => void;
    children?: ReactNode;
} {
    const props = el.props;
    if (typeof props !== "object" || props === null) return {};
    return props;
}

interface CapturedInput {
    ariaLabel: string | undefined;
    type: string | undefined;
    defaultValue: unknown;
    onBlur: ((e: { target: { value: string } }) => void) | undefined;
    onChange:
        | ((e: { target: { value: string; checked?: boolean } }) => void)
        | undefined;
}

/** Walk a React tree collecting every host input element. */
function collectInputs(node: ReactNode): CapturedInput[] {
    const found: CapturedInput[] = [];
    walkTree(node);
    return found;

    function walkTree(n: ReactNode): void {
        if (n === null || n === undefined) return;
        if (
            typeof n === "string" ||
            typeof n === "number" ||
            typeof n === "boolean"
        )
            return;
        if (isReactNodeArray(n)) {
            for (const child of n) walkTree(child);
            return;
        }
        if (!isValidElement(n)) return;

        const props = readHostProps(n);
        if (n.type === "input") {
            found.push({
                ariaLabel:
                    typeof props["aria-label"] === "string"
                        ? props["aria-label"]
                        : undefined,
                type: typeof props.type === "string" ? props.type : undefined,
                defaultValue: props.defaultValue,
                onBlur: props.onBlur,
                onChange: props.onChange,
            });
        }
        walkTree(props.children ?? null);
    }
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe("renameRecordKey", () => {
    it("returns the same object when the rename is a no-op", () => {
        const obj = { a: 1, b: 2 };
        expect(renameRecordKey(obj, "a", "a")).toBe(obj);
    });

    it("preserves insertion order when renaming", () => {
        const renamed = renameRecordKey({ a: 1, b: 2, c: 3 }, "b", "z");
        expect(Object.keys(renamed)).toEqual(["a", "z", "c"]);
        expect(renamed.z).toBe(2);
    });

    it("preserves the value through the rename", () => {
        const renamed = renameRecordKey(
            { foo: "bar", baz: "qux" },
            "foo",
            "foo2"
        );
        expect(renamed.foo2).toBe("bar");
        expect(renamed.baz).toBe("qux");
    });

    it("rejects rename when the new key already exists", () => {
        const obj = { a: 1, b: 2 };
        expect(renameRecordKey(obj, "a", "b")).toBe(obj);
    });
});

describe("nextRecordKey", () => {
    it("returns the base key when unused", () => {
        expect(nextRecordKey([])).toBe("key");
    });

    it("appends a suffix when the base key is taken", () => {
        expect(nextRecordKey(["key"])).toBe("key-1");
    });

    it("skips collisions until it finds an unused suffix", () => {
        expect(nextRecordKey(["key", "key-1", "key-2"])).toBe("key-3");
    });
});

describe("defaultRecordValue", () => {
    it("returns empty string for a string value-type", () => {
        const tree = walk(z.toJSONSchema(z.record(z.string(), z.string())));
        const rec = asRecord(tree);
        expect(defaultRecordValue(rec.valueType)).toBe("");
    });

    it("returns 0 for a number value-type", () => {
        const tree = walk(z.toJSONSchema(z.record(z.string(), z.number())));
        const rec = asRecord(tree);
        expect(defaultRecordValue(rec.valueType)).toBe(0);
    });

    it("returns false for a boolean value-type", () => {
        const tree = walk(z.toJSONSchema(z.record(z.string(), z.boolean())));
        const rec = asRecord(tree);
        expect(defaultRecordValue(rec.valueType)).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Editable record — key inputs, value inputs, Add, Remove
// ---------------------------------------------------------------------------

const stringRecord = z.record(z.string(), z.string());

describe("renderRecord — editable", () => {
    it("renders an editable row per entry with a key input and a value input", () => {
        const tree = renderRecord(
            buildRecordProps(stringRecord, { foo: "bar", baz: "qux" }, noop)
        );
        const inputs = collectInputs(tree);
        // Two key inputs (one per row) and two value inputs (one per row) = 4
        expect(inputs).toHaveLength(4);
        const keyInputs = inputs.filter((i) => i.ariaLabel === "Entry key");
        expect(keyInputs).toHaveLength(2);
        expect(keyInputs[0]?.defaultValue).toBe("foo");
        expect(keyInputs[1]?.defaultValue).toBe("baz");
    });

    it("typing into a key input renames the key, preserving the value and order", () => {
        const onChange = vi.fn();
        const tree = renderRecord(
            buildRecordProps(stringRecord, { foo: "bar", baz: "qux" }, onChange)
        );
        const inputs = collectInputs(tree);
        const fooInput = inputs.find(
            (i) => i.defaultValue === "foo" && i.ariaLabel === "Entry key"
        );
        if (fooInput?.onBlur === undefined) {
            throw new Error("expected onBlur on key input");
        }
        fooInput.onBlur({ target: { value: "foo2" } });
        expect(onChange).toHaveBeenCalledTimes(1);
        const next = onChange.mock.calls[0]?.[0] as Record<string, unknown>;
        expect(Object.keys(next)).toEqual(["foo2", "baz"]);
        expect(next.foo2).toBe("bar");
        expect(next.baz).toBe("qux");
    });

    it("typing into a value input updates that value", () => {
        const onChange = vi.fn();
        const tree = renderRecord(
            buildRecordProps(stringRecord, { foo: "bar" }, onChange)
        );
        const inputs = collectInputs(tree);
        const valueInput = inputs.find(
            (i) => i.ariaLabel !== "Entry key" && i.type !== "checkbox"
        );
        if (valueInput?.onChange === undefined) {
            throw new Error("expected onChange on value input");
        }
        valueInput.onChange({ target: { value: "BAR!" } });
        expect(onChange).toHaveBeenCalledTimes(1);
        expect(onChange).toHaveBeenCalledWith({ foo: "BAR!" });
    });

    it("clicking the Remove button deletes that entry", () => {
        const onChange = vi.fn();
        const tree = renderRecord(
            buildRecordProps(stringRecord, { foo: "bar", baz: "qux" }, onChange)
        );
        const clickables = collectClickables(tree);
        const removeFoo = clickables.find(
            (c) => c.ariaLabel === "Remove entry foo"
        );
        if (removeFoo === undefined) {
            throw new Error("expected Remove button for entry 'foo'");
        }
        removeFoo.onClick();
        expect(onChange).toHaveBeenCalledTimes(1);
        expect(onChange).toHaveBeenCalledWith({ baz: "qux" });
    });

    it("clicking the Add button creates a new empty entry", () => {
        const onChange = vi.fn();
        const tree = renderRecord(
            buildRecordProps(stringRecord, { foo: "bar" }, onChange)
        );
        const clickables = collectClickables(tree);
        const add = clickables.find((c) => c.ariaLabel === "Add entry");
        if (add === undefined) {
            throw new Error("expected Add button");
        }
        add.onClick();
        expect(onChange).toHaveBeenCalledTimes(1);
        const next = onChange.mock.calls[0]?.[0] as Record<string, unknown>;
        expect(next.foo).toBe("bar");
        expect(next.key).toBe("");
        expect(Object.keys(next)).toEqual(["foo", "key"]);
    });

    it("Add picks a non-colliding key when 'key' is taken", () => {
        const onChange = vi.fn();
        const tree = renderRecord(
            buildRecordProps(stringRecord, { key: "taken" }, onChange)
        );
        const clickables = collectClickables(tree);
        const add = clickables.find((c) => c.ariaLabel === "Add entry");
        if (add === undefined) throw new Error("expected Add button");
        add.onClick();
        const next = onChange.mock.calls[0]?.[0] as Record<string, unknown>;
        expect(next["key-1"]).toBe("");
    });

    it("renders the Add button even when the record is empty", () => {
        const tree = renderRecord(buildRecordProps(stringRecord, {}, noop));
        const clickables = collectClickables(tree);
        expect(clickables.some((c) => c.ariaLabel === "Add entry")).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Value-type variations: number / boolean
// ---------------------------------------------------------------------------

describe("renderRecord — value-type variations", () => {
    it("renders number value inputs as type=number", () => {
        const numberRecord = z.record(z.string(), z.number());
        const html = renderToString(
            <SchemaComponent schema={numberRecord} value={{ score: 42 }} />
        );
        expect(html).toContain('type="number"');
        expect(html).toContain('value="42"');
    });

    it("renders boolean value inputs as type=checkbox", () => {
        const booleanRecord = z.record(z.string(), z.boolean());
        const html = renderToString(
            <SchemaComponent
                schema={booleanRecord}
                value={{ active: true, archived: false }}
            />
        );
        const checkboxes = html.match(/type="checkbox"/g) ?? [];
        expect(checkboxes.length).toBeGreaterThanOrEqual(2);
    });
});

// ---------------------------------------------------------------------------
// Read-only record — no inputs, no buttons
// ---------------------------------------------------------------------------

describe("renderRecord — read-only", () => {
    it("renders entries as labelled key:value pairs without any inputs", () => {
        const html = renderToString(
            <SchemaComponent
                schema={stringRecord}
                value={{ foo: "bar", baz: "qux" }}
                readOnly
            />
        );
        expect(html).toContain("foo");
        expect(html).toContain("bar");
        expect(html).toContain("baz");
        expect(html).toContain("qux");
        expect(html).not.toContain("<input");
        expect(html).not.toContain("<button");
    });

    it("renders the em-dash placeholder for an empty record", () => {
        const html = renderToString(
            <SchemaComponent schema={stringRecord} value={{}} readOnly />
        );
        expect(html).toContain("—");
    });
});
