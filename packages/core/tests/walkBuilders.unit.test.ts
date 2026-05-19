/**
 * Direct unit tests for the pure helpers exported by `core/walkBuilders.ts`.
 *
 * `displayJsonValue` is exercised indirectly via the React and HTML
 * renderers, but the boundaries of its accepted/rejected inputs deserve
 * their own coverage so an accidental loosening (e.g. permitting
 * `bigint` silently) shows up as a focused test failure instead of an
 * unrelated render-pipeline test surfacing the regression.
 */

import { describe, it, expect } from "vitest";
import { displayJsonValue } from "../src/core/walkBuilders.ts";

describe("displayJsonValue — JSON-shaped inputs", () => {
    it("renders null as the literal string 'null'", () => {
        expect(displayJsonValue(null)).toBe("null");
    });

    it("returns strings verbatim", () => {
        expect(displayJsonValue("hello")).toBe("hello");
        expect(displayJsonValue("")).toBe("");
    });

    it("stringifies booleans", () => {
        expect(displayJsonValue(true)).toBe("true");
        expect(displayJsonValue(false)).toBe("false");
    });

    it("stringifies finite numbers", () => {
        expect(displayJsonValue(0)).toBe("0");
        expect(displayJsonValue(42)).toBe("42");
        expect(displayJsonValue(-1.5)).toBe("-1.5");
    });

    // JSON.stringify renders NaN / ±Infinity as "null"; String() renders
    // them as their JS spelling. The current implementation uses
    // String() for numbers, so pin that behaviour explicitly.
    it("renders NaN and Infinity via the number coercion path", () => {
        expect(displayJsonValue(Number.NaN)).toBe("NaN");
        expect(displayJsonValue(Number.POSITIVE_INFINITY)).toBe("Infinity");
        expect(displayJsonValue(Number.NEGATIVE_INFINITY)).toBe("-Infinity");
    });

    it("JSON-stringifies plain objects", () => {
        expect(displayJsonValue({ a: 1 })).toBe('{"a":1}');
        expect(displayJsonValue({})).toBe("{}");
    });

    it("JSON-stringifies arrays", () => {
        expect(displayJsonValue([1, 2, 3])).toBe("[1,2,3]");
        expect(displayJsonValue([])).toBe("[]");
    });
});

describe("displayJsonValue — non-JSON inputs reject", () => {
    it("throws on bigint", () => {
        expect(() => displayJsonValue(10n)).toThrow(TypeError);
        expect(() => displayJsonValue(10n)).toThrow(/bigint/);
    });

    it("throws on functions", () => {
        expect(() => displayJsonValue(() => "x")).toThrow(TypeError);
        expect(() => displayJsonValue(() => "x")).toThrow(/function/);
    });

    it("throws on symbols", () => {
        expect(() => displayJsonValue(Symbol("s"))).toThrow(TypeError);
        expect(() => displayJsonValue(Symbol("s"))).toThrow(/symbol/);
    });

    it("throws on undefined", () => {
        expect(() => displayJsonValue(undefined)).toThrow(TypeError);
        expect(() => displayJsonValue(undefined)).toThrow(/undefined/);
    });
});
