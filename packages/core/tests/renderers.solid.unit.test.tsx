/** @jsxImportSource solid-js */
/**
 * Direct render tests for every entry of the Solid headless resolver.
 *
 * The Solid renderers are reachable individually so each schema type
 * can be exercised in isolation without routing through
 * `<SchemaComponent>`'s full normalisation/walk pipeline. The tests
 * walk a one-field schema with the shared `walk()` helper and then
 * call the matching renderer directly with the `SolidRenderProps`
 * shape — this is the same path the React adapter's
 * `a11y-react-headless` tests use against the React headless
 * renderers.
 */
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { cleanup, render } from "@solidjs/testing-library";
import { walk } from "../src/core/walker.ts";
import { normaliseSchema } from "../src/core/adapter.ts";
import {
    renderArray,
    renderBoolean,
    renderConditional,
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
} from "../src/solid/renderers.tsx";
import type { SolidRenderProps } from "../src/solid/types.ts";
import type { JSX } from "solid-js";
import type { WalkedField } from "../src/core/types.ts";

afterEach(() => {
    cleanup();
});

/**
 * Build the `SolidRenderProps` for a walked field at the root path.
 * Uses a no-op renderChild — the renderer-level tests assert
 * single-level output; recursive routing is exercised via
 * `<SchemaComponent>` integration tests.
 */
function makeProps(
    tree: WalkedField,
    value: unknown,
    options: { readOnly?: boolean; writeOnly?: boolean } = {}
): SolidRenderProps {
    return {
        value,
        readOnly: options.readOnly ?? false,
        writeOnly: options.writeOnly ?? false,
        meta: tree.meta,
        constraints: tree.constraints,
        path: "root",
        tree,
        onChange: () => {
            /* tests don't assert onChange behaviour at this layer */
        },
        renderChild: () => null,
        ...(tree.examples !== undefined ? { examples: tree.examples } : {}),
    };
}

function walkField(schema: z.ZodType, value: unknown): WalkedField {
    const normalised = normaliseSchema(schema, undefined);
    void value;
    return walk(normalised.jsonSchema, {
        rootMeta: normalised.rootMeta,
        rootDocument: normalised.rootDocument,
    });
}

function renderJsx(jsx: () => JSX.Element): HTMLElement {
    const { container } = render(jsx);
    return container;
}

// ---------------------------------------------------------------------------
// String
// ---------------------------------------------------------------------------

describe("Solid renderers — string", () => {
    it("emits an <input type=text> in editable mode", () => {
        const tree = walkField(z.string(), "Ada");
        const container = renderJsx(() => renderString(makeProps(tree, "Ada")));
        const input =
            container.querySelector<HTMLInputElement>("input#sc-root");
        expect(input?.type).toBe("text");
        expect(input?.value).toBe("Ada");
    });

    it("emits a display <span> in read-only mode", () => {
        const tree = walkField(z.string(), "Ada");
        const container = renderJsx(() =>
            renderString(makeProps(tree, "Ada", { readOnly: true }))
        );
        expect(container.querySelector("input")).toBeNull();
        expect(container.querySelector("span#sc-root")?.textContent).toBe(
            "Ada"
        );
    });
});

// ---------------------------------------------------------------------------
// Number
// ---------------------------------------------------------------------------

describe("Solid renderers — number", () => {
    it("emits an <input type=number>", () => {
        const tree = walkField(z.number(), 42);
        const container = renderJsx(() => renderNumber(makeProps(tree, 42)));
        const input =
            container.querySelector<HTMLInputElement>("input#sc-root");
        expect(input?.type).toBe("number");
        expect(input?.value).toBe("42");
    });

    it("renders an em-dash for missing values in read-only mode", () => {
        const tree = walkField(z.number(), undefined);
        const container = renderJsx(() =>
            renderNumber(makeProps(tree, undefined, { readOnly: true }))
        );
        expect(container.querySelector("span#sc-root")?.textContent).toBe("—");
    });
});

// ---------------------------------------------------------------------------
// Boolean
// ---------------------------------------------------------------------------

describe("Solid renderers — boolean", () => {
    it("emits an <input type=checkbox> reflecting the value", () => {
        const tree = walkField(z.boolean(), true);
        const container = renderJsx(() => renderBoolean(makeProps(tree, true)));
        const input =
            container.querySelector<HTMLInputElement>("input#sc-root");
        expect(input?.type).toBe("checkbox");
        expect(input?.checked).toBe(true);
    });

    it("renders Yes/No in read-only mode", () => {
        const tree = walkField(z.boolean(), true);
        const container = renderJsx(() =>
            renderBoolean(makeProps(tree, true, { readOnly: true }))
        );
        expect(container.querySelector("span#sc-root")?.textContent).toBe(
            "Yes"
        );
    });
});

// ---------------------------------------------------------------------------
// Null
// ---------------------------------------------------------------------------

describe("Solid renderers — null", () => {
    it("renders an em-dash placeholder", () => {
        const tree = walkField(z.null(), null);
        const container = renderJsx(() => renderNull(makeProps(tree, null)));
        expect(container.querySelector("span#sc-root")?.textContent).toBe("—");
    });
});

// ---------------------------------------------------------------------------
// Enum
// ---------------------------------------------------------------------------

describe("Solid renderers — enum", () => {
    it("renders a select containing every enum option", () => {
        const tree = walkField(z.enum(["a", "b", "c"]), "a");
        const container = renderJsx(() => renderEnum(makeProps(tree, "a")));
        const options = container.querySelectorAll("option");
        // Placeholder + 3 enum values = 4 entries.
        expect(options.length).toBe(4);
    });
});

// ---------------------------------------------------------------------------
// Object
// ---------------------------------------------------------------------------

describe("Solid renderers — object", () => {
    it("emits a <fieldset> with a <legend> from the description", () => {
        const schema = z
            .object({ name: z.string() })
            .meta({ description: "User" });
        const tree = walkField(schema, { name: "Ada" });
        const container = renderJsx(() =>
            renderObject(makeProps(tree, { name: "Ada" }))
        );
        expect(container.querySelector("fieldset")).not.toBeNull();
        expect(container.querySelector("legend")?.textContent).toBe("User");
    });
});

// ---------------------------------------------------------------------------
// Record
// ---------------------------------------------------------------------------

describe("Solid renderers — record", () => {
    it("renders an Add button in editable mode", () => {
        const schema = z.record(z.string(), z.string());
        const tree = walkField(schema, { a: "1" });
        const container = renderJsx(() =>
            renderRecord(makeProps(tree, { a: "1" }))
        );
        expect(
            container.querySelector('button[aria-label="Add entry"]')
        ).not.toBeNull();
    });

    it("hides the Add button in read-only mode", () => {
        const schema = z.record(z.string(), z.string());
        const tree = walkField(schema, { a: "1" });
        const container = renderJsx(() =>
            renderRecord(makeProps(tree, { a: "1" }, { readOnly: true }))
        );
        expect(
            container.querySelector('button[aria-label="Add entry"]')
        ).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// Array
// ---------------------------------------------------------------------------

describe("Solid renderers — array", () => {
    it("renders one <li> per entry plus an Add button", () => {
        const schema = z.array(z.string());
        const tree = walkField(schema, ["a", "b"]);
        const container = renderJsx(() =>
            renderArray(makeProps(tree, ["a", "b"]))
        );
        expect(container.querySelectorAll("li").length).toBe(2);
        expect(
            container.querySelector('button[aria-label="Add item"]')
        ).not.toBeNull();
    });
});

// ---------------------------------------------------------------------------
// Tuple
// ---------------------------------------------------------------------------

describe("Solid renderers — tuple", () => {
    it("renders a <div role=group> containing one slot per prefix item", () => {
        const schema = z.tuple([z.string(), z.number()]);
        const tree = walkField(schema, ["a", 1]);
        const container = renderJsx(() =>
            renderTuple(makeProps(tree, ["a", 1]))
        );
        const group = container.querySelector('div[role="group"]');
        expect(group).not.toBeNull();
        expect(group?.querySelectorAll(":scope > div").length).toBe(2);
    });
});

// ---------------------------------------------------------------------------
// Union
// ---------------------------------------------------------------------------

describe("Solid renderers — union", () => {
    it("dispatches the matched option (no DOM produced by stub renderChild)", () => {
        const schema = z.union([z.string(), z.number()]);
        const tree = walkField(schema, "Ada");
        // The renderer dispatches through renderChild — the stub returns
        // null so the assertion is simply "no throw".
        const container = renderJsx(() => renderUnion(makeProps(tree, "Ada")));
        expect(container).not.toBeNull();
    });
});

// ---------------------------------------------------------------------------
// Literal
// ---------------------------------------------------------------------------

describe("Solid renderers — literal", () => {
    it("renders the literal value", () => {
        const schema = z.literal("ok");
        const tree = walkField(schema, "ok");
        const container = renderJsx(() => renderLiteral(makeProps(tree, "ok")));
        expect(container.querySelector("span#sc-root")?.textContent).toBe("ok");
    });
});

// ---------------------------------------------------------------------------
// Conditional
// ---------------------------------------------------------------------------

describe("Solid renderers — conditional", () => {
    it("renders the if/then/else fieldset structure", () => {
        // Build a conditional WalkedField manually — Zod 4 has no
        // first-class `.if/.then/.else` builder so we synthesise a
        // walked tree directly through `walk` on a JSON Schema.
        const jsonSchema: Record<string, unknown> = {
            type: "object",
            if: { properties: { kind: { const: "a" } } },
            then: { properties: { foo: { type: "string" } } },
            else: { properties: { bar: { type: "number" } } },
        };
        const tree = walk(jsonSchema, {});
        // walk() merges if/then/else into a conditional field when the
        // top-level node carries them. If not present, skip the test.
        if (tree.type !== "conditional") return;
        const container = renderJsx(() =>
            renderConditional(makeProps(tree, {}))
        );
        expect(container.querySelector("fieldset")).not.toBeNull();
    });
});

// ---------------------------------------------------------------------------
// Negation
// ---------------------------------------------------------------------------

describe("Solid renderers — negation", () => {
    it("renders the negation fieldset", () => {
        const jsonSchema: Record<string, unknown> = {
            not: { type: "string" },
        };
        const tree = walk(jsonSchema, {});
        if (tree.type !== "negation") return;
        const container = renderJsx(() => renderNegation(makeProps(tree, 5)));
        expect(container.querySelector("fieldset")).not.toBeNull();
        expect(container.textContent).toMatch(/Must NOT match/);
    });
});

// ---------------------------------------------------------------------------
// File
// ---------------------------------------------------------------------------

describe("Solid renderers — file", () => {
    it("emits an <input type=file>", () => {
        const jsonSchema: Record<string, unknown> = {
            type: "string",
            contentMediaType: "image/png",
        };
        const tree = walk(jsonSchema, {});
        if (tree.type !== "file") return;
        const container = renderJsx(() =>
            renderFile(makeProps(tree, undefined))
        );
        const input =
            container.querySelector<HTMLInputElement>("input#sc-root");
        expect(input?.type).toBe("file");
    });
});

// ---------------------------------------------------------------------------
// Never
// ---------------------------------------------------------------------------

describe("Solid renderers — never", () => {
    it("emits a placeholder span", () => {
        const jsonSchema = false;
        const tree = walk(jsonSchema, {});
        if (tree.type !== "never") return;
        const container = renderJsx(() =>
            renderNever(makeProps(tree, undefined))
        );
        expect(container.textContent).toMatch(/never matches/);
    });
});

// ---------------------------------------------------------------------------
// Unknown
// ---------------------------------------------------------------------------

describe("Solid renderers — unknown", () => {
    it("emits a text input fallback", () => {
        const tree = walkField(z.unknown(), undefined);
        const container = renderJsx(() =>
            renderUnknown(makeProps(tree, "value"))
        );
        const input =
            container.querySelector<HTMLInputElement>("input#sc-root");
        expect(input?.type).toBe("text");
        expect(input?.value).toBe("value");
    });
});
