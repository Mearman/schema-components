/**
 * Tests for field visibility and ordering.
 *
 * visible: false hides a field from rendering.
 * order: number sorts object fields (lower renders first).
 */
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { z } from "zod";
import {
    SchemaComponent,
    SchemaProvider,
} from "../src/react/SchemaComponent.tsx";
import { renderToHtml } from "../src/html/renderToHtml.ts";
import { shadcnResolver } from "../src/themes/shadcn.tsx";
import { mantineResolver } from "../src/themes/mantine.tsx";
import { muiResolver } from "../src/themes/mui.tsx";
import { radixResolver } from "../src/themes/radix.tsx";
import type { ComponentResolver } from "../src/core/renderer.ts";

// ---------------------------------------------------------------------------
// Visibility
// ---------------------------------------------------------------------------

describe("field visibility", () => {
    const schema = z.object({
        name: z.string().meta({ description: "Name" }),
        email: z.email().meta({ description: "Email" }),
        role: z.enum(["admin", "editor"]).meta({ description: "Role" }),
    });

    it("hides a field when visible is false", () => {
        const html = renderToString(
            createElement(SchemaComponent, {
                schema,
                value: { name: "Ada", email: "ada@example.com", role: "admin" },
                fields: { role: { visible: false } },
                readOnly: true,
            })
        );
        expect(html).toContain("Ada");
        expect(html).toContain("ada@example.com");
        expect(html).not.toContain("admin");
    });

    it("shows all fields by default", () => {
        const html = renderToString(
            createElement(SchemaComponent, {
                schema,
                value: { name: "Ada", email: "ada@example.com", role: "admin" },
                readOnly: true,
            })
        );
        expect(html).toContain("Ada");
        expect(html).toContain("ada@example.com");
        expect(html).toContain("admin");
    });

    it("hides multiple fields", () => {
        const html = renderToString(
            createElement(SchemaComponent, {
                schema,
                value: { name: "Ada", email: "ada@example.com", role: "admin" },
                fields: { email: { visible: false }, role: { visible: false } },
                readOnly: true,
            })
        );
        expect(html).toContain("Ada");
        expect(html).not.toContain("ada@example.com");
        expect(html).not.toContain("admin");
    });

    it("visible: true is a no-op", () => {
        const html = renderToString(
            createElement(SchemaComponent, {
                schema,
                value: { name: "Ada", email: "ada@example.com", role: "admin" },
                fields: { role: { visible: true } },
                readOnly: true,
            })
        );
        expect(html).toContain("admin");
    });
});

describe("field visibility — HTML renderer", () => {
    const schema = z.object({
        name: z.string().meta({ description: "Name" }),
        email: z.email().meta({ description: "Email" }),
    });

    it("hides a field in HTML output", () => {
        const html = renderToHtml(schema, {
            value: { name: "Ada", email: "ada@example.com" },
            fields: { email: { visible: false } },
            readOnly: true,
        });
        expect(html).toContain("Ada");
        expect(html).not.toContain("ada@example.com");
    });
});

// ---------------------------------------------------------------------------
// Ordering
// ---------------------------------------------------------------------------

describe("field ordering", () => {
    const schema = z.object({
        alpha: z.string().meta({ description: "Alpha" }),
        beta: z.string().meta({ description: "Beta" }),
        gamma: z.string().meta({ description: "Gamma" }),
    });

    it("renders fields in order via meta.order", () => {
        const html = renderToString(
            createElement(SchemaComponent, {
                schema,
                value: { alpha: "a", beta: "b", gamma: "g" },
                fields: {
                    gamma: { order: 1 },
                    alpha: { order: 2 },
                    beta: { order: 3 },
                },
                readOnly: true,
            })
        );

        const gammaIdx = html.indexOf("Gamma");
        const alphaIdx = html.indexOf("Alpha");
        const betaIdx = html.indexOf("Beta");

        // gamma should appear before alpha, alpha before beta
        expect(gammaIdx).toBeLessThan(alphaIdx);
        expect(alphaIdx).toBeLessThan(betaIdx);
    });

    it("fields without order come after ordered fields", () => {
        const html = renderToString(
            createElement(SchemaComponent, {
                schema,
                value: { alpha: "a", beta: "b", gamma: "g" },
                fields: {
                    gamma: { order: 1 },
                    // alpha and beta have no order
                },
                readOnly: true,
            })
        );

        const gammaIdx = html.indexOf("Gamma");
        const alphaIdx = html.indexOf("Alpha");

        expect(gammaIdx).toBeLessThan(alphaIdx);
    });

    it("default order is insertion order when no order specified", () => {
        const html = renderToString(
            createElement(SchemaComponent, {
                schema,
                value: { alpha: "a", beta: "b", gamma: "g" },
                readOnly: true,
            })
        );

        const alphaIdx = html.indexOf("Alpha");
        const betaIdx = html.indexOf("Beta");
        const gammaIdx = html.indexOf("Gamma");

        // Default: alpha → beta → gamma (insertion order)
        expect(alphaIdx).toBeLessThan(betaIdx);
        expect(betaIdx).toBeLessThan(gammaIdx);
    });
});

describe("field ordering — HTML renderer", () => {
    const schema = z.object({
        first: z.string().meta({ description: "First" }),
        second: z.string().meta({ description: "Second" }),
        third: z.string().meta({ description: "Third" }),
    });

    it("respects order in HTML output", () => {
        const html = renderToHtml(schema, {
            value: { first: "1", second: "2", third: "3" },
            fields: {
                third: { order: 1 },
                first: { order: 2 },
                second: { order: 3 },
            },
            readOnly: true,
        });

        const thirdIdx = html.indexOf("Third");
        const firstIdx = html.indexOf("First");
        const secondIdx = html.indexOf("Second");

        expect(thirdIdx).toBeLessThan(firstIdx);
        expect(firstIdx).toBeLessThan(secondIdx);
    });

    it("respects order in editable HTML output", () => {
        const html = renderToHtml(schema, {
            value: { first: "1", second: "2", third: "3" },
            fields: {
                third: { order: 1 },
                first: { order: 2 },
                second: { order: 3 },
            },
        });

        const thirdIdx = html.indexOf("Third");
        const firstIdx = html.indexOf("First");
        const secondIdx = html.indexOf("Second");

        expect(thirdIdx).toBeLessThan(firstIdx);
        expect(firstIdx).toBeLessThan(secondIdx);
    });
});

// ---------------------------------------------------------------------------
// Combined: visible + order
// ---------------------------------------------------------------------------

describe("visible + order combined", () => {
    const schema = z.object({
        a: z.string().meta({ description: "A" }),
        b: z.string().meta({ description: "B" }),
        c: z.string().meta({ description: "C" }),
        d: z.string().meta({ description: "D" }),
    });

    it("hidden field does not affect ordering of visible fields", () => {
        const html = renderToString(
            createElement(SchemaComponent, {
                schema,
                value: { a: "1", b: "2", c: "3", d: "4" },
                fields: {
                    d: { order: 1 },
                    b: { visible: false },
                    a: { order: 2 },
                    c: { order: 3 },
                },
                readOnly: true,
            })
        );

        expect(html).not.toContain("B");

        const dIdx = html.indexOf("D");
        const aIdx = html.indexOf("A");
        const cIdx = html.indexOf("C");

        expect(dIdx).toBeLessThan(aIdx);
        expect(aIdx).toBeLessThan(cIdx);
    });
});

// ---------------------------------------------------------------------------
// Cross-theme parity — every theme adapter must honour meta.order
// ---------------------------------------------------------------------------

describe("field ordering — theme adapter parity", () => {
    const schema = z.object({
        alpha: z.string().meta({ description: "AlphaLabel" }),
        beta: z.string().meta({ description: "BetaLabel" }),
        gamma: z.string().meta({ description: "GammaLabel" }),
    });
    // Distinct, easily-findable values so we can locate each field's
    // rendered output without relying on labels — read-only mantine,
    // MUI and Radix string renderers omit labels in presentation mode.
    const value = {
        alpha: "AAA-value",
        beta: "BBB-value",
        gamma: "GGG-value",
    };
    const fields = {
        gamma: { order: 1 },
        alpha: { order: 2 },
        beta: { order: 3 },
    } as const;

    const cases: { name: string; resolver: ComponentResolver }[] = [
        { name: "shadcn", resolver: shadcnResolver },
        { name: "mantine", resolver: mantineResolver },
        { name: "mui", resolver: muiResolver },
        { name: "radix", resolver: radixResolver },
    ];

    for (const { name, resolver } of cases) {
        it(`${name} adapter renders fields in meta.order`, () => {
            const html = renderToString(
                <SchemaProvider resolver={resolver}>
                    <SchemaComponent
                        schema={schema}
                        value={value}
                        fields={fields}
                        readOnly
                    />
                </SchemaProvider>
            );

            const gammaIdx = html.indexOf("GGG-value");
            const alphaIdx = html.indexOf("AAA-value");
            const betaIdx = html.indexOf("BBB-value");

            expect(gammaIdx).toBeGreaterThanOrEqual(0);
            expect(alphaIdx).toBeGreaterThanOrEqual(0);
            expect(betaIdx).toBeGreaterThanOrEqual(0);
            expect(gammaIdx).toBeLessThan(alphaIdx);
            expect(alphaIdx).toBeLessThan(betaIdx);
        });
    }
});
