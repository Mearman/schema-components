/**
 * Tests for `unevaluatedProperties` / `unevaluatedItems` threading
 * across `allOf` branches (JSON Schema 2020-12 §11.2, §11.3).
 *
 * Per spec the unevaluated keywords on a parent must consider properties
 * (or array items) declared in any sibling `allOf` branch as "evaluated"
 * — without that, a parent's `unevaluatedProperties: false` would
 * incorrectly reject every property declared in an extension branch.
 * The walker now includes the parent as the first branch in the merge
 * and picks the strictest `unevaluatedProperties` / `unevaluatedItems`
 * across parent and branches.
 */
import { describe, it, expect } from "vitest";
import { walk } from "../src/core/walker.ts";

describe("walker — unevaluatedProperties across allOf", () => {
    it("evaluates extension-branch properties under parent unevaluatedProperties: false", () => {
        const tree = walk(
            {
                type: "object",
                allOf: [
                    {
                        type: "object",
                        properties: { id: { type: "string" } },
                        required: ["id"],
                    },
                    {
                        type: "object",
                        properties: { name: { type: "string" } },
                    },
                ],
                unevaluatedProperties: false,
            },
            {}
        );
        if (tree.type !== "object") {
            expect.unreachable("expected object tree");
            return;
        }
        // The parent's `unevaluatedProperties: false` survives the merge.
        expect(tree.unevaluatedPropertiesClosed).toBe(true);
        // Both branches contributed properties.
        expect(Object.keys(tree.fields).sort()).toStrictEqual(["id", "name"]);
    });

    it("picks the strictest unevaluatedProperties across branches (false beats schema)", () => {
        const tree = walk(
            {
                allOf: [
                    {
                        type: "object",
                        properties: { id: { type: "string" } },
                        unevaluatedProperties: { type: "string" },
                    },
                    {
                        type: "object",
                        properties: { name: { type: "string" } },
                        unevaluatedProperties: false,
                    },
                ],
            },
            {}
        );
        if (tree.type !== "object") {
            expect.unreachable("expected object tree");
            return;
        }
        expect(tree.unevaluatedPropertiesClosed).toBe(true);
        // The `{ type: "string" }` value is overridden by the stricter
        // `false`, so the schema-form should not appear on the field.
        expect(tree.unevaluatedProperties).toBe(undefined);
    });

    it("picks the strictest unevaluatedProperties across branches (schema beats true)", () => {
        const tree = walk(
            {
                allOf: [
                    {
                        type: "object",
                        properties: { id: { type: "string" } },
                        unevaluatedProperties: true,
                    },
                    {
                        type: "object",
                        properties: { name: { type: "string" } },
                        unevaluatedProperties: { type: "number" },
                    },
                ],
            },
            {}
        );
        if (tree.type !== "object") {
            expect.unreachable("expected object tree");
            return;
        }
        expect(tree.unevaluatedPropertiesClosed).toBeUndefined();
        // The schema form wins over `true`.
        expect(tree.unevaluatedProperties?.type).toBe("number");
    });

    it("preserves parent siblings (type, properties, required) when allOf is present", () => {
        const tree = walk(
            {
                type: "object",
                properties: { parentField: { type: "string" } },
                required: ["parentField"],
                allOf: [
                    {
                        type: "object",
                        properties: { childField: { type: "number" } },
                    },
                ],
            },
            {}
        );
        if (tree.type !== "object") {
            expect.unreachable("expected object tree");
            return;
        }
        expect(Object.keys(tree.fields).sort()).toStrictEqual([
            "childField",
            "parentField",
        ]);
        expect(tree.requiredFields).toContain("parentField");
    });
});

describe("walker — unevaluatedItems across allOf", () => {
    it("evaluates prefixItems declared in a sub-allOf branch under parent unevaluatedItems: false", () => {
        const tree = walk(
            {
                type: "array",
                allOf: [
                    {
                        type: "array",
                        prefixItems: [{ type: "string" }, { type: "number" }],
                    },
                ],
                unevaluatedItems: false,
            },
            {}
        );
        // The tree should be a tuple (prefixItems present) with no
        // `unevaluatedItems` field on it — the strictest value `false`
        // surfaces via the object walker's closed flag for arrays does
        // not yet have a dedicated field, so we assert via the field
        // shape (the walker's tuple builder consumes `prefixItems`).
        if (tree.type !== "tuple") {
            expect.unreachable("expected tuple tree (prefixItems merged in)");
            return;
        }
        expect(tree.prefixItems.length).toBe(2);
        expect(tree.prefixItems[0]?.type).toBe("string");
        expect(tree.prefixItems[1]?.type).toBe("number");
    });
});
