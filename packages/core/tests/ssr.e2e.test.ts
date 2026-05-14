/**
 * SSR (server-side rendering) smoke test.
 *
 * Proves the React rendering path works in a Node.js environment
 * without a browser — no window/document references, no useLayoutEffect,
 * no stateful hooks during read-only rendering.
 */
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { z } from "zod";
import { SchemaComponent } from "../src/react/SchemaComponent.tsx";
import { SchemaView } from "../src/react/SchemaView.tsx";

describe("SSR — renderToString", () => {
    it("renders a read-only object to string", () => {
        const schema = z.object({
            name: z.string().meta({ description: "Name" }),
            age: z.number().meta({ description: "Age" }),
        });
        const html = renderToString(
            createElement(SchemaComponent, {
                schema,
                value: { name: "Ada", age: 36 },
                readOnly: true,
            })
        );
        expect(typeof html === "string").toBeTruthy();
        expect(html.includes("Ada")).toBeTruthy();
    });

    it("renders string values in read-only mode", () => {
        const html = renderToString(
            createElement(SchemaComponent, {
                schema: z.string(),
                value: "hello",
                readOnly: true,
            })
        );
        expect(html.includes("hello")).toBeTruthy();
    });

    it("renders boolean values in read-only mode", () => {
        const html = renderToString(
            createElement(SchemaComponent, {
                schema: z.boolean(),
                value: true,
                readOnly: true,
            })
        );
        expect(html.includes("Yes")).toBeTruthy();
    });

    it("renders nested objects in read-only mode", () => {
        const schema = z.object({
            address: z.object({
                city: z.string().meta({ description: "City" }),
                postcode: z.string().meta({ description: "Postcode" }),
            }),
        });
        const html = renderToString(
            createElement(SchemaComponent, {
                schema,
                value: { address: { city: "London", postcode: "SW1A 1AA" } },
                readOnly: true,
            })
        );
        expect(html.includes("London")).toBeTruthy();
        expect(html.includes("SW1A 1AA")).toBeTruthy();
    });

    it("renders arrays in read-only mode", () => {
        const schema = z.object({
            tags: z.array(z.string()),
        });
        const html = renderToString(
            createElement(SchemaComponent, {
                schema,
                value: { tags: ["alpha", "beta"] },
                readOnly: true,
            })
        );
        expect(html.includes("alpha")).toBeTruthy();
        expect(html.includes("beta")).toBeTruthy();
    });

    it("renders discriminated unions in read-only mode", () => {
        const schema = z.discriminatedUnion("method", [
            z.object({
                method: z.literal("card"),
                cardNumber: z.string(),
            }),
            z.object({
                method: z.literal("bank"),
                accountNumber: z.string(),
            }),
        ]);
        const html = renderToString(
            createElement(SchemaComponent, {
                schema,
                value: { method: "card", cardNumber: "4111111111111111" },
                readOnly: true,
            })
        );
        expect(html.includes("4111111111111111")).toBeTruthy();
    });
});

// ---------------------------------------------------------------------------
// SchemaView — server component (no hooks)
// ---------------------------------------------------------------------------

describe("SchemaView — server component", () => {
    it("renders read-only without hooks", () => {
        const schema = z.object({
            name: z.string().meta({ description: "Name" }),
            age: z.number().meta({ description: "Age" }),
        });
        const html = renderToString(
            createElement(SchemaView, {
                schema,
                value: { name: "Ada", age: 36 },
            })
        );
        expect(html.includes("Ada")).toBeTruthy();
        expect(html.includes("36")).toBeTruthy();
    });

    it("renders JSON Schema input", () => {
        const html = renderToString(
            createElement(SchemaView, {
                schema: { type: "string", format: "date" },
                value: "2024-06-15",
            })
        );
        expect(html.includes("2024")).toBeTruthy();
    });

    it("renders nested objects", () => {
        const schema = z.object({
            address: z.object({
                city: z.string().meta({ description: "City" }),
            }),
        });
        const html = renderToString(
            createElement(SchemaView, {
                schema,
                value: { address: { city: "London" } },
            })
        );
        expect(html.includes("London")).toBeTruthy();
    });

    it("renders discriminated unions without tabs", () => {
        const schema = z.discriminatedUnion("method", [
            z.object({ method: z.literal("card"), cardNumber: z.string() }),
            z.object({ method: z.literal("bank"), accountNumber: z.string() }),
        ]);
        const html = renderToString(
            createElement(SchemaView, {
                schema,
                value: { method: "card", cardNumber: "4242424242424242" },
            })
        );
        expect(html.includes("4242424242424242")).toBeTruthy();
        // Read-only: no tab buttons
        expect(!html.includes("tablist")).toBeTruthy();
    });

    it("produces same output as SchemaComponent readOnly", () => {
        const schema = z.object({
            name: z.string(),
            active: z.boolean(),
            role: z.enum(["admin", "editor"]),
        });
        const value = { name: "Ada", active: true, role: "admin" };

        const htmlComponent = renderToString(
            createElement(SchemaComponent, { schema, value, readOnly: true })
        );
        const htmlView = renderToString(
            createElement(SchemaView, { schema, value })
        );

        expect(htmlComponent).toBe(htmlView);
    });
});
