/**
 * Tests for headless renderers covering the WalkedField variants that were
 * previously unregistered in `headlessResolver`: `literal`, `null`, `never`,
 * `tuple`, `conditional`, and `negation`.
 *
 * Before this fix, the React headless resolver returned `undefined` from
 * `getRenderFunction` for these types and the consumer saw nothing.
 */
import { describe, it, expect } from "vitest";
import { isValidElement, type ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { z } from "zod";
import { SchemaComponent } from "../src/react/SchemaComponent.tsx";
import { headlessResolver } from "../src/react/headless.tsx";
import { getRenderFunction } from "../src/core/renderer.ts";

/** Narrow an unknown render result into a ReactElement for renderToString. */
function asReactElement(value: unknown, message: string): ReactElement {
    if (!isValidElement(value)) throw new Error(message);
    return value;
}

const EM_DASH = "—";

// ---------------------------------------------------------------------------
// Resolver registration — every variant must have a renderer
// ---------------------------------------------------------------------------

describe("headlessResolver — registration", () => {
    it("registers a renderer for every previously missing variant", () => {
        for (const type of [
            "literal",
            "null",
            "never",
            "tuple",
            "conditional",
            "negation",
        ] as const) {
            expect(getRenderFunction(type, headlessResolver)).toBeDefined();
        }
    });
});

// ---------------------------------------------------------------------------
// Literal
// ---------------------------------------------------------------------------

describe("renderLiteral", () => {
    it("renders the literal value text", () => {
        const schema = z.literal("hello");
        const html = renderToString(
            <SchemaComponent schema={schema} value="hello" readOnly />
        );
        expect(html).toContain("hello");
    });

    it("renders a numeric `const` literal", () => {
        const single = { const: 42 };
        const html = renderToString(
            <SchemaComponent schema={single} value={42} readOnly />
        );
        expect(html).toContain("42");
    });
});

// ---------------------------------------------------------------------------
// Null
// ---------------------------------------------------------------------------

describe("renderNull", () => {
    it("renders an em-dash for a null-typed schema", () => {
        const schema = z.null();
        const html = renderToString(
            <SchemaComponent schema={schema} value={null} readOnly />
        );
        expect(html).toContain(EM_DASH);
    });
});

// ---------------------------------------------------------------------------
// Never
// ---------------------------------------------------------------------------

describe("renderNever", () => {
    // The walker only emits the `never` variant for a literal `false`
    // schema, which the normaliser rejects at the top level. `z.never()`
    // is serialised as `{ not: {} }` and walked as a negation. Invoke the
    // renderer directly through the resolver to exercise it.
    it("registers and renders the never placeholder via the resolver", () => {
        const fn = getRenderFunction("never", headlessResolver);
        if (fn === undefined) throw new Error("renderNever not registered");
        const result = fn({
            value: undefined,
            onChange: () => {
                /* noop */
            },
            readOnly: true,
            writeOnly: false,
            meta: {},
            constraints: {},
            path: "field",
            tree: {
                type: "never",
                editability: "presentation",
                meta: {},
                constraints: {},
            },
            renderChild: () => null,
        });
        const html = renderToString(
            asReactElement(result, "renderNever did not return a ReactElement")
        );
        expect(html).toContain("never matches");
    });
});

// ---------------------------------------------------------------------------
// Tuple
// ---------------------------------------------------------------------------

describe("renderTuple", () => {
    it("renders each prefixItem in order", () => {
        const schema = z.tuple([z.string(), z.number()]);
        const html = renderToString(
            <SchemaComponent schema={schema} value={["alpha", 99]} readOnly />
        );
        expect(html).toContain("alpha");
        expect(html).toContain("99");
    });

    it("uses positional path suffixes for each element", () => {
        const schema = z.tuple([z.string(), z.string()]);
        const html = renderToString(
            <SchemaComponent schema={schema} value={["first", "second"]} />
        );
        // Both string inputs should be present
        expect(html.match(/<input/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
        expect(html).toContain("first");
        expect(html).toContain("second");
    });
});

// ---------------------------------------------------------------------------
// Conditional
// ---------------------------------------------------------------------------

describe("renderConditional", () => {
    it("surfaces if/then/else clauses", () => {
        const jsonSchema = {
            if: { type: "object", properties: { kind: { const: "a" } } },
            then: {
                type: "object",
                properties: { extra: { type: "string" } },
            },
            else: {
                type: "object",
                properties: { other: { type: "number" } },
            },
        };
        const html = renderToString(
            <SchemaComponent schema={jsonSchema} value={{}} readOnly />
        );
        expect(html).toContain("if:");
        expect(html).toContain("then:");
        expect(html).toContain("else:");
    });
});

// ---------------------------------------------------------------------------
// Negation
// ---------------------------------------------------------------------------

describe("renderNegation", () => {
    it("surfaces the negation preamble", () => {
        const jsonSchema = {
            not: { type: "string" },
        };
        const html = renderToString(
            <SchemaComponent schema={jsonSchema} value={undefined} readOnly />
        );
        expect(html).toContain("Must NOT match:");
    });
});
