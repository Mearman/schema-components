/**
 * Unit tests for core/renderer.ts — RESOLVER_KEYS, typeToKey,
 * getRenderFunction, getHtmlRenderFn, mergeResolvers, mergeHtmlResolvers.
 */
import { describe, it, expect } from "vitest";
import {
    RESOLVER_KEYS,
    typeToKey,
    getRenderFunction,
    getHtmlRenderFn,
    mergeResolvers,
    mergeHtmlResolvers,
} from "../src/core/renderer.ts";
import type { ComponentResolver, HtmlResolver } from "../src/core/renderer.ts";

// ---------------------------------------------------------------------------
// RESOLVER_KEYS
// ---------------------------------------------------------------------------

describe("RESOLVER_KEYS", () => {
    it("contains every WalkedField variant", () => {
        // Derived list — adding a new variant to SchemaType must add a
        // corresponding RESOLVER_KEYS entry, otherwise typeToKey will not
        // type-check (exhaustive switch).
        const expected: readonly (typeof RESOLVER_KEYS)[number][] = [
            "string",
            "number",
            "boolean",
            "null",
            "enum",
            "object",
            "array",
            "tuple",
            "record",
            "union",
            "discriminatedUnion",
            "conditional",
            "negation",
            "recursive",
            "literal",
            "file",
            "never",
            "unknown",
        ];
        for (const key of expected) expect(RESOLVER_KEYS).toContain(key);
    });

    it("has the same length as the expected key list", () => {
        // The total must match — any change here requires a matching
        // change in `typeToKey` and both resolver interfaces.
        expect(RESOLVER_KEYS.length).toBe(18);
    });
});

// ---------------------------------------------------------------------------
// typeToKey
// ---------------------------------------------------------------------------

describe("typeToKey", () => {
    it.each([
        "string",
        "number",
        "boolean",
        "null",
        "enum",
        "object",
        "array",
        "tuple",
        "record",
        "union",
        "discriminatedUnion",
        "conditional",
        "negation",
        "recursive",
        "literal",
        "file",
        "never",
        "unknown",
    ] as const)("maps '%s' to itself", (type) => {
        expect(typeToKey(type)).toBe(type);
    });
});

// ---------------------------------------------------------------------------
// getRenderFunction
// ---------------------------------------------------------------------------

describe("getRenderFunction", () => {
    it("returns the function for a known type", () => {
        const fn = () => null;
        const resolver: ComponentResolver = { string: fn };
        expect(getRenderFunction("string", resolver)).toBe(fn);
    });

    it("returns undefined when type has no resolver", () => {
        const resolver: ComponentResolver = {};
        expect(getRenderFunction("string", resolver)).toBe(undefined);
    });
});

// ---------------------------------------------------------------------------
// getHtmlRenderFn
// ---------------------------------------------------------------------------

describe("getHtmlRenderFn", () => {
    it("returns the function for a known type", () => {
        const fn = () => "";
        const resolver: HtmlResolver = { string: fn };
        expect(getHtmlRenderFn("string", resolver)).toBe(fn);
    });

    it("returns undefined when type has no resolver", () => {
        const resolver: HtmlResolver = {};
        expect(getHtmlRenderFn("string", resolver)).toBe(undefined);
    });
});

// ---------------------------------------------------------------------------
// mergeResolvers
// ---------------------------------------------------------------------------

describe("mergeResolvers", () => {
    it("user takes priority over fallback", () => {
        const userFn = () => "user";
        const fallbackFn = () => "fallback";
        const user: ComponentResolver = { string: userFn };
        const fallback: ComponentResolver = { string: fallbackFn };
        const merged = mergeResolvers(user, fallback);
        expect(merged.string).toBe(userFn);
    });

    it("fills gaps from fallback", () => {
        const fallbackFn = () => "fallback";
        const user: ComponentResolver = {};
        const fallback: ComponentResolver = { string: fallbackFn };
        const merged = mergeResolvers(user, fallback);
        expect(merged.string).toBe(fallbackFn);
    });

    it("omits keys with no function in either", () => {
        const user: ComponentResolver = {};
        const fallback: ComponentResolver = {};
        const merged = mergeResolvers(user, fallback);
        expect(merged.string).toBe(undefined);
    });

    it("merges multiple keys", () => {
        const strFn = () => "str";
        const numFn = () => "num";
        const objFn = () => "obj";
        const merged = mergeResolvers(
            { string: strFn },
            { number: numFn, object: objFn }
        );
        expect(merged.string).toBe(strFn);
        expect(merged.number).toBe(numFn);
        expect(merged.object).toBe(objFn);
    });
});

// ---------------------------------------------------------------------------
// mergeHtmlResolvers
// ---------------------------------------------------------------------------

describe("mergeHtmlResolvers", () => {
    it("user takes priority over fallback", () => {
        const userFn = () => "user";
        const fallbackFn = () => "fallback";
        const merged = mergeHtmlResolvers(
            { string: userFn },
            { string: fallbackFn }
        );
        expect(merged.string).toBe(userFn);
    });

    it("fills gaps from fallback", () => {
        const fallbackFn = () => "fallback";
        const merged = mergeHtmlResolvers({}, { string: fallbackFn });
        expect(merged.string).toBe(fallbackFn);
    });

    it("omits keys with no function in either", () => {
        const merged = mergeHtmlResolvers({}, {});
        expect(merged.string).toBe(undefined);
    });
});
