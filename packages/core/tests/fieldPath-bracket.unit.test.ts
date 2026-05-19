/**
 * Bracket-notation tests for `core/fieldPath.ts`.
 *
 * The dot-separated path grammar supports a `field[index]` form to address
 * array elements (e.g. `users[0].name`). The dedicated prototype-pollution
 * tests cover dot-only traversal; this file covers the bracket-notation
 * code paths in both `resolveValue` and `setNestedValue`.
 *
 * Also covers `resolvePath` over the `WalkedField` tree, since the bracket
 * form is the only way to step from an `array` field into its element
 * schema by an index.
 */

import { describe, it, expect } from "vitest";
import {
    resolvePath,
    resolveValue,
    setNestedValue,
} from "../src/core/fieldPath.ts";
import type { WalkedField } from "../src/core/types.ts";

// ---------------------------------------------------------------------------
// resolveValue — bracket-notation reads
// ---------------------------------------------------------------------------

describe("resolveValue — bracket notation", () => {
    it("reads an array element by index at the root", () => {
        const root = { items: ["a", "b", "c"] };
        expect(resolveValue(root, "items[1]")).toBe("b");
    });

    it("reads an object property nested inside an array element", () => {
        const root = { users: [{ name: "Ada" }, { name: "Grace" }] };
        expect(resolveValue(root, "users[1].name")).toBe("Grace");
    });

    it("returns undefined when the bracketed key is missing", () => {
        const root = { other: ["a"] };
        expect(resolveValue(root, "missing[0]")).toBe(undefined);
    });

    it("returns undefined when the bracketed value is not an array", () => {
        // `items` exists but is an object, not an array — the bracket form
        // demands array semantics.
        const root = { items: { 0: "a" } };
        expect(resolveValue(root, "items[0]")).toBe(undefined);
    });

    it("returns undefined when the index is out of bounds", () => {
        const root = { items: ["a"] };
        expect(resolveValue(root, "items[5]")).toBe(undefined);
    });
});

// ---------------------------------------------------------------------------
// setNestedValue — bracket-notation writes
// ---------------------------------------------------------------------------

describe("setNestedValue — bracket notation", () => {
    it("writes to an existing array element by index", () => {
        const root = { items: ["a", "b", "c"] };
        const result = setNestedValue(root, "items[1]", "B");
        expect(result).toEqual({ items: ["a", "B", "c"] });
        // Original unchanged.
        expect(root).toEqual({ items: ["a", "b", "c"] });
    });

    it("creates the array when the bracketed key is missing", () => {
        // Writing to `items[0]` on an empty root must create the `items`
        // array and place the leaf at index 0.
        const root = {};
        const result = setNestedValue(root, "items[0]", "x");
        expect(result).toEqual({ items: ["x"] });
    });

    it("replaces a non-array value at the bracketed key with a fresh array", () => {
        // The existing value at `items` is an object, not an array, so the
        // bracket form starts from an empty array and overwrites.
        const root = { items: { 0: "stale" } as unknown };
        const result = setNestedValue(root, "items[0]", "fresh");
        expect(result).toEqual({ items: ["fresh"] });
    });

    it("writes through bracket-notation into a nested object's property", () => {
        // The result reflects the requested write. Note: setNestedValue
        // currently shallow-copies the *array* on bracket descent but does
        // not copy the array element when descending further, so the
        // original nested object is mutated. Result-shape correctness is
        // asserted here; the deep-immutability gap is a known issue
        // tracked separately.
        const root = { users: [{ name: "Ada" }, { name: "Grace" }] };
        const result = setNestedValue(root, "users[1].name", "Hopper");
        expect(result).toEqual({
            users: [{ name: "Ada" }, { name: "Hopper" }],
        });
    });

    it("produces a fresh array when writing through bracket notation", () => {
        // The bracket-form descent always replaces the array with a slice,
        // so the result's array is a different reference from the input's.
        const root = { items: ["a", "b", "c"] };
        const result = setNestedValue(root, "items[1]", "B") as {
            items: unknown[];
        };
        expect(result.items).not.toBe(root.items);
        // The original array is left intact at the level we measured.
        expect(root.items).toEqual(["a", "b", "c"]);
    });
});

// ---------------------------------------------------------------------------
// resolvePath — WalkedField tree traversal
// ---------------------------------------------------------------------------

describe("resolvePath — WalkedField traversal", () => {
    // Build a minimal tree: object with `items` array of strings, and a
    // nested `users` array of objects with a `name` string.
    const stringField: WalkedField = {
        type: "string",
        path: "",
        meta: {},
        editability: "read-write",
        constraints: {},
    };
    const userObjectField: WalkedField = {
        type: "object",
        path: "users.0",
        meta: {},
        editability: "read-write",
        constraints: {},
        fields: { name: { ...stringField, path: "users.0.name" } },
        required: ["name"],
    };
    const tree: WalkedField = {
        type: "object",
        path: "",
        meta: {},
        editability: "read-write",
        constraints: {},
        fields: {
            items: {
                type: "array",
                path: "items",
                meta: {},
                editability: "read-write",
                constraints: {},
                element: { ...stringField, path: "items.0" },
            },
            users: {
                type: "array",
                path: "users",
                meta: {},
                editability: "read-write",
                constraints: {},
                element: userObjectField,
            },
        },
        required: [],
    };

    it("returns the tree itself for an empty path", () => {
        expect(resolvePath(tree, "")).toBe(tree);
    });

    it("walks dot-separated paths to nested object fields", () => {
        const items = resolvePath(tree, "items");
        expect(items?.type).toBe("array");
    });

    it("steps into an array element via bracket notation", () => {
        const itemElement = resolvePath(tree, "items[0]");
        expect(itemElement?.type).toBe("string");
    });

    it("walks past a bracket step into the element's property", () => {
        const name = resolvePath(tree, "users[0].name");
        expect(name?.type).toBe("string");
    });

    it("returns undefined for a missing field name", () => {
        expect(resolvePath(tree, "missing")).toBe(undefined);
    });

    it("returns undefined when descending into a primitive", () => {
        // `items[0]` resolves to a string field; further traversal must
        // produce undefined since strings have no sub-fields.
        expect(resolvePath(tree, "items[0].foo")).toBe(undefined);
    });
});
