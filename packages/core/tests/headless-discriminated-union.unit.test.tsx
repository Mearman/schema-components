/**
 * @vitest-environment happy-dom
 *
 * Tests for the headless discriminated union renderer (`renderDiscriminatedUnion`).
 *
 * `renderDiscriminatedUnion` (packages/core/src/react/headlessRenderers.tsx,
 * lines ~511-566) renders an editable WAI-ARIA tabs control:
 * - `role="tablist"`, `role="tab"`, `role="tabpanel"`
 * - active tab has `aria-selected="true"`
 * - ArrowLeft / ArrowRight / Home / End move focus and selection between tabs
 *   (automatic-activation pattern), wrapping at the extremes
 * - Clicking a tab calls `onChange({ [discriminator]: label })`
 * - Read-only mode renders the active branch without tab buttons
 *
 * A DOM environment (happy-dom) is required for the keyboard-navigation
 * tests at the bottom of the file — they observe focus movement and
 * mutations to `aria-selected` / `tabindex` after key presses. The
 * structural SSR tests above use `renderToString` and do not depend on
 * the DOM, but happy-dom is harmless for them.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderToString } from "react-dom/server";
import { isValidElement, useState, type ReactElement } from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { z } from "zod";
import { SchemaComponent } from "../src/react/SchemaComponent.tsx";
import {
    renderDiscriminatedUnion,
    discriminatedUnionValueForTab,
} from "../src/react/headlessRenderers.tsx";
import { walk } from "../src/core/walker.ts";
import type { RenderProps } from "../src/core/renderer.ts";
import { asDiscriminatedUnion } from "./helpers.ts";

// ---------------------------------------------------------------------------
// Shared schema — discriminator "kind" with two branches
// ---------------------------------------------------------------------------

const kindSchema = z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("a"), a: z.string() }),
    z.object({ kind: z.literal("b"), b: z.number() }),
]);

/** Walk the shared schema and build minimal RenderProps. */
function buildProps(
    value: unknown,
    onChange: (v: unknown) => void,
    readOnly = false
): RenderProps {
    const tree = walk(z.toJSONSchema(kindSchema));
    const du = asDiscriminatedUnion(tree);
    return {
        value,
        onChange,
        readOnly,
        writeOnly: false,
        meta: du.meta,
        constraints: du.constraints,
        path: "field",
        tree: du,
        options: du.options,
        discriminator: du.discriminator,
        renderChild: () => null,
    };
}

function assertReactElement(value: unknown, message: string): ReactElement {
    if (!isValidElement(value)) throw new Error(message);
    return value;
}

/**
 * React 19 typings expose `element.props` as `unknown`. Narrow once via
 * a type guard so call sites can read known properties.
 */
function elementProps(element: ReactElement): Record<string, unknown> {
    const props = element.props;
    if (typeof props !== "object" || props === null) {
        throw new Error("ReactElement.props is not an object");
    }
    // `object` lacks an index signature, so an unavoidable cast is needed.
    return props as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// WAI-ARIA tabs markup (SSR)
// ---------------------------------------------------------------------------

describe("renderDiscriminatedUnion — ARIA tabs structure", () => {
    it("renders role=tablist around the tab buttons", () => {
        const html = renderToString(
            <SchemaComponent schema={kindSchema} value={{ kind: "a", a: "" }} />
        );
        expect(html).toContain('role="tablist"');
    });

    it("renders one role=tab button per option", () => {
        const html = renderToString(
            <SchemaComponent schema={kindSchema} value={{ kind: "a", a: "" }} />
        );
        const tabs = html.match(/role="tab"/g) ?? [];
        expect(tabs).toHaveLength(2);
    });

    it("renders a single role=tabpanel for the active branch", () => {
        const html = renderToString(
            <SchemaComponent schema={kindSchema} value={{ kind: "a", a: "" }} />
        );
        const panels = html.match(/role="tabpanel"/g) ?? [];
        expect(panels).toHaveLength(1);
    });

    it("marks exactly one tab with aria-selected=true", () => {
        const html = renderToString(
            <SchemaComponent schema={kindSchema} value={{ kind: "a", a: "" }} />
        );
        const selected = html.match(/aria-selected="true"/g) ?? [];
        expect(selected).toHaveLength(1);
    });

    it("uses tab labels derived from each option's discriminator literal", () => {
        const html = renderToString(
            <SchemaComponent schema={kindSchema} value={{ kind: "a", a: "" }} />
        );
        // Button text is the literal value: "a" and "b"
        expect(html).toMatch(/<button[^>]*role="tab"[^>]*>a<\/button>/);
        expect(html).toMatch(/<button[^>]*role="tab"[^>]*>b<\/button>/);
    });
});

// ---------------------------------------------------------------------------
// Value-driven active tab
// ---------------------------------------------------------------------------

describe("renderDiscriminatedUnion — active tab from value", () => {
    it("renders the 'a' branch's input when value.kind === 'a'", () => {
        const html = renderToString(
            <SchemaComponent
                schema={kindSchema}
                value={{ kind: "a", a: "hello" }}
            />
        );
        expect(html).toContain("hello");
    });

    it("renders the 'b' branch's input when value.kind === 'b' on first render", () => {
        const html = renderToString(
            <SchemaComponent schema={kindSchema} value={{ kind: "b", b: 42 }} />
        );
        expect(html).toContain('value="42"');
        expect(html).toContain('type="number"');
    });

    it("defaults to the first tab when the discriminator value matches nothing", () => {
        const html = renderToString(
            <SchemaComponent schema={kindSchema} value={{ kind: "unknown" }} />
        );
        // First option is 'a' — its string input renders
        expect(html).toContain('type="text"');
    });
});

// ---------------------------------------------------------------------------
// Read-only mode — no tab buttons
// ---------------------------------------------------------------------------

describe("renderDiscriminatedUnion — read-only mode", () => {
    it("does not render the tablist in read-only mode", () => {
        const html = renderToString(
            <SchemaComponent
                schema={kindSchema}
                value={{ kind: "a", a: "ada" }}
                readOnly
            />
        );
        expect(html).not.toContain('role="tablist"');
        expect(html).not.toContain('role="tab"');
    });

    it("renders the active branch's content directly in read-only mode", () => {
        const html = renderToString(
            <SchemaComponent
                schema={kindSchema}
                value={{ kind: "b", b: 99 }}
                readOnly
            />
        );
        expect(html).toContain("99");
    });

    it("renders the em-dash placeholder in read-only mode with no options", () => {
        const onChange = vi.fn();
        const result = renderDiscriminatedUnion({
            value: undefined,
            onChange,
            readOnly: true,
            writeOnly: false,
            meta: {},
            constraints: {},
            path: "field",
            tree: {
                type: "discriminatedUnion",
                editability: "presentation",
                meta: {},
                constraints: {},
                options: [],
                discriminator: "kind",
            },
            options: [],
            discriminator: "kind",
            renderChild: () => null,
        });
        const element = assertReactElement(result, "Expected ReactElement");
        expect(element.type).toBe("span");
        expect(elementProps(element).children).toBe("—");
    });
});

// ---------------------------------------------------------------------------
// Tab change contract (pure helper) — clicking a tab fires onChange
// ---------------------------------------------------------------------------

describe("renderDiscriminatedUnion — tab change contract", () => {
    it("constructs the renderer with the labels needed by the click handler", () => {
        // The renderer returns the tabs component element. Its props expose
        // optionLabels and discKey — the values the click handler uses to
        // compute the next value. We verify the contract by reading those
        // props and exercising the pure helper directly.
        const onChange = vi.fn();
        const result = renderDiscriminatedUnion(
            buildProps({ kind: "a", a: "" }, onChange)
        );
        const element = assertReactElement(result, "Expected ReactElement");
        const props = elementProps(element);
        expect(props.optionLabels).toEqual(["a", "b"]);
        expect(props.discKey).toBe("kind");
        expect(props.activeIndex).toBe(0);
    });

    it("the tab-change helper emits the new discriminator value", () => {
        // Equivalent to clicking the second tab: onChange({ kind: "b" })
        const next = discriminatedUnionValueForTab(["a", "b"], "kind", 1);
        expect(next).toEqual({ kind: "b" });
    });

    it("the tab-change helper returns undefined for an out-of-bounds index", () => {
        const next = discriminatedUnionValueForTab(["a", "b"], "kind", 99);
        expect(next).toBeUndefined();
    });

    it("active index updates when value's discriminator changes", () => {
        const onChange = vi.fn();
        const result = renderDiscriminatedUnion(
            buildProps({ kind: "b", b: 0 }, onChange)
        );
        const element = assertReactElement(result, "Expected ReactElement");
        expect(elementProps(element).activeIndex).toBe(1);
    });
});

// ---------------------------------------------------------------------------
// Keyboard navigation (requires a DOM — see file-level @vitest-environment)
// ---------------------------------------------------------------------------

describe("renderDiscriminatedUnion — keyboard navigation (SSR markup)", () => {
    it("renders the tablist element so a keydown handler can intercept arrows", () => {
        // The keyboard handler is attached to the tablist element via
        // onKeyDown. SSR does not expose handlers, but the markup proves
        // the tablist element is present and the buttons inside it have
        // tabIndex values matching the WAI-ARIA roving tabindex pattern.
        const html = renderToString(
            <SchemaComponent schema={kindSchema} value={{ kind: "a", a: "" }} />
        );
        expect(html).toContain('role="tablist"');
        // The active tab has tabindex=0; inactive tabs have tabindex=-1
        expect(html).toMatch(/tabindex="0"[^>]*>a</);
        expect(html).toMatch(/tabindex="-1"[^>]*>b</);
    });
});

/**
 * Controlled wrapper used by the keyboard tests. Holds the discriminated
 * union value in local state so the component is fully controlled by
 * React in the same way it would be in a real app — this is required
 * because automatic-activation tabs change selection via `onChange` and
 * focus follows the resulting re-render.
 */
function ControlledKindSchema({
    initial,
}: {
    initial: { kind: string; [k: string]: unknown };
}): ReactElement {
    const [value, setValue] = useState<unknown>(initial);
    return (
        <SchemaComponent
            schema={kindSchema}
            value={value}
            onChange={(v) => {
                setValue(v);
            }}
        />
    );
}

describe("renderDiscriminatedUnion — keyboard navigation (DOM)", () => {
    afterEach(() => {
        cleanup();
    });

    /** Read tabs in document order. */
    function getTabs(): HTMLButtonElement[] {
        const tabs = screen.getAllByRole("tab");
        return tabs.filter(
            (el): el is HTMLButtonElement => el instanceof HTMLButtonElement
        );
    }

    /** Active tab as defined by the WAI-ARIA roving tabindex pattern. */
    function activeTab(): HTMLButtonElement {
        const tab = getTabs().find(
            (t) => t.getAttribute("aria-selected") === "true"
        );
        if (tab === undefined) {
            throw new Error("No tab has aria-selected=true");
        }
        return tab;
    }

    it("ArrowRight moves focus and selection to the next tab, wrapping at the end", () => {
        render(<ControlledKindSchema initial={{ kind: "a", a: "" }} />);
        const tabs = getTabs();
        const [first, second] = tabs;
        if (first === undefined || second === undefined) {
            throw new Error("Expected two tabs");
        }

        // Seed focus on the active tab so the keydown originates there.
        first.focus();
        expect(document.activeElement).toBe(first);

        fireEvent.keyDown(first, { key: "ArrowRight" });
        expect(activeTab()).toBe(second);
        expect(document.activeElement).toBe(second);
        expect(second.getAttribute("tabindex")).toBe("0");
        expect(first.getAttribute("tabindex")).toBe("-1");

        // Wrap: ArrowRight on the last tab returns to the first.
        fireEvent.keyDown(second, { key: "ArrowRight" });
        const [firstAgain] = getTabs();
        if (firstAgain === undefined) throw new Error("Expected first tab");
        expect(activeTab()).toBe(firstAgain);
        expect(document.activeElement).toBe(firstAgain);
    });

    it("ArrowLeft moves focus and selection to the previous tab, wrapping at the start", () => {
        render(<ControlledKindSchema initial={{ kind: "a", a: "" }} />);
        const tabs = getTabs();
        const [first] = tabs;
        if (first === undefined) throw new Error("Expected at least one tab");

        first.focus();

        // From first tab, ArrowLeft wraps to the last tab.
        fireEvent.keyDown(first, { key: "ArrowLeft" });
        const after = getTabs();
        const last = after[after.length - 1];
        if (last === undefined) throw new Error("Expected last tab");
        expect(activeTab()).toBe(last);
        expect(document.activeElement).toBe(last);
        expect(last.getAttribute("tabindex")).toBe("0");

        // From last tab, ArrowLeft moves back to the previous tab.
        fireEvent.keyDown(last, { key: "ArrowLeft" });
        const afterTwo = getTabs();
        const previous = afterTwo[afterTwo.length - 2];
        if (previous === undefined) {
            throw new Error("Expected previous tab");
        }
        expect(activeTab()).toBe(previous);
        expect(document.activeElement).toBe(previous);
    });

    it("Home moves focus and selection to the first tab", () => {
        // Start on the second tab so Home has somewhere to move from.
        render(<ControlledKindSchema initial={{ kind: "b", b: 0 }} />);
        const tabs = getTabs();
        const last = tabs[tabs.length - 1];
        if (last === undefined) throw new Error("Expected last tab");
        last.focus();
        expect(document.activeElement).toBe(last);

        fireEvent.keyDown(last, { key: "Home" });
        const [first] = getTabs();
        if (first === undefined) throw new Error("Expected first tab");
        expect(activeTab()).toBe(first);
        expect(document.activeElement).toBe(first);
        expect(first.getAttribute("tabindex")).toBe("0");
    });

    it("End moves focus and selection to the last tab", () => {
        render(<ControlledKindSchema initial={{ kind: "a", a: "" }} />);
        const tabs = getTabs();
        const [first] = tabs;
        if (first === undefined) throw new Error("Expected first tab");
        first.focus();

        fireEvent.keyDown(first, { key: "End" });
        const after = getTabs();
        const last = after[after.length - 1];
        if (last === undefined) throw new Error("Expected last tab");
        expect(activeTab()).toBe(last);
        expect(document.activeElement).toBe(last);
        expect(last.getAttribute("tabindex")).toBe("0");
    });
});
