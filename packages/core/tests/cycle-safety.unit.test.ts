/**
 * Tests for cycle safety in the schema walkers.
 *
 * `bundleOpenApiDoc` inlines external $refs via `structuredClone`, which
 * preserves cycles and shared object references. The recursive walkers
 * in `ref.ts` (collectRefs, findAnchor) and `normalise.ts` (deepNormalise,
 * rewriteRelativeRefsNode) must terminate on such inputs rather than
 * stack-overflowing.
 */

import { describe, it, expect } from "vitest";
import { countDistinctRefs, findAnchor } from "../src/core/ref.ts";
import { deepNormalise, normaliseJsonSchema } from "../src/core/normalise.ts";

// ---------------------------------------------------------------------------
// collectRefs — countDistinctRefs is the public entry point
// ---------------------------------------------------------------------------

describe("countDistinctRefs (collectRefs cycle safety)", () => {
    it("terminates on a self-referential object", () => {
        const root: Record<string, unknown> = {
            type: "object",
            properties: { name: { $ref: "#/$defs/X" } },
            $defs: { X: { type: "string" } },
        };
        // Introduce a true cycle via shared reference.
        const selfRef: Record<string, unknown> = { type: "object" };
        selfRef.self = selfRef;
        root.cycle = selfRef;

        expect(() => countDistinctRefs(root)).not.toThrow();
    });

    it("terminates on shared sub-references (diamond)", () => {
        const shared: Record<string, unknown> = { $ref: "#/$defs/Shared" };
        const root: Record<string, unknown> = {
            type: "object",
            properties: {
                a: shared,
                b: shared,
                c: { properties: { nested: shared } },
            },
            $defs: { Shared: { type: "string" } },
        };
        // The same `shared` object reachable through three paths — without
        // the visited set the walk would still terminate (different paths
        // re-enter the same object) but with the guard it does so without
        // redundant work.
        expect(() => countDistinctRefs(root)).not.toThrow();
        // Only one distinct ref string exists.
        expect(countDistinctRefs(root)).toBe(1);
    });

    it("terminates on a cyclic array element", () => {
        const arr: unknown[] = [];
        const node: Record<string, unknown> = { items: arr };
        arr.push(node);
        const root: Record<string, unknown> = {
            type: "object",
            properties: { x: node },
        };
        expect(() => countDistinctRefs(root)).not.toThrow();
    });
});

// ---------------------------------------------------------------------------
// findAnchor
// ---------------------------------------------------------------------------

describe("findAnchor cycle safety", () => {
    it("terminates on a self-referential object even when the anchor is missing", () => {
        const root: Record<string, unknown> = { type: "object" };
        root.self = root;
        expect(() => findAnchor(root, "nonexistent")).not.toThrow();
        expect(findAnchor(root, "nonexistent")).toBe(undefined);
    });

    it("still locates an anchor reachable through a cycle", () => {
        const target: Record<string, unknown> = {
            $anchor: "Target",
            type: "string",
        };
        const root: Record<string, unknown> = {
            properties: { x: target },
        };
        // Self-cycle on the root must not prevent locating `Target`.
        root.self = root;
        expect(findAnchor(root, "Target")).toBe(target);
    });

    it("terminates when a cyclic array is in the search path", () => {
        const arr: unknown[] = [{ type: "string" }];
        arr.push(arr);
        const root: Record<string, unknown> = {
            allOf: arr,
        };
        expect(() => findAnchor(root, "missing")).not.toThrow();
    });
});

// ---------------------------------------------------------------------------
// deepNormalise
// ---------------------------------------------------------------------------

describe("deepNormalise cycle safety", () => {
    it("terminates on a schema with a cyclic sub-schema", () => {
        const cyclic: Record<string, unknown> = { type: "object" };
        cyclic.properties = { self: cyclic };

        expect(() => deepNormalise(cyclic, (node) => node)).not.toThrow();
    });

    it("terminates on a schema with a cyclic items array", () => {
        const items: unknown[] = [];
        const node: Record<string, unknown> = { type: "array", items };
        items.push(node);

        expect(() => deepNormalise(node, (n) => n)).not.toThrow();
    });

    it("terminates on shared sub-schema references (diamond)", () => {
        const shared: Record<string, unknown> = { type: "string" };
        const root: Record<string, unknown> = {
            type: "object",
            properties: { a: shared, b: shared, c: shared },
        };
        expect(() => deepNormalise(root, (n) => n)).not.toThrow();
    });
});

// ---------------------------------------------------------------------------
// rewriteRelativeRefsNode (exercised via normaliseJsonSchema with $id)
// ---------------------------------------------------------------------------

describe("rewriteRelativeRefsNode cycle safety", () => {
    it("terminates on a self-referential schema with a base $id", () => {
        // Introduce a structural cycle that the normaliser must traverse.
        const cyclic: Record<string, unknown> = {};
        cyclic.self = cyclic;

        // Build properties before the schema so the cycle is part of the
        // declared shape — avoids casting `schema.properties` back to a
        // mutable record after construction.
        const properties: Record<string, unknown> = {
            x: { $ref: "#/$defs/Bar" },
            cycle: cyclic,
        };
        const schema: Record<string, unknown> = {
            $schema: "https://json-schema.org/draft/2020-12/schema",
            $id: "http://example.com/foo",
            type: "object",
            properties,
            $defs: { Bar: { type: "string" } },
        };

        expect(() =>
            normaliseJsonSchema(schema, "draft-2020-12")
        ).not.toThrow();
    });

    it("terminates on a schema with a cyclic array under $id", () => {
        const arr: unknown[] = [];
        arr.push({ self: arr });
        const schema: Record<string, unknown> = {
            $schema: "https://json-schema.org/draft/2020-12/schema",
            $id: "http://example.com/foo",
            type: "object",
            properties: {
                items: { allOf: arr },
            },
        };
        expect(() =>
            normaliseJsonSchema(schema, "draft-2020-12")
        ).not.toThrow();
    });
});
