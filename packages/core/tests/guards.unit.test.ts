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

// ---------------------------------------------------------------------------
// WalkedField type guard coverage
// ---------------------------------------------------------------------------

import {
    isStringField,
    isNumberField,
    isBooleanField,
    isNullField,
    isEnumField,
    isLiteralField,
    isObjectField,
    isArrayField,
    isTupleField,
    isRecordField,
    isUnionField,
    isDiscriminatedUnionField,
    isConditionalField,
    isNegationField,
    isFileField,
    isUnknownField,
} from "../src/core/types.ts";
import type { WalkedField } from "../src/core/types.ts";
import { walk } from "../src/core/walker.ts";

const baseField = {
    editability: "editable" as const,
    meta: {},
    constraints: {},
};

describe("WalkedField type guards", () => {
    it("isStringField narrows string fields", () => {
        const field: WalkedField = { ...baseField, type: "string" };
        expect(isStringField(field)).toBe(true);
        expect(isNumberField(field)).toBe(false);
        if (isStringField(field)) {
            expect(field.constraints).toBeDefined();
        }
    });

    it("isNumberField narrows number fields", () => {
        const field: WalkedField = { ...baseField, type: "number" };
        expect(isNumberField(field)).toBe(true);
        expect(isStringField(field)).toBe(false);
    });

    it("isBooleanField narrows boolean fields", () => {
        const field: WalkedField = { ...baseField, type: "boolean" };
        expect(isBooleanField(field)).toBe(true);
    });

    it("isNullField narrows null fields", () => {
        const field: WalkedField = { ...baseField, type: "null" };
        expect(isNullField(field)).toBe(true);
    });

    it("isEnumField narrows enum fields", () => {
        const field: WalkedField = {
            ...baseField,
            type: "enum",
            enumValues: ["a", "b"],
        };
        expect(isEnumField(field)).toBe(true);
        if (isEnumField(field)) {
            expect(field.enumValues).toEqual(["a", "b"]);
        }
    });

    it("isLiteralField narrows literal fields", () => {
        const field: WalkedField = {
            ...baseField,
            type: "literal",
            literalValues: ["hello"],
        };
        expect(isLiteralField(field)).toBe(true);
        if (isLiteralField(field)) {
            expect(field.literalValues).toEqual(["hello"]);
        }
    });

    it("isObjectField narrows object fields", () => {
        const field: WalkedField = {
            ...baseField,
            type: "object",
            fields: {},
            requiredFields: [],
        };
        expect(isObjectField(field)).toBe(true);
        if (isObjectField(field)) {
            expect(field.fields).toEqual({});
        }
    });

    it("isArrayField narrows array fields", () => {
        const field: WalkedField = { ...baseField, type: "array" };
        expect(isArrayField(field)).toBe(true);
    });

    it("isTupleField narrows tuple fields", () => {
        const field: WalkedField = {
            ...baseField,
            type: "tuple",
            prefixItems: [],
        };
        expect(isTupleField(field)).toBe(true);
        if (isTupleField(field)) {
            expect(field.prefixItems).toEqual([]);
        }
    });

    it("isRecordField narrows record fields", () => {
        const field: WalkedField = {
            ...baseField,
            type: "record",
            keyType: { ...baseField, type: "string" },
            valueType: { ...baseField, type: "string" },
        };
        expect(isRecordField(field)).toBe(true);
    });

    it("isUnionField narrows union fields", () => {
        const field: WalkedField = {
            ...baseField,
            type: "union",
            options: [],
        };
        expect(isUnionField(field)).toBe(true);
    });

    it("isDiscriminatedUnionField narrows discriminated union fields", () => {
        const field: WalkedField = {
            ...baseField,
            type: "discriminatedUnion",
            options: [],
            discriminator: "type",
        };
        expect(isDiscriminatedUnionField(field)).toBe(true);
        if (isDiscriminatedUnionField(field)) {
            expect(field.discriminator).toBe("type");
        }
    });

    it("isConditionalField narrows conditional fields", () => {
        const field: WalkedField = {
            ...baseField,
            type: "conditional",
            ifClause: { ...baseField, type: "unknown" },
        };
        expect(isConditionalField(field)).toBe(true);
    });

    it("isNegationField narrows negation fields", () => {
        const field: WalkedField = {
            ...baseField,
            type: "negation",
            negated: { ...baseField, type: "unknown" },
        };
        expect(isNegationField(field)).toBe(true);
    });

    it("isFileField narrows file fields", () => {
        const field: WalkedField = { ...baseField, type: "file" };
        expect(isFileField(field)).toBe(true);
    });

    it("isUnknownField narrows unknown fields", () => {
        const field: WalkedField = { ...baseField, type: "unknown" };
        expect(isUnknownField(field)).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// WalkedField integration — type guards + walker
// ---------------------------------------------------------------------------

describe("type guards with walked fields", () => {
    it("guards conditional fields from if/then/else", () => {
        const schema = {
            type: "string",
            if: { minLength: 5 },
            then: { maxLength: 100 },
        } as Record<string, unknown>;
        const result = walk(schema);
        expect(isConditionalField(result)).toBe(true);
    });

    it("guards negation fields from not", () => {
        const schema = {
            not: { type: "string" },
        } as Record<string, unknown>;
        const result = walk(schema);
        expect(isNegationField(result)).toBe(true);
    });

    it(" guards tuple fields from prefixItems", () => {
        const schema = {
            type: "array",
            prefixItems: [{ type: "string" }, { type: "number" }],
        } as Record<string, unknown>;
        const result = walk(schema);
        expect(isTupleField(result)).toBe(true);
        if (isTupleField(result)) {
            expect(result.prefixItems.length).toBe(2);
        }
    });
});
