/**
 * HTML renderer tests.
 */

import { describe, it, expect } from "vitest";
import { z } from "zod";
import { renderToHtml } from "../src/html/renderToHtml.ts";
import {
    h,
    serialize,
    text,
    raw,
    serializeChunks,
    fragment,
    serializeFragment,
} from "../src/html/html.ts";

// ---------------------------------------------------------------------------
// Basic type rendering — read-only
// ---------------------------------------------------------------------------

describe("renderToHtml — string", () => {
    it("renders a string value in read-only", () => {
        const schema = z.object({ name: z.string() });
        const html = renderToHtml(schema, {
            value: { name: "Ada" },
            readOnly: true,
        });
        expect(html).toMatch(/Ada/);
        expect(html).toMatch(/sc-value/);
    });

    it("renders an empty string as dash", () => {
        const schema = z.object({ name: z.string() });
        const html = renderToHtml(schema, {
            value: { name: "" },
            readOnly: true,
        });
        expect(html).toMatch(/sc-value--empty/);
        expect(html).toMatch(/—/);
    });

    it("renders email as mailto link in read-only", () => {
        const schema = z.object({
            email: z.email(),
        });
        const html = renderToHtml(schema, {
            value: { email: "ada@example.com" },
            readOnly: true,
        });
        expect(html).toMatch(/href="mailto:ada@example.com"/);
    });

    it("renders URL as anchor in read-only", () => {
        const schema = z.object({
            url: z.string().meta({ format: "uri" }),
        });
        const html = renderToHtml(schema, {
            value: { url: "https://example.com" },
            readOnly: true,
        });
        expect(html).toMatch(/href="https:\/\/example.com"/);
    });
});

describe("renderToHtml — number", () => {
    it("renders a number value", () => {
        const schema = z.object({ age: z.number() });
        const html = renderToHtml(schema, { value: { age: 42 } });
        expect(html).toMatch(/42/);
    });

    it("renders null number as dash", () => {
        const schema = z.object({ age: z.number() });
        const html = renderToHtml(schema, {
            value: { age: undefined },
            readOnly: true,
        });
        expect(html).toMatch(/sc-value--empty/);
    });
});

describe("renderToHtml — boolean", () => {
    it("renders true as Yes", () => {
        const schema = z.object({ active: z.boolean() });
        const html = renderToHtml(schema, {
            value: { active: true },
            readOnly: true,
        });
        expect(html).toMatch(/Yes/);
    });

    it("renders false as No", () => {
        const schema = z.object({ active: z.boolean() });
        const html = renderToHtml(schema, {
            value: { active: false },
            readOnly: true,
        });
        expect(html).toMatch(/No/);
    });
});

describe("renderToHtml — enum", () => {
    it("renders enum value", () => {
        const schema = z.object({
            role: z.enum(["admin", "editor", "viewer"]),
        });
        const html = renderToHtml(schema, {
            value: { role: "admin" },
            readOnly: true,
        });
        expect(html).toMatch(/admin/);
    });
});

// ---------------------------------------------------------------------------
// Editable rendering
// ---------------------------------------------------------------------------

describe("renderToHtml — editable inputs", () => {
    it("renders string as text input", () => {
        const schema = z.object({ name: z.string() });
        const html = renderToHtml(schema, { value: { name: "Ada" } });
        expect(html).toMatch(/type="text"/);
        expect(html).toMatch(/value="Ada"/);
    });

    it("renders number as number input", () => {
        const schema = z.object({ age: z.number() });
        const html = renderToHtml(schema, { value: { age: 42 } });
        expect(html).toMatch(/type="number"/);
    });

    it("renders boolean as checkbox", () => {
        const schema = z.object({ active: z.boolean() });
        const html = renderToHtml(schema, { value: { active: true } });
        expect(html).toMatch(/type="checkbox"/);
        expect(html).toMatch(/checked/);
    });

    it("renders enum as select", () => {
        const schema = z.object({ role: z.enum(["admin", "editor"]) });
        const html = renderToHtml(schema, { value: { role: "admin" } });
        expect(html).toMatch(/<select/);
        expect(html).toMatch(/<option.*admin/);
    });
});

// ---------------------------------------------------------------------------
// Object and array
// ---------------------------------------------------------------------------

describe("renderToHtml — object", () => {
    it("renders read-only object as dl", () => {
        const schema = z.object({
            name: z.string().meta({ description: "Name" }),
            email: z.string().meta({ description: "Email" }),
        });
        const html = renderToHtml(schema, {
            value: { name: "Ada", email: "ada@example.com" },
            readOnly: true,
        });
        expect(html).toMatch(/<dl/);
        expect(html).toMatch(/<dt/);
        expect(html).toMatch(/<dd/);
        expect(html).toMatch(/Name/);
        expect(html).toMatch(/Ada/);
    });

    it("renders editable object as fieldset", () => {
        const schema = z.object({
            name: z.string().meta({ description: "Name" }),
        });
        const html = renderToHtml(schema, { value: { name: "Ada" } });
        expect(html).toMatch(/<fieldset/);
        expect(html).toMatch(/<label/);
        expect(html).toMatch(/type="text"/);
    });

    it("renders nested objects", () => {
        const schema = z.object({
            address: z.object({
                city: z.string().meta({ description: "City" }),
            }),
        });
        const html = renderToHtml(schema, {
            value: { address: { city: "London" } },
            readOnly: true,
        });
        expect(html).toMatch(/City/);
        expect(html).toMatch(/London/);
    });

    it("gives sibling fields without descriptions unique structural ids", () => {
        // Regression: when neither field carried a description, both children
        // previously fell back to an empty path, producing duplicate `id`/`for`
        // attributes that violate WCAG label-input pairing.
        const schema = z.object({
            alpha: z.string(),
            beta: z.string(),
        });
        const html = renderToHtml(schema, { value: { alpha: "a", beta: "b" } });

        const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
        const forAttrs = [...html.matchAll(/\sfor="([^"]+)"/g)].map(
            (m) => m[1]
        );

        expect(ids).toContain("sc-alpha");
        expect(ids).toContain("sc-beta");
        expect(forAttrs).toContain("sc-alpha");
        expect(forAttrs).toContain("sc-beta");
        expect(new Set(ids).size).toBe(ids.length);
        expect(new Set(forAttrs).size).toBe(forAttrs.length);
    });
});

describe("renderToHtml — array", () => {
    it("renders read-only array as ul", () => {
        const schema = z.object({
            tags: z.array(z.string()),
        });
        const html = renderToHtml(schema, {
            value: { tags: ["a", "b", "c"] },
            readOnly: true,
        });
        expect(html).toMatch(/<ul/);
        expect(html).toMatch(/<li/);
    });

    it("renders empty array", () => {
        const schema = z.object({
            tags: z.array(z.string()),
        });
        const html = renderToHtml(schema, {
            value: { tags: [] },
            readOnly: true,
        });
        expect(html).toMatch(/<ul/);
    });
});

// ---------------------------------------------------------------------------
// HTML escaping
// ---------------------------------------------------------------------------

describe("renderToHtml — escaping", () => {
    it("escapes HTML in string values", () => {
        const schema = z.object({ bio: z.string() });
        const html = renderToHtml(schema, {
            value: { bio: "<script>alert('xss')</script>" },
            readOnly: true,
        });
        expect(html).toMatch(/&lt;script&gt;/);
        expect(html).not.toMatch(/<script>/);
    });

    it("escapes HTML in input values", () => {
        const schema = z.object({ bio: z.string() });
        const html = renderToHtml(schema, {
            value: { bio: 'a"b' },
        });
        expect(html).toMatch(/&quot;/);
        expect(html).not.toMatch(/a"b/);
    });
});

// ---------------------------------------------------------------------------
// JSON Schema input
// ---------------------------------------------------------------------------

describe("renderToHtml — JSON Schema", () => {
    it("renders from raw JSON Schema", () => {
        const jsonSchema = {
            type: "object" as const,
            properties: {
                name: { type: "string" as const },
                age: { type: "number" as const },
            },
            required: ["name"],
        };
        const html = renderToHtml(jsonSchema, {
            value: { name: "Ada", age: 36 },
            readOnly: true,
        });
        expect(html).toMatch(/Ada/);
        expect(html).toMatch(/36/);
    });
});

// ---------------------------------------------------------------------------
// Custom resolver
// ---------------------------------------------------------------------------

describe("renderToHtml — custom resolver", () => {
    it("uses custom string renderer", () => {
        const schema = z.object({ name: z.string() });
        const html = renderToHtml(schema, {
            value: { name: "Ada" },
            readOnly: true,
            resolver: {
                string: (props) =>
                    `<mark>${typeof props.value === "string" ? props.value : ""}</mark>`,
            },
        });
        expect(html).toMatch(/<mark>Ada<\/mark>/);
    });

    it("falls back to default for unspecified types", () => {
        const schema = z.object({
            name: z.string(),
            age: z.number(),
        });
        const html = renderToHtml(schema, {
            value: { name: "Ada", age: 36 },
            readOnly: true,
            resolver: {
                string: (props) =>
                    `<b>${typeof props.value === "string" ? props.value : ""}</b>`,
            },
        });
        expect(html).toMatch(/<b>Ada<\/b>/);
        // Number should still use default renderer
        expect(html).toMatch(/36/);
    });
});

// ---------------------------------------------------------------------------
// writeOnly
// ---------------------------------------------------------------------------

describe("renderToHtml — writeOnly", () => {
    it("renders empty input when writeOnly", () => {
        const schema = z.object({ name: z.string() });
        const html = renderToHtml(schema, {
            value: { name: "Ada" },
            writeOnly: true,
        });
        expect(html).toMatch(/type="text"/);
        expect(html).not.toMatch(/value="Ada"/);
    });

    it("renders empty select when writeOnly enum", () => {
        const schema = z.object({ role: z.enum(["admin", "editor"]) });
        const html = renderToHtml(schema, {
            value: { role: "admin" },
            writeOnly: true,
        });
        expect(html).toMatch(/<select/);
        // Should not have "admin" selected
        expect(html).not.toMatch(/selected/);
    });
});

// ---------------------------------------------------------------------------
// h() builder, serialize, serializeChunks, fragment
// ---------------------------------------------------------------------------

describe("h() builder", () => {
    it("builds an element with tag and attributes", () => {
        const el = h("input", { type: "text", id: "name" });
        expect(el.tag).toBe("input");
        expect(el.attributes.type).toBe("text");
        expect(el.attributes.id).toBe("name");
        expect(el.children).toStrictEqual([]);
    });

    it("builds an element with text children", () => {
        const el = h("span", {}, "Hello");
        expect(el.children).toStrictEqual(["Hello"]);
    });

    it("drops undefined and null children", () => {
        const el = h("div", {}, "keep", undefined, null, "also keep");
        expect(el.children).toStrictEqual(["keep", "also keep"]);
    });

    it("drops false children", () => {
        const el = h("div", {}, false, "visible");
        expect(el.children).toStrictEqual(["visible"]);
    });

    it("accepts nested h() children", () => {
        const el = h("div", {}, h("span", {}, "inner"));
        expect(el.children.length).toBe(1);
        const child = el.children[0];
        // Narrow to HtmlElement by checking for tag property
        if (
            child !== undefined &&
            typeof child !== "string" &&
            "tag" in child
        ) {
            expect(child.tag).toBe("span");
        }
    });

    it("defaults attributes to empty record", () => {
        const el = h("div");
        expect(el.attributes).toStrictEqual({});
    });
});

describe("serialize", () => {
    it("serialises a void element", () => {
        expect(serialize(h("input", { type: "text" }))).toBe(
            '<input type="text">'
        );
    });

    it("serialises an element with children", () => {
        expect(serialize(h("div", {}, "hello"))).toBe("<div>hello</div>");
    });

    it("serialises an empty element", () => {
        expect(serialize(h("div", {}))).toBe("<div></div>");
    });

    it("omits undefined attributes", () => {
        expect(
            serialize(h("input", { type: "text", disabled: undefined }))
        ).toBe('<input type="text">');
    });

    it("omits false attributes", () => {
        expect(serialize(h("input", { disabled: false }))).toBe("<input>");
    });

    it("renders boolean true attribute as name only", () => {
        expect(serialize(h("input", { disabled: true }))).toBe(
            "<input disabled>"
        );
    });

    it("escapes text content", () => {
        expect(serialize(h("div", {}, '<script>alert("xss")</script>'))).toBe(
            "<div>&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;</div>"
        );
    });

    it("escapes attribute values", () => {
        expect(serialize(h("div", { title: '"hello"' }))).toBe(
            '<div title="&quot;hello&quot;"></div>'
        );
    });

    it("serialises text nodes", () => {
        expect(serialize(text("hello"))).toBe("hello");
    });

    it("serialises raw nodes verbatim", () => {
        expect(serialize(raw("<b>bold</b>"))).toBe("<b>bold</b>");
    });

    it("returns empty string for undefined", () => {
        expect(serialize(undefined)).toBe("");
    });

    it("returns empty string for null", () => {
        expect(serialize(null)).toBe("");
    });

    it("returns empty string for false", () => {
        expect(serialize(false)).toBe("");
    });

    it("serialises a fragment without wrapper", () => {
        const frag = fragment("a", "b");
        expect(serialize(frag)).toBe("ab");
    });

    it("serialises number attributes as strings", () => {
        expect(serialize(h("meter", { max: 100 }))).toBe(
            '<meter max="100"></meter>'
        );
    });
});

describe("serializeChunks", () => {
    it("yields single chunk for void element", () => {
        const chunks = [...serializeChunks(h("input", { type: "text" }))];
        expect(chunks).toStrictEqual(['<input type="text">']);
    });

    it("yields opening and closing for empty element", () => {
        const chunks = [...serializeChunks(h("div", {}))];
        expect(chunks).toStrictEqual(["<div></div>"]);
    });

    it("yields open, children, close for element with children", () => {
        const chunks = [...serializeChunks(h("div", {}, "hello"))];
        expect(chunks).toStrictEqual(["<div>", "hello", "</div>"]);
    });

    it("yields string directly", () => {
        const chunks = [...serializeChunks("hello")];
        expect(chunks).toStrictEqual(["hello"]);
    });

    it("yields text node content", () => {
        const chunks = [...serializeChunks(text("hello"))];
        expect(chunks).toStrictEqual(["hello"]);
    });

    it("yields raw node verbatim", () => {
        const chunks = [...serializeChunks(raw("<b>bold</b>"))];
        expect(chunks).toStrictEqual(["<b>bold</b>"]);
    });

    it("returns nothing for undefined", () => {
        const chunks = [...serializeChunks(undefined)];
        expect(chunks).toStrictEqual([]);
    });

    it("returns nothing for null", () => {
        const chunks = [...serializeChunks(null)];
        expect(chunks).toStrictEqual([]);
    });

    it("returns nothing for false", () => {
        const chunks = [...serializeChunks(false)];
        expect(chunks).toStrictEqual([]);
    });

    it("recursively yields nested elements", () => {
        const el = h("div", {}, h("span", {}, "inner"));
        const chunks = [...serializeChunks(el)];
        expect(chunks).toStrictEqual([
            "<div>",
            "<span>",
            "inner",
            "</span>",
            "</div>",
        ]);
    });

    it("escapes text chunks", () => {
        const chunks = [...serializeChunks(h("div", {}, "<script>"))];
        expect(chunks).toStrictEqual(["<div>", "&lt;script&gt;", "</div>"]);
    });
});

// ---------------------------------------------------------------------------
// Discriminated union — tab id sanitisation
// ---------------------------------------------------------------------------

describe("renderToHtml — discriminated union tab ids", () => {
    it("produces valid HTML ids and matching aria-labelledby when nested under arrays of objects", () => {
        // Nested discriminated union at path `things[0]`: the array-of-objects
        // pattern produces a structural path containing both brackets and
        // (potentially) dots. Without sanitisation the tab/panel ids include
        // those raw characters, producing invalid CSS selectors and breaking
        // the `aria-labelledby` association on the tabpanel.
        const schema = z.object({
            things: z.array(
                z.discriminatedUnion("kind", [
                    z.object({ kind: z.literal("a"), a: z.string() }),
                    z.object({ kind: z.literal("b"), b: z.number() }),
                ])
            ),
        });

        const html = renderToHtml(schema, {
            value: { things: [{ kind: "b", b: 7 }] },
        });

        // Pull every `id="..."` on a tab button and the `aria-labelledby`
        // on the tabpanel, then check structural validity.
        const tabButtonIds = [
            ...html.matchAll(/<button[^>]*role="tab"[^>]*\bid="([^"]+)"/g),
        ].map((m) => m[1] ?? "");
        expect(tabButtonIds.length).toBe(2);

        const validIdPattern = /^[A-Za-z][A-Za-z0-9_-]*$/;
        for (const id of tabButtonIds) {
            expect(id).toMatch(validIdPattern);
            // Defensive structural checks — the bug substituted `.` / `[` / `]`
            // directly into the id; assert none survived sanitisation.
            expect(id).not.toContain(".");
            expect(id).not.toContain("[");
            expect(id).not.toContain("]");
        }

        const panelMatch =
            /<div[^>]*role="tabpanel"[^>]*\baria-labelledby="([^"]+)"/.exec(
                html
            );
        expect(panelMatch).not.toBeNull();
        const labelledBy = panelMatch?.[1] ?? "";

        // Active tab is the one carrying `aria-selected="true"`. The panel's
        // `aria-labelledby` must reference that id exactly. Attribute order
        // inside the tag is not guaranteed, so match the whole tag and pull
        // both attributes independently.
        const buttonTags = [
            ...html.matchAll(/<button\b[^>]*role="tab"[^>]*>/g),
        ].map((m) => m[0]);
        const activeButton = buttonTags.find((tag) =>
            tag.includes('aria-selected="true"')
        );
        expect(activeButton).toBeDefined();
        const activeIdMatch = activeButton?.match(/\bid="([^"]+)"/);
        expect(activeIdMatch).not.toBeNull();
        const activeId = activeIdMatch?.[1] ?? "";
        expect(labelledBy).toBe(activeId);
        expect(tabButtonIds).toContain(activeId);
    });
});

describe("fragment", () => {
    it("creates an element with empty tag", () => {
        const frag = fragment("a", "b");
        expect(frag.tag).toBe("");
        expect(frag.children).toStrictEqual(["a", "b"]);
    });

    it("serialises to concatenated children", () => {
        expect(serializeFragment(fragment("a", h("br", {})))).toBe("a<br>");
    });
});

// ---------------------------------------------------------------------------
// Recursion limit and unhandled-type fallback
// ---------------------------------------------------------------------------

describe("renderToHtml — recursion limit", () => {
    it("emits a recursive placeholder using the description when present", () => {
        // 12 levels of self-reference; MAX_HTML_DEPTH is 10, so at least one
        // descent must hit the recursion guard.
        const inner: Record<string, unknown> = {
            type: "object",
            description: "Person",
            properties: {},
        };
        let cursor: Record<string, unknown> = inner;
        for (let i = 0; i < 12; i++) {
            const next: Record<string, unknown> = {
                type: "object",
                description: "Person",
                properties: {},
            };
            cursor.child = next;
            (cursor.properties as Record<string, unknown>).child = next;
            cursor = next;
        }
        const html = renderToHtml(inner, {});
        expect(html).toMatch(/sc-recursive/);
        expect(html).toMatch(/Person \(recursive\)/);
    });

    it('emits a recursive placeholder labelled "schema" when no description is set', () => {
        const inner: Record<string, unknown> = {
            type: "object",
            properties: {},
        };
        let cursor: Record<string, unknown> = inner;
        for (let i = 0; i < 12; i++) {
            const next: Record<string, unknown> = {
                type: "object",
                properties: {},
            };
            cursor.child = next;
            (cursor.properties as Record<string, unknown>).child = next;
            cursor = next;
        }
        const html = renderToHtml(inner, {});
        expect(html).toMatch(/sc-recursive/);
        expect(html).toMatch(/schema \(recursive\)/);
    });
});
