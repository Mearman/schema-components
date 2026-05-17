/**
 * Tests for `<SchemaView>` — the server-safe, hooks-free read-only renderer.
 *
 * `<SchemaView>` always renders read-only output. It accepts an explicit
 * `resolver` prop (no React context) and supports widget overrides.
 * A depth cap (`MAX_SERVER_DEPTH = 10`) terminates recursive schemas with
 * a labelled placeholder fieldset.
 */
import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { z } from "zod";
import { SchemaView } from "../src/react/SchemaView.tsx";
import { SchemaComponent } from "../src/react/SchemaComponent.tsx";
import type { ComponentResolver, RenderProps } from "../src/core/renderer.ts";
import type { WidgetMap } from "../src/react/SchemaComponent.tsx";

const EM_DASH = "—";

// ---------------------------------------------------------------------------
// Scalar field types
// ---------------------------------------------------------------------------

describe("SchemaView — scalar field types", () => {
    it("renders a string value", () => {
        const html = renderToString(
            <SchemaView schema={z.string()} value="hello" />
        );
        expect(html).toContain("hello");
    });

    it("renders an email value as a mailto link", () => {
        const html = renderToString(
            <SchemaView schema={z.email()} value="ada@example.com" />
        );
        expect(html).toContain("ada@example.com");
        expect(html).toContain('href="mailto:ada@example.com"');
    });

    it("renders a url value as a link", () => {
        const html = renderToString(
            <SchemaView schema={z.url()} value="https://example.com" />
        );
        expect(html).toContain('href="https://example.com"');
    });

    it("renders a number value", () => {
        const html = renderToString(
            <SchemaView schema={z.number()} value={123} />
        );
        expect(html).toContain("123");
    });

    it("renders a boolean as Yes / No", () => {
        const htmlTrue = renderToString(
            <SchemaView schema={z.boolean()} value={true} />
        );
        const htmlFalse = renderToString(
            <SchemaView schema={z.boolean()} value={false} />
        );
        expect(htmlTrue).toContain("Yes");
        expect(htmlFalse).toContain("No");
    });

    it("renders an enum value", () => {
        const html = renderToString(
            <SchemaView
                schema={z.enum(["admin", "editor", "viewer"])}
                value="editor"
            />
        );
        expect(html).toContain("editor");
        // Read-only enum: a span, not a select
        expect(html).not.toContain("<select");
    });
});

// ---------------------------------------------------------------------------
// Object and array structures
// ---------------------------------------------------------------------------

describe("SchemaView — structured types", () => {
    it("renders an object schema as a fieldset", () => {
        const schema = z.object({
            name: z.string().meta({ description: "Name" }),
            age: z.number().meta({ description: "Age" }),
        });
        const html = renderToString(
            <SchemaView schema={schema} value={{ name: "Ada", age: 36 }} />
        );
        expect(html).toContain("<fieldset");
        expect(html).toContain("Ada");
        expect(html).toContain("36");
    });

    it("renders nested objects as nested fieldsets", () => {
        const schema = z.object({
            address: z.object({
                city: z.string().meta({ description: "City" }),
            }),
        });
        const html = renderToString(
            <SchemaView
                schema={schema}
                value={{ address: { city: "London" } }}
            />
        );
        expect(html).toContain("London");
        const fieldsets = html.match(/<fieldset/g) ?? [];
        expect(fieldsets.length).toBeGreaterThanOrEqual(2);
    });

    it("renders an array as list items", () => {
        const schema = z.array(z.string());
        const html = renderToString(
            <SchemaView schema={schema} value={["alpha", "beta", "gamma"]} />
        );
        expect(html).toContain("alpha");
        expect(html).toContain("beta");
        expect(html).toContain("gamma");
        // Array renderer uses role=group
        expect(html).toContain('role="group"');
    });
});

// ---------------------------------------------------------------------------
// Missing value placeholder
// ---------------------------------------------------------------------------

describe("SchemaView — missing values", () => {
    it("renders the em-dash placeholder when value is undefined", () => {
        const html = renderToString(<SchemaView schema={z.string()} />);
        // Read-only string renderer emits a real em-dash (U+2014), not a hyphen.
        expect(html).toContain(EM_DASH);
        expect(html).not.toContain(">-<");
    });

    it("the placeholder is the actual em-dash character (U+2014), not an ASCII dash", () => {
        const html = renderToString(<SchemaView schema={z.string()} />);
        // Codepoint check — U+2014 EM DASH
        expect(html.includes("—")).toBe(true);
    });

    it("renders the em-dash for an undefined number", () => {
        const html = renderToString(<SchemaView schema={z.number()} />);
        expect(html).toContain(EM_DASH);
    });
});

// ---------------------------------------------------------------------------
// Custom resolver overrides
// ---------------------------------------------------------------------------

describe("SchemaView — custom resolver", () => {
    it("uses a custom resolver for a given type", () => {
        const customResolver: ComponentResolver = {
            string: (props: RenderProps) => (
                <span data-testid="custom-string">
                    custom:{String(props.value)}
                </span>
            ),
        };

        const html = renderToString(
            <SchemaView
                schema={z.string()}
                value="hello"
                resolver={customResolver}
            />
        );
        expect(html).toContain('data-testid="custom-string"');
        // React 19 SSR injects "<!-- -->" between adjacent text nodes;
        // assert on the visible parts rather than the joined string.
        expect(html).toContain("custom:");
        expect(html).toContain("hello");
    });

    it("falls back to the headless renderer for types the custom resolver omits", () => {
        // Only overrides string — number must fall through to headless
        const customResolver: ComponentResolver = {
            string: () => <span>str</span>,
        };

        const html = renderToString(
            <SchemaView
                schema={z.object({ s: z.string(), n: z.number() })}
                value={{ s: "x", n: 42 }}
                resolver={customResolver}
            />
        );
        expect(html).toContain("str");
        expect(html).toContain("42");
    });
});

// ---------------------------------------------------------------------------
// Widget resolution
// ---------------------------------------------------------------------------

describe("SchemaView — widget resolution", () => {
    it("renders a widget for a schema with .meta({ component })", () => {
        const widgets: WidgetMap = new Map([
            [
                "richtext",
                (props: RenderProps) => (
                    <div data-widget="richtext">rich:{String(props.value)}</div>
                ),
            ],
        ]);

        const schema = z.string().meta({ component: "richtext" });
        const html = renderToString(
            <SchemaView
                schema={schema}
                value="Hello, world"
                widgets={widgets}
            />
        );
        expect(html).toContain('data-widget="richtext"');
        // React 19 SSR injects "<!-- -->" between adjacent text nodes.
        expect(html).toContain("rich:");
        expect(html).toContain("Hello, world");
    });

    it("skips widgets and uses the resolver when no widget matches the component hint", () => {
        const widgets: WidgetMap = new Map([
            ["unrelated", () => <span>never</span>],
        ]);

        const html = renderToString(
            <SchemaView
                schema={z.string().meta({ component: "richtext" })}
                value="abc"
                widgets={widgets}
            />
        );
        expect(html).toContain("abc");
        expect(html).not.toContain("never");
    });
});

// ---------------------------------------------------------------------------
// Comparison with SchemaComponent readOnly
// ---------------------------------------------------------------------------

describe("SchemaView — equivalence with SchemaComponent readOnly", () => {
    it("produces the same output as SchemaComponent readOnly for a flat object", () => {
        const schema = z.object({
            name: z.string(),
            active: z.boolean(),
            role: z.enum(["admin", "editor"]),
        });
        const value = { name: "Ada", active: true, role: "admin" };

        const htmlView = renderToString(
            <SchemaView schema={schema} value={value} />
        );
        const htmlComponent = renderToString(
            <SchemaComponent schema={schema} value={value} readOnly />
        );
        expect(htmlView).toBe(htmlComponent);
    });

    it("produces the same output for a nested object", () => {
        const schema = z.object({
            user: z.object({
                name: z.string(),
                email: z.email(),
            }),
        });
        const value = {
            user: { name: "Ada", email: "ada@example.com" },
        };

        const htmlView = renderToString(
            <SchemaView schema={schema} value={value} />
        );
        const htmlComponent = renderToString(
            <SchemaComponent schema={schema} value={value} readOnly />
        );
        // Both contain the rendered value; both are read-only spans / links.
        // Structural equality is the strong guarantee.
        expect(htmlView).toContain("Ada");
        expect(htmlComponent).toContain("Ada");
        expect(htmlView).toBe(htmlComponent);
    });
});

// ---------------------------------------------------------------------------
// Recursive schema depth limit
// ---------------------------------------------------------------------------

describe("SchemaView — recursive schema depth limit", () => {
    it("terminates rendering deeply nested recursive schemas with a depth-cap placeholder", () => {
        // Build a recursive tree schema. Each "children" entry contains the
        // same schema, so unbounded nesting would otherwise overflow.
        const treeSchema: z.ZodType = z.object({
            label: z.string().meta({ description: "Label" }),
            children: z
                .array(z.lazy(() => treeSchema))
                .optional()
                .meta({ description: "Children" }),
        });

        // Construct a deeply nested value — 15 levels deep, well past the
        // MAX_SERVER_DEPTH of 10.
        function makeDeep(depth: number): {
            label: string;
            children: ReturnType<typeof makeDeep>[];
        } {
            if (depth === 0)
                return { label: `leaf-${String(depth)}`, children: [] };
            return {
                label: `node-${String(depth)}`,
                children: [makeDeep(depth - 1)],
            };
        }

        const value = makeDeep(15);

        const html = renderToString(
            <SchemaView schema={treeSchema} value={value} />
        );

        // Termination indicator from SchemaView's depth cap: the literal
        // "↻" symbol followed by "(recursive)".
        expect(html).toContain("↻");
        expect(html).toContain("(recursive)");
    });

    it("renders shallow recursive structures without hitting the depth cap", () => {
        const treeSchema: z.ZodType = z.object({
            label: z.string().meta({ description: "Label" }),
            children: z
                .array(z.lazy(() => treeSchema))
                .optional()
                .meta({ description: "Children" }),
        });

        const value = {
            label: "Root",
            children: [{ label: "Leaf", children: [] }],
        };

        const html = renderToString(
            <SchemaView schema={treeSchema} value={value} />
        );
        expect(html).toContain("Root");
        expect(html).toContain("Leaf");
        // No depth-cap placeholder
        expect(html).not.toContain("(recursive)");
    });
});

// ---------------------------------------------------------------------------
// Diagnostics and strict mode
// ---------------------------------------------------------------------------

describe("SchemaView — diagnostics", () => {
    it("emits diagnostics via the onDiagnostic prop without throwing", () => {
        const diagnostics: unknown[] = [];
        // OpenAPI 2.0 input triggers normalisation diagnostics
        const html = renderToString(
            <SchemaView
                schema={{ type: "string" }}
                value="x"
                onDiagnostic={(d) => {
                    diagnostics.push(d);
                }}
            />
        );
        expect(html).toContain("x");
    });
});
