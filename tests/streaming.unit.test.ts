/**
 * Streaming HTML renderer tests.
 */

import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
    renderToHtmlChunks,
    renderToHtmlStream,
    renderToHtmlReadable,
} from "../src/html/renderToHtmlStream.ts";
import { renderToHtml } from "../src/html/renderToHtml.ts";

// ---------------------------------------------------------------------------
// Sync chunks — renderToHtmlChunks
// ---------------------------------------------------------------------------

describe("renderToHtmlChunks", () => {
    it("yields multiple chunks for an object", () => {
        const schema = z.object({
            name: z.string().meta({ description: "Name" }),
            email: z.string().meta({ description: "Email" }),
        });
        const chunks = [
            ...renderToHtmlChunks(schema, {
                value: { name: "Ada", email: "ada@example.com" },
            }),
        ];
        // Should have: opening tag, field chunks, closing tag
        expect(
            chunks.length,
            `Expected >= 3 chunks, got ${String(chunks.length)}`
        ).toBeGreaterThanOrEqual(3);
    });

    it("concatenated chunks equal renderToHtml output", () => {
        const schema = z.object({
            name: z.string(),
            age: z.number(),
            active: z.boolean(),
        });
        const value = { name: "Ada", age: 36, active: true };
        const options = { value, readOnly: true };

        const fullHtml = renderToHtml(schema, options);
        const streamedHtml = [...renderToHtmlChunks(schema, options)].join("");

        expect(streamedHtml).toBe(fullHtml);
    });

    it("yields chunks for nested objects", () => {
        const schema = z.object({
            address: z.object({
                city: z.string(),
                postcode: z.string(),
            }),
        });
        const chunks = [
            ...renderToHtmlChunks(schema, {
                value: { address: { city: "London", postcode: "SW1A" } },
                readOnly: true,
            }),
        ];
        expect(chunks.length >= 2).toBeTruthy();
        const full = chunks.join("");
        expect(full).toMatch(/London/);
        expect(full).toMatch(/SW1A/);
    });

    it("yields one chunk for a leaf type", () => {
        const schema = z.object({ name: z.string() });
        const chunks = [
            ...renderToHtmlChunks(schema, { value: { name: "Ada" } }),
        ];
        // Opening + field (leaf rendered inline) + closing
        expect(chunks.length >= 1).toBeTruthy();
    });

    it("yields chunks for arrays", () => {
        const schema = z.object({
            tags: z.array(z.string()),
        });
        const chunks = [
            ...renderToHtmlChunks(schema, {
                value: { tags: ["a", "b", "c"] },
                readOnly: true,
            }),
        ];
        expect(chunks.length >= 3).toBeTruthy();
        const full = chunks.join("");
        expect(full).toMatch(/<ul/);
        expect(full).toMatch(/<li/);
    });

    it("handles empty objects", () => {
        const schema = z.object({});
        const chunks = [
            ...renderToHtmlChunks(schema, { value: {}, readOnly: true }),
        ];
        const full = chunks.join("");
        expect(full).toMatch(/sc-object/);
    });

    it("handles JSON Schema input", () => {
        const jsonSchema = {
            type: "object" as const,
            properties: {
                name: { type: "string" as const },
                age: { type: "number" as const },
            },
            required: ["name"],
        };
        const chunks = [
            ...renderToHtmlChunks(jsonSchema, {
                value: { name: "Ada", age: 36 },
                readOnly: true,
            }),
        ];
        const full = chunks.join("");
        expect(full).toMatch(/Ada/);
    });
});

// ---------------------------------------------------------------------------
// Async stream — renderToHtmlStream
// ---------------------------------------------------------------------------

describe("renderToHtmlStream", () => {
    it("yields the same chunks as the sync version", async () => {
        const schema = z.object({
            name: z.string(),
            email: z.string(),
            age: z.number(),
        });
        const value = { name: "Ada", email: "ada@example.com", age: 36 };
        const options = { value, readOnly: true };

        const syncChunks = [...renderToHtmlChunks(schema, options)];
        const asyncChunks: string[] = [];
        for await (const chunk of renderToHtmlStream(schema, options)) {
            asyncChunks.push(chunk);
        }

        expect(asyncChunks).toStrictEqual(syncChunks);
    });

    it("produces valid HTML when concatenated", async () => {
        const schema = z.object({
            name: z.string(),
            active: z.boolean(),
        });
        const chunks: string[] = [];
        for await (const chunk of renderToHtmlStream(schema, {
            value: { name: "Ada", active: true },
            readOnly: true,
        })) {
            chunks.push(chunk);
        }
        const html = chunks.join("");
        expect(html).toMatch(/Ada/);
        expect(html).toMatch(/Yes/);
    });
});

// ---------------------------------------------------------------------------
// ReadableStream — renderToHtmlReadable
// ---------------------------------------------------------------------------

describe("renderToHtmlReadable", () => {
    it("produces the same output as chunks when collected", async () => {
        const schema = z.object({
            name: z.string(),
            role: z.enum(["admin", "editor"]),
        });
        const value = { name: "Ada", role: "admin" };
        const options = { value, readOnly: true };

        const syncChunks = [...renderToHtmlChunks(schema, options)];
        const expected = syncChunks.join("");

        const stream = renderToHtmlReadable(schema, options);
        const reader = stream.getReader();
        const actualChunks: string[] = [];

        let result = await reader.read();
        while (!result.done) {
            actualChunks.push(result.value);
            result = await reader.read();
        }

        expect(actualChunks.join("")).toBe(expected);
    });

    it("can be cancelled", async () => {
        const schema = z.object({ name: z.string() });
        const stream = renderToHtmlReadable(schema, {
            value: { name: "Ada" },
            readOnly: true,
        });
        const reader = stream.getReader();

        // Read first chunk then cancel
        await reader.read();
        await reader.cancel();

        // Should not throw
        expect(true).toBeTruthy();
    });
});

// ---------------------------------------------------------------------------
// Equivalence — streaming output matches renderToHtml for various schemas
// ---------------------------------------------------------------------------

describe("Streaming equivalence with renderToHtml", () => {
    it("matches for editable object", () => {
        const schema = z.object({
            name: z.string(),
            email: z.email(),
        });
        const value = { name: "Ada", email: "ada@example.com" };
        const options = { value };

        const fullHtml = renderToHtml(schema, options);
        const streamedHtml = [...renderToHtmlChunks(schema, options)].join("");

        expect(streamedHtml).toBe(fullHtml);
    });

    it("matches for read-only object", () => {
        const schema = z.object({
            name: z.string(),
            age: z.number(),
            active: z.boolean(),
            role: z.enum(["admin", "editor"]),
        });
        const value = { name: "Ada", age: 36, active: true, role: "admin" };
        const options = { value, readOnly: true };

        const fullHtml = renderToHtml(schema, options);
        const streamedHtml = [...renderToHtmlChunks(schema, options)].join("");

        expect(streamedHtml).toBe(fullHtml);
    });

    it("matches for array", () => {
        const schema = z.object({
            tags: z.array(z.string()),
        });
        const value = { tags: ["a", "b", "c"] };
        const options = { value, readOnly: true };

        const fullHtml = renderToHtml(schema, options);
        const streamedHtml = [...renderToHtmlChunks(schema, options)].join("");

        expect(streamedHtml).toBe(fullHtml);
    });
});
