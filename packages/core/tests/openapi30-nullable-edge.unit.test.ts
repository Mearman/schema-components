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
    it("wraps the enum in anyOf [enum, null] without duplicating null", () => {
        const result = normaliseOpenApi30Node({
            type: "string",
            enum: ["a", "b", "c"],
            nullable: true,
        });
        // Route the nullability through the canonical `anyOf [T, null]`
        // shape (the walker recognises this and marks the field
        // `isNullable: true`). The wrapper enum must NOT also include
        // `null` — that produced the historic duplicate-null branch.
        const anyOf = result.anyOf as Record<string, unknown>[];
        expect(anyOf).toBeDefined();
        expect(anyOf.length).toBe(2);
        const wrapper = assertDefined(anyOf[0], "first anyOf entry");
        const wrapperEnum = wrapper.enum as unknown[];
        expect(wrapperEnum).not.toContain(null);
        expect(wrapperEnum.length).toBe(3);
        expect(anyOf[1]).toStrictEqual({ type: "null" });
    });

    it("short-circuits without an anyOf wrap when the enum already declares null", () => {
        const result = normaliseOpenApi30Node({
            type: "string",
            enum: ["a", null, "b"],
            nullable: true,
        });
        // The enum already covers `null`, so an `anyOf [wrapper, null]`
        // wrap would duplicate the null branch. Strip `nullable` and
        // return the node unchanged — the walker reads the existing
        // null directly from the enum entries.
        expect(result.anyOf).toBeUndefined();
        expect(result.nullable).toBeUndefined();
        const resultEnum = result.enum as unknown[];
        expect(resultEnum.filter((v) => v === null).length).toBe(1);
        expect(resultEnum.length).toBe(3);
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

    it("lifts documentary siblings onto the anyOf wrapper", () => {
        const result = normaliseOpenApi30Node({
            $ref: "#/components/schemas/User",
            nullable: true,
            description: "Nullable user reference",
            title: "OptionalUser",
            deprecated: true,
        });
        // Reference Object retains only `$ref`; the wrapper carries the
        // documentary siblings (description, title, deprecated, etc.).
        const anyOf = result.anyOf as Record<string, unknown>[];
        expect(anyOf[0]).toStrictEqual({
            $ref: "#/components/schemas/User",
        });
        expect(anyOf[1]).toStrictEqual({ type: "null" });
        expect(result.description).toBe("Nullable user reference");
        expect(result.title).toBe("OptionalUser");
        expect(result.deprecated).toBe(true);
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
