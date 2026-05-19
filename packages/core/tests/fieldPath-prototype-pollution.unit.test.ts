/**
 * Prototype-pollution defence tests for `react/fieldPath.ts`.
 *
 * `resolveValue` and `setNestedValue` traverse user-supplied dot-separated
 * paths against arbitrary data values. Without filtering, a path such as
 * `"__proto__.polluted"` would read `Object.prototype` (or, in the write
 * case, mutate it) and surface fields planted on the runtime prototype
 * chain through the schema-components API.
 *
 * Both helpers refuse to traverse `__proto__`, `constructor`, or
 * `prototype`. The read helper returns `undefined`; the write helper
 * returns the input unchanged so the caller's onChange handler treats
 * the write as a no-op.
 */

import { describe, it, expect } from "vitest";
import { resolveValue, setNestedValue } from "../src/core/fieldPath.ts";

// ---------------------------------------------------------------------------
// resolveValue — read refusal
// ---------------------------------------------------------------------------

describe("resolveValue — prototype-pollution defence", () => {
    it("returns undefined for a plain __proto__ segment", () => {
        const root = { user: { name: "Ada" } };
        expect(resolveValue(root, "__proto__")).toBe(undefined);
    });

    it("returns undefined for a plain constructor segment", () => {
        const root = { user: { name: "Ada" } };
        expect(resolveValue(root, "constructor")).toBe(undefined);
    });

    it("returns undefined for a plain prototype segment", () => {
        const root = { user: { name: "Ada" } };
        expect(resolveValue(root, "prototype")).toBe(undefined);
    });

    it("returns undefined when __proto__ appears mid-path", () => {
        // The attacker's goal: smuggle a property from the runtime
        // prototype chain by routing the read through Object.prototype.
        const root = { user: { name: "Ada" } };
        expect(resolveValue(root, "user.__proto__.polluted")).toBe(undefined);
    });

    it("returns undefined when constructor appears mid-path", () => {
        const root = { user: { name: "Ada" } };
        expect(resolveValue(root, "user.constructor.prototype")).toBe(
            undefined
        );
    });

    it("returns undefined for prototype-polluting key in bracket notation", () => {
        // The bracket form `field[0]` still routes the array key through
        // the same lookup — refuse the same set of names.
        const root = { user: { name: "Ada" } };
        expect(resolveValue(root, "__proto__[0]")).toBe(undefined);
    });

    it("still resolves legitimate paths", () => {
        const root = { user: { name: "Ada" } };
        expect(resolveValue(root, "user.name")).toBe("Ada");
    });

    it("still resolves legitimate paths past a property called proto", () => {
        // A property literally named `proto` (not the dunder form) is
        // a legitimate field and must keep resolving.
        const root = { proto: { value: 42 } };
        expect(resolveValue(root, "proto.value")).toBe(42);
    });
});

// ---------------------------------------------------------------------------
// setNestedValue — write refusal
// ---------------------------------------------------------------------------

describe("setNestedValue — prototype-pollution defence", () => {
    it("returns the input unchanged for a plain __proto__ segment", () => {
        const root = { user: { name: "Ada" } };
        const result = setNestedValue(root, "__proto__", "polluted");
        expect(result).toBe(root);
        // Verify Object.prototype is not polluted as a sanity check.
        expect(({} as Record<string, unknown>).polluted).toBe(undefined);
    });

    it("returns the input unchanged for a plain constructor segment", () => {
        const root = { user: { name: "Ada" } };
        const result = setNestedValue(root, "constructor", "polluted");
        expect(result).toBe(root);
    });

    it("returns the input unchanged for a plain prototype segment", () => {
        const root = { user: { name: "Ada" } };
        const result = setNestedValue(root, "prototype", "polluted");
        expect(result).toBe(root);
    });

    it("returns the input unchanged when __proto__ appears mid-path", () => {
        const root = { user: { name: "Ada" } };
        const result = setNestedValue(root, "user.__proto__.polluted", "evil");
        expect(result).toBe(root);
        expect(({} as Record<string, unknown>).polluted).toBe(undefined);
    });

    it("returns the input unchanged when constructor appears mid-path", () => {
        const root = { user: { name: "Ada" } };
        const result = setNestedValue(
            root,
            "user.constructor.prototype.polluted",
            "evil"
        );
        expect(result).toBe(root);
    });

    it("refuses prototype-polluting key in bracket notation", () => {
        const root = { user: { name: "Ada" } };
        const result = setNestedValue(root, "__proto__[0]", "evil");
        expect(result).toBe(root);
    });

    it("still applies legitimate writes", () => {
        const root = { user: { name: "Ada" } };
        const result = setNestedValue(root, "user.name", "Grace");
        expect(result).toEqual({ user: { name: "Grace" } });
        // Immutability — original unchanged.
        expect(root).toEqual({ user: { name: "Ada" } });
    });

    it("still applies legitimate writes past a property called proto", () => {
        const root = { proto: { value: 42 } };
        const result = setNestedValue(root, "proto.value", 99);
        expect(result).toEqual({ proto: { value: 99 } });
    });
});
