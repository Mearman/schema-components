/**
 * Tests for contentSchema extraction from content-encoded string fields.
 *
 * When a string node carries contentEncoding/contentMediaType and a
 * contentSchema sub-schema, the walker should walk the contentSchema
 * recursively and attach it as meta.decodedSchema on the resulting
 * string field.
 */

import { describe, it, expect } from "vitest";
import { walk } from "../src/core/walker.ts";
import type { WalkedField } from "../src/core/types.ts";

// ---------------------------------------------------------------------------
// Helper — narrow unknown to WalkedField
// ---------------------------------------------------------------------------

function isWalkedField(value: unknown): value is WalkedField {
    return (
        typeof value === "object" &&
        value !== null &&
        "type" in value &&
        "meta" in value &&
        "constraints" in value
    );
}

// ---------------------------------------------------------------------------
// contentSchema on string fields
// ---------------------------------------------------------------------------

describe("contentSchema extraction", () => {
    it("walks contentSchema and attaches as meta.decodedSchema", () => {
        const tree = walk({
            type: "string",
            contentEncoding: "base64",
            contentMediaType: "application/json",
            contentSchema: {
                type: "object",
                properties: {
                    name: { type: "string" },
                    age: { type: "number" },
                },
            },
        });

        expect(tree.type).toBe("string");
        if (tree.type !== "string") return;

        expect(tree.constraints.contentEncoding).toBe("base64");
        expect(tree.constraints.contentMediaType).toBe("application/json");

        const decoded = tree.meta.decodedSchema;
        expect(decoded).toBeDefined();
        if (!isWalkedField(decoded)) return;

        expect(decoded.type).toBe("object");
        if (decoded.type !== "object") return;
        expect(decoded.fields.name).toBeDefined();
        if (decoded.fields.name === undefined) return;
        expect(decoded.fields.name.type).toBe("string");
    });

    it("does not set decodedSchema when contentSchema is absent", () => {
        const tree = walk({
            type: "string",
            contentEncoding: "base64",
        });

        expect(tree.type).toBe("string");
        if (tree.type !== "string") return;
        expect(tree.meta.decodedSchema).toBeUndefined();
    });

    it("does not set decodedSchema when contentSchema is not an object", () => {
        const tree = walk({
            type: "string",
            contentEncoding: "base64",
            contentSchema: true,
        });

        expect(tree.type).toBe("string");
        if (tree.type !== "string") return;
        expect(tree.meta.decodedSchema).toBeUndefined();
    });

    it("walks nested contentSchema correctly", () => {
        const tree = walk({
            type: "string",
            contentEncoding: "base64",
            contentMediaType: "application/json",
            contentSchema: {
                type: "array",
                items: { type: "string" },
            },
        });

        expect(tree.type).toBe("string");
        if (tree.type !== "string") return;

        const decoded = tree.meta.decodedSchema;
        expect(decoded).toBeDefined();
        if (!isWalkedField(decoded)) return;

        expect(decoded.type).toBe("array");
        if (decoded.type !== "array") return;
        expect(decoded.element).toBeDefined();
        if (decoded.element === undefined) return;
        expect(decoded.element.type).toBe("string");
    });
});
