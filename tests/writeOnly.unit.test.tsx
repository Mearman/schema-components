/**
 * Tests for writeOnly behaviour across all renderers.
 *
 * writeOnly blanks the current value so it is not revealed to the user.
 * Relevant for: string, number, boolean, enum, unknown.
 * Containers (object, array, record) propagate editability to children.
 * Literal and file are unaffected (literal is constant; file can't show values).
 */
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { z } from "zod";
import { SchemaComponent } from "../src/react/SchemaComponent.tsx";
import { renderToHtml } from "../src/html/renderToHtml.ts";

// ---------------------------------------------------------------------------
// Headless React — writeOnly via component prop
// ---------------------------------------------------------------------------

describe("writeOnly — headless React", () => {
    it("blanks string value", () => {
        const html = renderToString(
            createElement(SchemaComponent, {
                schema: z.object({ password: z.string() }),
                value: { password: "secret123" },
                writeOnly: true,
            })
        );
        expect(html).not.toContain("secret123");
    });

    it("blanks number value", () => {
        const html = renderToString(
            createElement(SchemaComponent, {
                schema: z.object({ pin: z.number() }),
                value: { pin: 1234 },
                writeOnly: true,
            })
        );
        expect(html).not.toContain("1234");
    });

    it("renders boolean as unchecked", () => {
        const html = renderToString(
            createElement(SchemaComponent, {
                schema: z.object({ active: z.boolean() }),
                value: { active: true },
                writeOnly: true,
            })
        );
        expect(html).not.toContain("checked");
    });

    it("blanks enum value", () => {
        const html = renderToString(
            createElement(SchemaComponent, {
                schema: z.object({ role: z.enum(["admin", "editor"]) }),
                value: { role: "admin" },
                writeOnly: true,
            })
        );
        // The select should have empty value, not "admin"
        expect(html).toMatch(/value=""/);
    });

    it("blanks unknown value", () => {
        const html = renderToString(
            createElement(SchemaComponent, {
                schema: z.object({ data: z.unknown() }),
                value: { data: "sensitive" },
                writeOnly: true,
            })
        );
        expect(html).not.toContain("sensitive");
    });

    it("propagates through object to children", () => {
        const html = renderToString(
            createElement(SchemaComponent, {
                schema: z.object({
                    credentials: z.object({
                        password: z.string(),
                        apiKey: z.string(),
                    }),
                }),
                value: {
                    credentials: { password: "secret", apiKey: "key-123" },
                },
                writeOnly: true,
            })
        );
        expect(html).not.toContain("secret");
        expect(html).not.toContain("key-123");
    });

    it("propagates through array to children", () => {
        const html = renderToString(
            createElement(SchemaComponent, {
                schema: z.object({ tokens: z.array(z.string()) }),
                value: { tokens: ["tok-1", "tok-2"] },
                writeOnly: true,
            })
        );
        expect(html).not.toContain("tok-1");
        expect(html).not.toContain("tok-2");
    });

    it("writeOnly on specific fields via fields prop", () => {
        const html = renderToString(
            createElement(SchemaComponent, {
                schema: z.object({
                    name: z.string(),
                    password: z.string(),
                }),
                value: { name: "Ada", password: "secret" },
                fields: { password: { writeOnly: true } },
            })
        );
        expect(html).toContain("Ada");
        expect(html).not.toContain("secret");
    });
});

// ---------------------------------------------------------------------------
// HTML renderer — writeOnly
// ---------------------------------------------------------------------------

describe("writeOnly — HTML renderer", () => {
    it("blanks string value", () => {
        const html = renderToHtml(z.object({ password: z.string() }), {
            value: { password: "secret123" },
            writeOnly: true,
        });
        expect(html).not.toContain("secret123");
    });

    it("blanks number value", () => {
        const html = renderToHtml(z.object({ pin: z.number() }), {
            value: { pin: 1234 },
            writeOnly: true,
        });
        expect(html).not.toContain("1234");
    });

    it("renders boolean as unchecked", () => {
        const html = renderToHtml(z.object({ active: z.boolean() }), {
            value: { active: true },
            writeOnly: true,
        });
        expect(html).not.toContain("checked");
    });

    it("blanks enum value", () => {
        const html = renderToHtml(
            z.object({ role: z.enum(["admin", "editor"]) }),
            { value: { role: "admin" }, writeOnly: true }
        );
        // The selected value is blanked, not the option labels
        expect(html).not.toMatch(/<option[^>]*selected/);
        // The select has no value attribute set
        const selectMatch = /<select[^>]*>/.exec(html);
        expect(selectMatch).not.toBeNull();
        expect(selectMatch?.[0]).not.toContain('value="admin"');
    });

    it("blanks unknown value", () => {
        const html = renderToHtml(z.object({ data: z.unknown() }), {
            value: { data: "sensitive" },
            writeOnly: true,
        });
        expect(html).not.toContain("sensitive");
    });

    it("propagates through object to children", () => {
        const html = renderToHtml(
            z.object({
                credentials: z.object({
                    password: z.string(),
                    apiKey: z.string(),
                }),
            }),
            {
                value: { credentials: { password: "secret", apiKey: "key" } },
                writeOnly: true,
            }
        );
        expect(html).not.toContain("secret");
        expect(html).not.toContain("key");
    });

    it("writeOnly on specific fields via fields prop", () => {
        const html = renderToHtml(
            z.object({ name: z.string(), password: z.string() }),
            {
                value: { name: "Ada", password: "secret" },
                fields: { password: { writeOnly: true } },
            }
        );
        expect(html).toContain("Ada");
        expect(html).not.toContain("secret");
    });
});

// ---------------------------------------------------------------------------
// Schema-level writeOnly
// ---------------------------------------------------------------------------

describe("writeOnly — schema meta", () => {
    it("respects writeOnly from .meta()", () => {
        const schema = z.object({
            name: z.string(),
            secret: z.string().meta({ writeOnly: true }),
        });

        const html = renderToString(
            createElement(SchemaComponent, {
                schema,
                value: { name: "Ada", secret: "hidden" },
            })
        );
        expect(html).toContain("Ada");
        expect(html).not.toContain("hidden");
    });

    it("component writeOnly overrides schema for specific field", () => {
        const schema = z.object({
            name: z.string(),
            secret: z.string().meta({ writeOnly: true }),
        });

        const html = renderToString(
            createElement(SchemaComponent, {
                schema,
                value: { name: "Ada", secret: "hidden" },
                fields: { secret: { writeOnly: false } },
            })
        );
        // writeOnly: false overrides schema-level writeOnly
        expect(html).toContain("hidden");
    });
});
