/**
 * (Agent D) — walker behaviour for boolean sub-schemas and
 * non-primitive `enum`/`const` values.
 *
 * Covers the spec-correctness fixes from JSON Schema review :
 *
 *   1. `items: true` / `items: false` route through `walkSubSchema`
 *      rather than `getObject` (Draft 06+).
 *   2. `prefixItems` entries may be booleans (Draft 2020-12 §10.3.1.1)
 *      and must be preserved.
 *   3. Tuple `unevaluatedItems` is computed on the tuple branch.
 *   4. `unevaluatedItems: false` surfaces as the structural
 *      `unevaluatedItemsClosed: true` flag (parallel to
 *      `additionalPropertiesClosed` on `ObjectField`).
 *   5. `const` and `enum` preserve any JSON value verbatim per Draft
 *      2020-12 §6.1.2/§6.1.3 — including objects and arrays.
 */
import { describe, it, expect } from "vitest";
import { walk } from "../src/core/walker.ts";
import type { Diagnostic } from "../src/core/diagnostics.ts";

// ---------------------------------------------------------------------------
// Boolean `items`
// ---------------------------------------------------------------------------

describe("walker — boolean items", () => {
    it("items: false produces an array whose element is `never`", () => {
        const tree = walk({ type: "array", items: false });
        expect(tree.type).toBe("array");
        if (tree.type !== "array") return;
        expect(tree.element).toBeDefined();
        expect(tree.element?.type).toBe("never");
    });

    it("items: true produces an array whose element is `unknown`", () => {
        const tree = walk({ type: "array", items: true });
        expect(tree.type).toBe("array");
        if (tree.type !== "array") return;
        expect(tree.element).toBeDefined();
        expect(tree.element?.type).toBe("unknown");
        // Permissive — editable, not presentation-only.
        expect(tree.element?.editability).toBe("editable");
    });
});

// ---------------------------------------------------------------------------
// Boolean prefixItems
// ---------------------------------------------------------------------------

describe("walker — boolean prefixItems", () => {
    it("preserves all three positions including booleans", () => {
        const tree = walk({
            type: "array",
            prefixItems: [{ type: "string" }, true, false],
        });
        expect(tree.type).toBe("tuple");
        if (tree.type !== "tuple") return;
        expect(tree.prefixItems).toHaveLength(3);
        expect(tree.prefixItems[0]?.type).toBe("string");
        // `true` permits any → unknown sub-schema.
        expect(tree.prefixItems[1]?.type).toBe("unknown");
        // `false` rejects all → never sub-schema.
        expect(tree.prefixItems[2]?.type).toBe("never");
    });

    it("does not collapse positions when middle entry is a boolean", () => {
        // Regression check for the previous `filter(isObject)` bug,
        // which shifted later positions into earlier indices.
        const tree = walk({
            type: "array",
            prefixItems: [true, { type: "string" }],
        });
        expect(tree.type).toBe("tuple");
        if (tree.type !== "tuple") return;
        expect(tree.prefixItems).toHaveLength(2);
        expect(tree.prefixItems[0]?.type).toBe("unknown");
        expect(tree.prefixItems[1]?.type).toBe("string");
    });
});

// ---------------------------------------------------------------------------
// Tuple unevaluatedItems
// ---------------------------------------------------------------------------

describe("walker — tuple unevaluatedItems", () => {
    it("unevaluatedItems: false on a tuple sets unevaluatedItemsClosed", () => {
        const tree = walk({
            type: "array",
            prefixItems: [{ type: "string" }, { type: "number" }],
            unevaluatedItems: false,
        });
        expect(tree.type).toBe("tuple");
        if (tree.type !== "tuple") return;
        expect(tree.unevaluatedItemsClosed).toBe(true);
        // The structural flag replaces the absent walked schema —
        // `false` is the strictest "no extras" form and has no
        // sub-schema to walk.
        expect(tree.unevaluatedItems).toBeUndefined();
    });

    it("unevaluatedItems: { schema } on a tuple walks into the field", () => {
        const tree = walk({
            type: "array",
            prefixItems: [{ type: "string" }],
            unevaluatedItems: { type: "number" },
        });
        expect(tree.type).toBe("tuple");
        if (tree.type !== "tuple") return;
        expect(tree.unevaluatedItems?.type).toBe("number");
        expect(tree.unevaluatedItemsClosed).toBeUndefined();
    });

    it("unevaluatedItems: true on a tuple yields permissive unknown", () => {
        const tree = walk({
            type: "array",
            prefixItems: [{ type: "string" }],
            unevaluatedItems: true,
        });
        expect(tree.type).toBe("tuple");
        if (tree.type !== "tuple") return;
        expect(tree.unevaluatedItems?.type).toBe("unknown");
        expect(tree.unevaluatedItemsClosed).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// Array unevaluatedItems — closed flag parity
// ---------------------------------------------------------------------------

describe("walker — array unevaluatedItems", () => {
    it("unevaluatedItems: false on an array sets unevaluatedItemsClosed", () => {
        const tree = walk({
            type: "array",
            items: { type: "string" },
            unevaluatedItems: false,
        });
        expect(tree.type).toBe("array");
        if (tree.type !== "array") return;
        expect(tree.unevaluatedItemsClosed).toBe(true);
        expect(tree.unevaluatedItems).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// Non-primitive const
// ---------------------------------------------------------------------------

describe("walker — non-primitive const", () => {
    it("preserves an object const value", () => {
        const diagnostics: Diagnostic[] = [];
        const tree = walk(
            { const: { kind: "x" } },
            {
                diagnostics: { diagnostics: (d) => diagnostics.push(d) },
            }
        );
        expect(tree.type).toBe("literal");
        if (tree.type !== "literal") return;
        expect(tree.literalValues).toEqual([{ kind: "x" }]);
        expect(diagnostics.filter((d) => d.code === "invalid-const")).toEqual(
            []
        );
    });

    it("preserves an array const value", () => {
        const diagnostics: Diagnostic[] = [];
        const tree = walk(
            { const: [1, 2, 3] },
            {
                diagnostics: { diagnostics: (d) => diagnostics.push(d) },
            }
        );
        expect(tree.type).toBe("literal");
        if (tree.type !== "literal") return;
        expect(tree.literalValues).toEqual([[1, 2, 3]]);
        expect(diagnostics.filter((d) => d.code === "invalid-const")).toEqual(
            []
        );
    });
});

// ---------------------------------------------------------------------------
// Non-primitive enum
// ---------------------------------------------------------------------------

describe("walker — non-primitive enum", () => {
    it("preserves object enum values without diagnostic", () => {
        const diagnostics: Diagnostic[] = [];
        const tree = walk(
            { enum: [{ kind: "a" }, { kind: "b" }] },
            {
                diagnostics: { diagnostics: (d) => diagnostics.push(d) },
            }
        );
        expect(tree.type).toBe("enum");
        if (tree.type !== "enum") return;
        expect(tree.enumValues).toEqual([{ kind: "a" }, { kind: "b" }]);
        expect(
            diagnostics.filter((d) => d.code === "enum-value-filtered")
        ).toEqual([]);
    });

    it("preserves a mixed enum (primitives and objects)", () => {
        const diagnostics: Diagnostic[] = [];
        const tree = walk(
            { enum: ["string-value", 42, { kind: "x" }, [1, 2], null] },
            {
                diagnostics: { diagnostics: (d) => diagnostics.push(d) },
            }
        );
        expect(tree.type).toBe("enum");
        if (tree.type !== "enum") return;
        expect(tree.enumValues).toEqual([
            "string-value",
            42,
            { kind: "x" },
            [1, 2],
            null,
        ]);
        expect(
            diagnostics.filter((d) => d.code === "enum-value-filtered")
        ).toEqual([]);
    });
});
