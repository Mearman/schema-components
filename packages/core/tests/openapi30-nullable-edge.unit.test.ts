/**
 * OAS 3.0 nullable edge cases:
 *
 * - nullable + enum should implicitly extend the enum to include null.
 * - nullable + $ref should wrap the reference in anyOf [$ref, null].
 * - discriminator x-* extensions must survive normalisation.
 */

import { describe, it, expect } from "vitest";
import { normaliseOpenApi30Node } from "../src/core/openapi30.ts";
import { normaliseOpenApi30Discriminator } from "../src/core/openapi30.ts";
import { assertDefined } from "./helpers.ts";

describe("nullable + enum", () => {
    it("appends null to the enum array", () => {
        const result = normaliseOpenApi30Node({
            type: "string",
            enum: ["a", "b", "c"],
            nullable: true,
        });
        // result is wrapped in anyOf [wrapper, { type: null }]; the
        // wrapper must carry the extended enum.
        const anyOf = result.anyOf as Record<string, unknown>[];
        expect(anyOf).toBeDefined();
        const wrapper = assertDefined(anyOf[0], "first anyOf entry");
        const wrapperEnum = wrapper.enum as unknown[];
        expect(wrapperEnum).toContain(null);
        expect(wrapperEnum.length).toBe(4);
    });

    it("does not double-add null to an enum that already contains null", () => {
        const result = normaliseOpenApi30Node({
            type: "string",
            enum: ["a", null, "b"],
            nullable: true,
        });
        const anyOf = result.anyOf as Record<string, unknown>[];
        const wrapper = assertDefined(anyOf[0], "first anyOf entry");
        const wrapperEnum = wrapper.enum as unknown[];
        // Original three entries kept; null appears exactly once.
        expect(wrapperEnum.filter((v) => v === null).length).toBe(1);
        expect(wrapperEnum.length).toBe(3);
    });
});

describe("nullable + $ref", () => {
    it("wraps the ref in anyOf [$ref, null]", () => {
        const result = normaliseOpenApi30Node({
            $ref: "#/components/schemas/User",
            nullable: true,
        });
        expect(result.$ref).toBeUndefined();
        const anyOf = result.anyOf as Record<string, unknown>[];
        expect(anyOf).toBeDefined();
        expect(anyOf.length).toBe(2);
        expect(anyOf[0]).toStrictEqual({
            $ref: "#/components/schemas/User",
        });
        expect(anyOf[1]).toStrictEqual({ type: "null" });
    });
});

describe("discriminator extensions", () => {
    it("preserves x-* extensions when removing the discriminator", () => {
        const result = normaliseOpenApi30Discriminator({
            oneOf: [
                {
                    type: "object",
                    properties: {
                        kind: { type: "string", const: "cat" },
                    },
                },
                {
                    type: "object",
                    properties: {
                        kind: { type: "string", const: "dog" },
                    },
                },
            ],
            discriminator: {
                propertyName: "kind",
                "x-internal-id": "pet-discriminator",
                "x-vendor": { author: "test" },
            },
        });
        const discriminator = result.discriminator as Record<string, unknown>;
        expect(discriminator).toBeDefined();
        expect(discriminator.propertyName).toBe("kind");
        expect(discriminator["x-internal-id"]).toBe("pet-discriminator");
        expect(discriminator["x-vendor"]).toStrictEqual({ author: "test" });
    });

    it("removes the discriminator entirely when there are no extensions", () => {
        const result = normaliseOpenApi30Discriminator({
            oneOf: [
                {
                    type: "object",
                    properties: { kind: { type: "string", const: "cat" } },
                },
            ],
            discriminator: { propertyName: "kind" },
        });
        expect(result.discriminator).toBeUndefined();
    });
});
