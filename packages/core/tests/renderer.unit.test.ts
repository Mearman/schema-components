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
import type { ComponentResolver, HtmlResolver } from "../src/core/types.ts";

// ---------------------------------------------------------------------------
// RESOLVER_KEYS
// ---------------------------------------------------------------------------

describe("RESOLVER_KEYS", () => {
    it("contains all expected keys", () => {
        expect(RESOLVER_KEYS).toContain("string");
        expect(RESOLVER_KEYS).toContain("number");
        expect(RESOLVER_KEYS).toContain("boolean");
        expect(RESOLVER_KEYS).toContain("enum");
        expect(RESOLVER_KEYS).toContain("object");
        expect(RESOLVER_KEYS).toContain("array");
        expect(RESOLVER_KEYS).toContain("record");
        expect(RESOLVER_KEYS).toContain("union");
        expect(RESOLVER_KEYS).toContain("discriminatedUnion");
        expect(RESOLVER_KEYS).toContain("literal");
        expect(RESOLVER_KEYS).toContain("file");
        expect(RESOLVER_KEYS).toContain("unknown");
    });

    it("has 12 entries", () => {
        expect(RESOLVER_KEYS.length).toBe(12);
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
        "enum",
        "object",
        "array",
        "record",
        "union",
        "discriminatedUnion",
        "literal",
        "file",
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
