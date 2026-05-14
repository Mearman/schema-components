/**
 * Tests for scoped widget resolution.
 *
 * Verifies the three widget scopes: global, context, and per-instance.
 * Resolution order: instance → context → global → resolver → headless.
 */
import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import {
    SchemaComponent,
    SchemaProvider,
    registerWidget,
    type WidgetMap,
} from "../src/react/SchemaComponent.tsx";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Instance-scoped widgets (per-component)
// ---------------------------------------------------------------------------

describe("instance-scoped widgets", () => {
    it("resolves widget from instance widgets prop", () => {
        const schema = z.object({
            name: z.string().meta({ component: "greeting" }),
        });

        const widgets: WidgetMap = new Map([
            [
                "greeting",
                (props) => (
                    <span data-testid="greeting">
                        Hello, {String(props.value)}
                    </span>
                ),
            ],
        ]);

        const html = renderToString(
            <SchemaComponent
                schema={schema}
                value={{ name: "Ada" }}
                widgets={widgets}
            />
        );

        expect(html).toContain("Hello,");
        expect(html).toContain("Ada");
        expect(html).toContain('data-testid="greeting"');
    });

    it("instance widget overrides global widget", () => {
        const schema = z.object({
            name: z.string().meta({ component: "override-test" }),
        });

        registerWidget("override-test", () => <span>global</span>);

        const instanceWidgets: WidgetMap = new Map([
            ["override-test", () => <span>instance</span>],
        ]);

        const html = renderToString(
            <SchemaComponent
                schema={schema}
                value={{ name: "test" }}
                widgets={instanceWidgets}
            />
        );

        expect(html).toContain("instance");
        expect(html).not.toContain("global");
    });

    it("instance widget overrides context widget", () => {
        const schema = z.object({
            name: z.string().meta({ component: "scope-test" }),
        });

        const contextWidgets: WidgetMap = new Map([
            ["scope-test", () => <span>context</span>],
        ]);

        const instanceWidgets: WidgetMap = new Map([
            ["scope-test", () => <span>instance</span>],
        ]);

        const html = renderToString(
            <SchemaProvider resolver={{}} widgets={contextWidgets}>
                <SchemaComponent
                    schema={schema}
                    value={{ name: "test" }}
                    widgets={instanceWidgets}
                />
            </SchemaProvider>
        );

        expect(html).toContain("instance");
        expect(html).not.toContain("context");
    });
});

// ---------------------------------------------------------------------------
// Context-scoped widgets (SchemaProvider)
// ---------------------------------------------------------------------------

describe("context-scoped widgets", () => {
    it("resolves widget from SchemaProvider widgets prop", () => {
        const schema = z.object({
            name: z.string().meta({ component: "ctx-widget" }),
        });

        const widgets: WidgetMap = new Map([
            ["ctx-widget", () => <span>from-context</span>],
        ]);

        const html = renderToString(
            <SchemaProvider resolver={{}} widgets={widgets}>
                <SchemaComponent schema={schema} value={{ name: "test" }} />
            </SchemaProvider>
        );

        expect(html).toContain("from-context");
    });

    it("context widget overrides global widget", () => {
        const schema = z.object({
            name: z.string().meta({ component: "ctx-vs-global" }),
        });

        registerWidget("ctx-vs-global", () => <span>global</span>);

        const contextWidgets: WidgetMap = new Map([
            ["ctx-vs-global", () => <span>context</span>],
        ]);

        const html = renderToString(
            <SchemaProvider resolver={{}} widgets={contextWidgets}>
                <SchemaComponent schema={schema} value={{ name: "test" }} />
            </SchemaProvider>
        );

        expect(html).toContain("context");
        expect(html).not.toContain("global");
    });

    it("falls through to resolver when widget not found", () => {
        const schema = z.object({
            name: z.string(),
        });

        const widgets: WidgetMap = new Map([
            ["unused", () => <span>never</span>],
        ]);

        // No .meta({ component }) — widget map is irrelevant
        const html = renderToString(
            <SchemaComponent
                schema={schema}
                value={{ name: "Ada" }}
                widgets={widgets}
            />
        );

        // Falls through to headless resolver
        expect(html).toContain("Ada");
    });
});

// ---------------------------------------------------------------------------
// Global widgets (registerWidget)
// ---------------------------------------------------------------------------

describe("global widgets", () => {
    it("resolves widget registered via registerWidget", () => {
        const schema = z.object({
            name: z.string().meta({ component: "global-test-widget" }),
        });

        registerWidget("global-test-widget", (props) => (
            <strong>GLOBAL: {String(props.value)}</strong>
        ));

        const html = renderToString(
            <SchemaComponent schema={schema} value={{ name: "Ada" }} />
        );

        expect(html).toContain("GLOBAL:");
        expect(html).toContain("Ada");
    });
});

// ---------------------------------------------------------------------------
// Resolution order (full chain)
// ---------------------------------------------------------------------------

describe("resolution order", () => {
    it("instance > context > global", () => {
        const schema = z.object({
            name: z.string().meta({ component: "priority-test" }),
        });

        registerWidget("priority-test", () => <span>global</span>);

        const contextWidgets: WidgetMap = new Map([
            ["priority-test", () => <span>context</span>],
        ]);

        const instanceWidgets: WidgetMap = new Map([
            ["priority-test", () => <span>instance</span>],
        ]);

        // All three registered — instance wins
        const html = renderToString(
            <SchemaProvider resolver={{}} widgets={contextWidgets}>
                <SchemaComponent
                    schema={schema}
                    value={{ name: "test" }}
                    widgets={instanceWidgets}
                />
            </SchemaProvider>
        );

        expect(html).toContain("instance");
        expect(html).not.toContain("context");
        expect(html).not.toContain("global");
    });

    it("context > global when no instance widgets", () => {
        const schema = z.object({
            name: z.string().meta({ component: "ctx-priority" }),
        });

        registerWidget("ctx-priority", () => <span>global</span>);

        const contextWidgets: WidgetMap = new Map([
            ["ctx-priority", () => <span>context</span>],
        ]);

        const html = renderToString(
            <SchemaProvider resolver={{}} widgets={contextWidgets}>
                <SchemaComponent schema={schema} value={{ name: "test" }} />
            </SchemaProvider>
        );

        expect(html).toContain("context");
        expect(html).not.toContain("global");
    });

    it("resolver handles types with no widget", () => {
        const schema = z.object({
            age: z.number(),
        });

        const html = renderToString(
            <SchemaComponent schema={schema} value={{ age: 42 }} readOnly />
        );

        expect(html).toContain("42");
    });
});

// ---------------------------------------------------------------------------
// WidgetMap type
// ---------------------------------------------------------------------------

describe("WidgetMap type", () => {
    it("is a ReadonlyMap", () => {
        const widgets: WidgetMap = new Map([["test", () => null]]);
        expect(widgets).toBeInstanceOf(Map);
        expect(widgets.get("test")).toBeTypeOf("function");
    });
});
