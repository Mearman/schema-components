/**
 * Tests for the headless discriminated union renderer (`renderDiscriminatedUnion`).
 *
 * `renderDiscriminatedUnion` (packages/core/src/react/headlessRenderers.tsx,
 * lines ~511-566) renders an editable WAI-ARIA tabs control:
 * - `role="tablist"`, `role="tab"`, `role="tabpanel"`
 * - active tab has `aria-selected="true"`
 * - ArrowLeft / ArrowRight / Home / End move focus between tabs
 * - Clicking a tab calls `onChange({ [discriminator]: label })`
 * - Read-only mode renders the active branch without tab buttons
 */
import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { isValidElement, type ReactElement } from "react";
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
// Keyboard navigation
// ---------------------------------------------------------------------------

describe("renderDiscriminatedUnion — keyboard navigation", () => {
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

    it("keyboard focus movement requires a DOM and is exercised in browser tests", () => {
        // Keyboard handlers call element.focus() through React refs. Without
        // a DOM environment we cannot observe focus movement. The pure
        // handlers themselves (ArrowRight / ArrowLeft / Home / End) are
        // covered by the Storybook a11y tests in packages/docs.
        //
        // This is a deliberate gap in the SSR test suite — focus management
        // cannot be validated without jsdom or a real browser.
        expect(true).toBe(true);
    });
});
