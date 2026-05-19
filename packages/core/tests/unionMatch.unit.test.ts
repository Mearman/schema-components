/**
 * Direct unit tests for `core/unionMatch.ts`.
 *
 * The renderers (React headless, HTML sync, HTML streaming) all delegate
 * union option matching and discriminator resolution to this module, so
 * the typeof dispatch and label-derivation fallbacks deserve focused
 * coverage that does not depend on a full render pipeline.
 */

import { describe, it, expect } from "vitest";
import {
    matchUnionOption,
    resolveDiscriminatedActive,
} from "../src/core/unionMatch.ts";
import type {
    ArrayField,
    BooleanField,
    EnumField,
    LiteralField,
    NumberField,
    ObjectField,
    StringField,
    UnknownField,
    WalkedField,
} from "../src/core/types.ts";

// ---------------------------------------------------------------------------
// Field-builder helpers — minimal shapes for the dispatch tests
// ---------------------------------------------------------------------------

function stringField(): StringField {
    return {
        type: "string",
        editability: "editable",
        meta: {},
        constraints: {},
    };
}

function numberField(): NumberField {
    return {
        type: "number",
        editability: "editable",
        meta: {},
        constraints: {},
        isInteger: false,
    };
}

function booleanField(): BooleanField {
    return {
        type: "boolean",
        editability: "editable",
        meta: {},
        constraints: {},
    };
}

function enumField(values: unknown[]): EnumField {
    return {
        type: "enum",
        editability: "editable",
        meta: {},
        constraints: {},
        enumValues: values,
    };
}

function arrayField(): ArrayField {
    return {
        type: "array",
        editability: "editable",
        meta: {},
        constraints: {},
    };
}

function objectField(meta: Record<string, unknown> = {}): ObjectField {
    return {
        type: "object",
        editability: "editable",
        meta,
        constraints: {},
        fields: {},
        requiredFields: [],
    };
}

function unknownField(): UnknownField {
    return {
        type: "unknown",
        editability: "editable",
        meta: {},
        constraints: {},
    };
}

function literalField(value: unknown): LiteralField {
    return {
        type: "literal",
        editability: "editable",
        meta: {},
        constraints: {},
        literalValues: [value],
    };
}

// Build a discriminated-option `object` whose property `discriminator`
// carries the supplied literal as its const sub-schema.
function discriminatedOption(
    discriminator: string,
    constValue: unknown,
    meta: Record<string, unknown> = {}
): ObjectField {
    return {
        type: "object",
        editability: "editable",
        meta,
        constraints: {},
        fields: {
            [discriminator]: literalField(constValue),
        },
        requiredFields: [discriminator],
    };
}

// ---------------------------------------------------------------------------
// matchUnionOption
// ---------------------------------------------------------------------------

describe("matchUnionOption", () => {
    const stringOpt = stringField();
    const numberOpt = numberField();
    const booleanOpt = booleanField();
    const arrayOpt = arrayField();
    const objectOpt = objectField();
    const enumOpt = enumField(["a", "b"]);

    const options: readonly WalkedField[] = [
        stringOpt,
        numberOpt,
        booleanOpt,
        arrayOpt,
        objectOpt,
        enumOpt,
    ];

    it("matches a string value to the first string-shaped option", () => {
        expect(matchUnionOption(options, "hello")).toBe(stringOpt);
    });

    it("matches a string value to an enum option when no string option exists", () => {
        const noString: readonly WalkedField[] = [numberOpt, enumOpt];
        expect(matchUnionOption(noString, "x")).toBe(enumOpt);
    });

    it("matches a number value to the number option", () => {
        expect(matchUnionOption(options, 5)).toBe(numberOpt);
    });

    it("matches a boolean value to the boolean option", () => {
        expect(matchUnionOption(options, true)).toBe(booleanOpt);
        expect(matchUnionOption(options, false)).toBe(booleanOpt);
    });

    it("matches an array value to the array option ahead of object", () => {
        expect(matchUnionOption(options, [1, 2, 3])).toBe(arrayOpt);
    });

    it("matches a plain object to the object option", () => {
        expect(matchUnionOption(options, { name: "Ada" })).toBe(objectOpt);
    });

    it("returns undefined for null", () => {
        // `null` is `typeof 'object'` but matchUnionOption checks
        // `value !== null` before the object branch, so it falls
        // through to the undefined sentinel.
        expect(matchUnionOption(options, null)).toBeUndefined();
    });

    it("returns undefined for undefined", () => {
        expect(matchUnionOption(options, undefined)).toBeUndefined();
    });

    it("returns undefined when no option matches the value's shape", () => {
        const stringOnly: readonly WalkedField[] = [stringOpt];
        expect(matchUnionOption(stringOnly, 5)).toBeUndefined();
    });

    it("returns undefined for non-JSON value shapes (bigint, symbol)", () => {
        expect(matchUnionOption(options, 10n)).toBeUndefined();
        expect(matchUnionOption(options, Symbol("s"))).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// resolveDiscriminatedActive
// ---------------------------------------------------------------------------

describe("resolveDiscriminatedActive — label derivation", () => {
    it("uses the discriminator literal as the option label", () => {
        const options = [
            discriminatedOption("kind", "alpha"),
            discriminatedOption("kind", "beta"),
        ];
        const result = resolveDiscriminatedActive(options, "kind", undefined);
        expect(result.optionLabels).toEqual(["alpha", "beta"]);
    });

    it("falls back to meta.title when the discriminator literal is not a string", () => {
        // Numeric const → typeof !== "string" branch falls through to
        // the meta.title check. This is the lines 82-83 path that the
        // existing coverage report flagged as uncovered.
        const options: WalkedField[] = [
            discriminatedOption("kind", 1, { title: "First" }),
            discriminatedOption("kind", 2, { title: "Second" }),
        ];
        const result = resolveDiscriminatedActive(options, "kind", undefined);
        expect(result.optionLabels).toEqual(["First", "Second"]);
    });

    it("falls back to the option type when neither literal nor title is a string", () => {
        // No discriminator on the union options (matches the active-index
        // fallback to 0). Tests the `return opt.type` final fallback in
        // the label map.
        const options: WalkedField[] = [stringField(), numberField()];
        const result = resolveDiscriminatedActive(options, "kind", undefined);
        expect(result.optionLabels).toEqual(["string", "number"]);
    });

    it("falls back when meta.title is present but not a string", () => {
        const options: WalkedField[] = [
            objectField({ title: 42 }),
            objectField({ title: undefined }),
        ];
        const result = resolveDiscriminatedActive(options, "kind", undefined);
        // Both fall through to opt.type.
        expect(result.optionLabels).toEqual(["object", "object"]);
    });
});

describe("resolveDiscriminatedActive — active index selection", () => {
    const options = [
        discriminatedOption("kind", "alpha"),
        discriminatedOption("kind", "beta"),
        discriminatedOption("kind", "gamma"),
    ];

    it("defaults to index 0 when no value is supplied", () => {
        expect(
            resolveDiscriminatedActive(options, "kind", undefined).activeIndex
        ).toBe(0);
    });

    it("picks the index whose label matches the discriminator value", () => {
        const result = resolveDiscriminatedActive(options, "kind", {
            kind: "beta",
        });
        expect(result.activeIndex).toBe(1);
        expect(result.activeOption).toBe(options[1]);
    });

    it("falls back to index 0 when the discriminator value matches no label", () => {
        const result = resolveDiscriminatedActive(options, "kind", {
            kind: "delta",
        });
        expect(result.activeIndex).toBe(0);
    });

    it("ignores non-string discriminator values on the supplied object", () => {
        const result = resolveDiscriminatedActive(options, "kind", {
            kind: 99,
        });
        expect(result.activeIndex).toBe(0);
    });

    it("returns the active option for the resolved index", () => {
        const result = resolveDiscriminatedActive(options, "kind", {
            kind: "gamma",
        });
        expect(result.activeOption).toBe(options[2]);
    });

    it("returns an undefined active option when the option list is empty", () => {
        const result = resolveDiscriminatedActive([], "kind", undefined);
        expect(result.activeOption).toBeUndefined();
        expect(result.optionLabels).toEqual([]);
    });

    it("handles unknown options without crashing the dispatch", () => {
        // Defensive: a union option that isn't itself an object should
        // still produce a label via the type fallback.
        const mixed: WalkedField[] = [
            discriminatedOption("kind", "alpha"),
            unknownField(),
        ];
        const result = resolveDiscriminatedActive(mixed, "kind", {
            kind: "alpha",
        });
        expect(result.optionLabels).toEqual(["alpha", "unknown"]);
        expect(result.activeIndex).toBe(0);
    });
});
