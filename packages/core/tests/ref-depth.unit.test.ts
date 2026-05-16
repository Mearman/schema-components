/**
 * Tests for derived $ref depth bound.
 *
 * Verifies that the depth limit is computed from the document's distinct
 * $ref count rather than a hardcoded magic number. Acyclic chains of
 * arbitrary length resolve correctly; genuinely cyclic chains still
 * emit unresolved-ref diagnostics.
 */

import { describe, it, expect } from "vitest";
import { countDistinctRefs } from "../src/core/ref.ts";
import { walk } from "../src/core/walker.ts";
import { normaliseSchema } from "../src/core/adapter.ts";
import type { Diagnostic } from "../src/core/diagnostics.ts";

// ---------------------------------------------------------------------------
// countDistinctRefs
// ---------------------------------------------------------------------------

describe("countDistinctRefs", () => {
    it("returns 1 for a document with no refs", () => {
        expect(countDistinctRefs({ type: "string" })).toBe(1);
    });

    it("counts distinct ref strings", () => {
        const doc = {
            definitions: {
                A: { $ref: "#/definitions/B" },
                B: { $ref: "#/definitions/C" },
                C: { type: "string" },
            },
        };
        expect(countDistinctRefs(doc)).toBe(2);
    });

    it("deduplicates identical ref strings", () => {
        const doc = {
            definitions: {
                A: { $ref: "#/definitions/C" },
                B: { $ref: "#/definitions/C" },
                C: { type: "string" },
            },
        };
        expect(countDistinctRefs(doc)).toBe(1);
    });
});

// ---------------------------------------------------------------------------
// Acyclic chain resolution
// ---------------------------------------------------------------------------

describe("acyclic $ref chain resolution", () => {
    it("resolves an acyclic chain of 25 refs", () => {
        // Build a chain: Chain_0 → Chain_1 → ... → Chain_24 → { type: "string" }
        const definitions: Record<string, unknown> = {};
        for (let i = 0; i < 24; i++) {
            definitions[`Chain_${String(i)}`] = {
                $ref: `#/definitions/Chain_${String(i + 1)}`,
            };
        }
        definitions.Chain_24 = { type: "string" };

        const schema = {
            type: "object",
            properties: {
                value: { $ref: "#/definitions/Chain_0" },
            },
            definitions,
        };

        const result = normaliseSchema(schema);
        const tree = walk(result.jsonSchema, {
            rootDocument: result.rootDocument,
        });

        expect(tree.type).toBe("object");
        if (tree.type !== "object") return;

        const value = tree.fields.value;
        expect(value).toBeDefined();
        if (value === undefined) return;
        expect(value.type).toBe("string");
    });
});

// ---------------------------------------------------------------------------
// Cyclic chain detection
// ---------------------------------------------------------------------------

describe("cyclic $ref detection", () => {
    it("emits unresolved-ref for a cyclic chain", () => {
        const diags: Diagnostic[] = [];
        const schema = {
            type: "object",
            properties: {
                a: { $ref: "#/definitions/B" },
            },
            definitions: {
                B: { $ref: "#/definitions/C" },
                C: { $ref: "#/definitions/B" },
            },
        };

        const result = normaliseSchema(schema);
        walk(result.jsonSchema, {
            rootDocument: result.rootDocument,
            diagnostics: {
                diagnostics: (d: Diagnostic) => {
                    diags.push(d);
                },
            },
        });

        const unresolved = diags.filter((d) => d.code === "unresolved-ref");
        expect(unresolved.length).toBeGreaterThan(0);
    });
});
