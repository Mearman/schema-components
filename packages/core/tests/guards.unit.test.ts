/**
 * Tests for shared type guards and safe property access.
 */
import { describe, it, expect } from "vitest";
import {
    isObject,
    getProperty,
    hasProperty,
    toRecord,
    toRecordOrUndefined,
} from "../src/core/guards.ts";

// ---------------------------------------------------------------------------
// isObject
// ---------------------------------------------------------------------------

describe("isObject", () => {
    it("returns true for plain objects", () => {
        expect(isObject({})).toBe(true);
    });

    it("returns true for objects with properties", () => {
        expect(isObject({ type: "string" })).toBe(true);
    });

    it("returns false for null", () => {
        expect(isObject(null)).toBe(false);
    });

    it("returns false for arrays", () => {
        expect(isObject([1, 2, 3])).toBe(false);
    });

    it("returns false for strings", () => {
        expect(isObject("hello")).toBe(false);
    });

    it("returns false for numbers", () => {
        expect(isObject(42)).toBe(false);
    });

    it("returns false for undefined", () => {
        expect(isObject(undefined)).toBe(false);
    });

    it("returns false for booleans", () => {
        expect(isObject(true)).toBe(false);
    });

    it("narrows type to Record<string, unknown>", () => {
        const value: unknown = { type: "string" };
        if (isObject(value)) {
            expect(value.type).toBe("string");
        }
    });
});

// ---------------------------------------------------------------------------
// getProperty
// ---------------------------------------------------------------------------

describe("getProperty", () => {
    it("returns value for existing key", () => {
        expect(getProperty({ name: "Ada" }, "name")).toBe("Ada");
    });

    it("returns undefined for missing key", () => {
        expect(getProperty({ name: "Ada" }, "age")).toBe(undefined);
    });

    it("returns undefined for non-object", () => {
        expect(getProperty("hello", "length")).toBe(undefined);
    });

    it("returns undefined for null", () => {
        expect(getProperty(null, "key")).toBe(undefined);
    });
});

// ---------------------------------------------------------------------------
// hasProperty
// ---------------------------------------------------------------------------

describe("hasProperty", () => {
    it("returns true for existing own property", () => {
        expect(hasProperty({ type: "string" }, "type")).toBe(true);
    });

    it("returns false for missing property", () => {
        expect(hasProperty({ type: "string" }, "format")).toBe(false);
    });

    it("returns false for non-objects", () => {
        expect(hasProperty("hello", "length")).toBe(false);
    });

    it("returns false for null", () => {
        expect(hasProperty(null, "key")).toBe(false);
    });

    it("returns false for undefined", () => {
        expect(hasProperty(undefined, "key")).toBe(false);
    });

    it("returns true for inherited properties (in operator)", () => {
        expect(hasProperty({}, "toString")).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// toRecord
// ---------------------------------------------------------------------------

describe("toRecord", () => {
    it("converts empty object", () => {
        expect(toRecord({})).toStrictEqual({});
    });

    it("converts object with properties", () => {
        expect(toRecord({ type: "string", format: "email" })).toStrictEqual({
            type: "string",
            format: "email",
        });
    });

    it("preserves values", () => {
        const obj = { arr: [1, 2], nested: { a: 1 } };
        const record = toRecord(obj);
        expect(record.arr).toStrictEqual([1, 2]);
        expect(record.nested).toStrictEqual({ a: 1 });
    });
});

// ---------------------------------------------------------------------------
// toRecordOrUndefined
// ---------------------------------------------------------------------------

describe("toRecordOrUndefined", () => {
    it("converts plain objects", () => {
        expect(toRecordOrUndefined({ type: "string" })).toStrictEqual({
            type: "string",
        });
    });

    it("returns undefined for null", () => {
        expect(toRecordOrUndefined(null)).toBe(undefined);
    });

    it("returns undefined for arrays", () => {
        expect(toRecordOrUndefined([1, 2, 3])).toBe(undefined);
    });

    it("returns undefined for strings", () => {
        expect(toRecordOrUndefined("hello")).toBe(undefined);
    });

    it("returns undefined for undefined", () => {
        expect(toRecordOrUndefined(undefined)).toBe(undefined);
    });

    it("returns undefined for numbers", () => {
        expect(toRecordOrUndefined(42)).toBe(undefined);
    });
});
