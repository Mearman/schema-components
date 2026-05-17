import { fieldsOf, optionsOf, prefixItemsOf } from "./helpers.js";
/**
 * Comprehensive tests for all remaining version-specific features:
 * - type as array (Draft 04–07)
 * - prefixItems / tuples (Draft 2020-12)
 * - $dynamicRef / $dynamicAnchor (Draft 2020-12)
 * - OpenAPI 3.0.x discriminator keyword
 * - OpenAPI 3.0.x example → examples
 * - Swagger 2.0 produces/consumes
 * - Swagger 2.0 response $ref resolution
 * - Swagger 2.0 collectionFormat → style/explode
 */
import { describe, it, expect } from "vitest";
import { assertDefined } from "./helpers.ts";
import { walk } from "../src/core/walker.ts";
import { normaliseSchema } from "../src/core/adapter.ts";
import { normaliseJsonSchema } from "../src/core/normalise.ts";
import { isObject } from "../src/core/guards.ts";
import type { Diagnostic } from "../src/core/diagnostics.ts";

// ---------------------------------------------------------------------------
// type as array
// ---------------------------------------------------------------------------

describe("type as array", () => {
    it('handles ["string", "null"] as nullable string', () => {
        const tree = walk({ type: ["string", "null"] }, {});
        expect(tree.type).toBe("string");
        expect(tree.isNullable).toBe(true);
    });

    it('handles ["number", "null"] as nullable number', () => {
        const tree = walk({ type: ["number", "null"] }, {});
        expect(tree.type).toBe("number");
        expect(tree.isNullable).toBe(true);
    });

    it('handles ["null"] as null type', () => {
        const tree = walk({ type: ["null"] }, {});
        expect(tree.type).toBe("null");
    });

    it('handles ["string", "number"] as union', () => {
        const tree = walk({ type: ["string", "number"] }, {});
        expect(tree.type).toBe("union");
        expect(optionsOf(tree)?.length).toBe(2);
    });

    it('handles ["string", "number", "null"] as nullable union', () => {
        const tree = walk({ type: ["string", "number", "null"] }, {});
        expect(tree.type).toBe("union");
        expect(tree.isNullable).toBe(true);
        // Two non-null options + null
        expect(optionsOf(tree)?.length).toBe(3);
    });

    it('handles ["object", "null"] as nullable object', () => {
        const tree = walk(
            {
                type: ["object", "null"],
                properties: { name: { type: "string" } },
            },
            {}
        );
        expect(tree.type).toBe("object");
        expect(tree.isNullable).toBe(true);
        expect(
            assertDefined(assertDefined(fieldsOf(tree), "fields").name, "name")
                .type
        ).toBe("string");
    });

    it("handles type array in Draft 04 end-to-end", () => {
        const schema = {
            $schema: "http://json-schema.org/draft-04/schema#",
            type: "object",
            properties: {
                status: { type: ["string", "null"] },
            },
        } as Record<string, unknown>;
        const result = normaliseSchema(schema);
        const tree = walk(result.jsonSchema, {
            rootDocument: result.rootDocument,
        });
        const status = assertDefined(
            assertDefined(fieldsOf(tree), "fields").status,
            "status"
        );
        expect(status.type).toBe("string");
        expect(status.isNullable).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// prefixItems / tuples (Draft 2020-12)
// ---------------------------------------------------------------------------

describe("prefixItems / tuples", () => {
    it("walks a tuple with prefixItems", () => {
        const tree = walk(
            {
                type: "array",
                prefixItems: [
                    { type: "string" },
                    { type: "number" },
                    { type: "boolean" },
                ],
            },
            {}
        );
        expect(tree.type).toBe("tuple");
        expect(prefixItemsOf(tree)).toBeTruthy();
        expect(prefixItemsOf(tree)?.length).toBe(3);
        expect(prefixItemsOf(tree)?.[0]?.type).toBe("string");
        expect(prefixItemsOf(tree)?.[1]?.type).toBe("number");
        expect(prefixItemsOf(tree)?.[2]?.type).toBe("boolean");
    });

    it("falls back to array type when prefixItems is absent", () => {
        const tree = walk(
            {
                type: "array",
                items: { type: "string" },
            },
            {}
        );
        expect(tree.type).toBe("array");
        expect(prefixItemsOf(tree)).toBe(undefined);
    });

    it("handles empty prefixItems as tuple", () => {
        const tree = walk(
            {
                type: "array",
                prefixItems: [],
            },
            {}
        );
        // Empty prefixItems still produces a tuple type
        expect(tree.type).toBe("tuple");
        expect(prefixItemsOf(tree)?.length).toBe(0);
    });

    it("walks tuple with complex element schemas", () => {
        const tree = walk(
            {
                type: "array",
                prefixItems: [
                    {
                        type: "object",
                        properties: { name: { type: "string" } },
                        required: ["name"],
                    },
                    { type: "integer" },
                ],
            },
            {}
        );
        expect(tree.type).toBe("tuple");
        const first = assertDefined(prefixItemsOf(tree)?.[0], "first item");
        expect(first.type).toBe("object");
        expect(assertDefined(fieldsOf(first), "fields").name?.type).toBe(
            "string"
        );
        expect(prefixItemsOf(tree)?.[1]?.type).toBe("number");
    });
});

// ---------------------------------------------------------------------------
// $dynamicRef / $dynamicAnchor (Draft 2020-12)
// ---------------------------------------------------------------------------

describe("$dynamicRef / $dynamicAnchor", () => {
    it("normalises $dynamicRef to $ref with $anchor", () => {
        const schema = {
            $dynamicAnchor: "Tree",
            type: "object",
            properties: {
                label: { type: "string" },
                children: {
                    type: "array",
                    items: { $dynamicRef: "#Tree" },
                },
            },
        } as Record<string, unknown>;

        const normalised = normaliseJsonSchema(schema, "draft-2020-12");
        // $dynamicAnchor → $anchor
        expect(normalised.$anchor).toBe("Tree");
        expect("$dynamicAnchor" in normalised).toBe(false);

        const properties = normalised.properties as Record<string, unknown>;
        const children = properties.children as Record<string, unknown>;
        const items = children.items as Record<string, unknown>;
        expect("$dynamicRef" in items).toBe(false);
        // $dynamicRef preserves the fragment for $anchor resolution
        expect(items.$ref).toBe("#Tree");
    });

    it("walks a $dynamicRef schema after normalisation", () => {
        const schema = {
            $dynamicAnchor: "Node",
            type: "object",
            properties: {
                value: { type: "string" },
                next: { $dynamicRef: "#Node" },
            },
        } as Record<string, unknown>;

        const normalised = normaliseJsonSchema(schema, "draft-2020-12");
        const result = normaliseSchema(normalised);
        const tree = walk(result.jsonSchema, {
            rootDocument: result.rootDocument,
        });

        expect(tree.type).toBe("object");
        const next = assertDefined(
            assertDefined(fieldsOf(tree), "fields").next,
            "next"
        );
        // $dynamicRef was converted to $ref — walker resolves it
        expect(next.type).toBe("object");
    });
});

// ---------------------------------------------------------------------------
// Draft 04: divisibleBy → multipleOf (Draft 03 carryover)
// ---------------------------------------------------------------------------

describe("Draft 04 divisibleBy → multipleOf", () => {
    it("translates divisibleBy to multipleOf when multipleOf is absent", () => {
        const schema: Record<string, unknown> = {
            $schema: "http://json-schema.org/draft-04/schema#",
            type: "integer",
            divisibleBy: 3,
        };
        const normalised = normaliseJsonSchema(schema, "draft-04");
        expect(normalised.multipleOf).toBe(3);
        expect("divisibleBy" in normalised).toBe(false);
    });

    it("emits divisible-by-conflict diagnostic when both are present and disagree", () => {
        const schema: Record<string, unknown> = {
            type: "integer",
            divisibleBy: 3,
            multipleOf: 4,
        };
        const diagnostics: Diagnostic[] = [];
        const normalised = normaliseJsonSchema(schema, "draft-04", {
            diagnostics: (d) => diagnostics.push(d),
        });
        // multipleOf wins; divisibleBy is dropped
        expect(normalised.multipleOf).toBe(4);
        expect("divisibleBy" in normalised).toBe(false);
        const conflict = diagnostics.find(
            (d) => d.code === "divisible-by-conflict"
        );
        expect(conflict).toBeDefined();
        expect(conflict?.detail?.divisibleBy).toBe(3);
        expect(conflict?.detail?.multipleOf).toBe(4);
    });

    it("does not emit divisible-by-conflict when values agree", () => {
        const schema: Record<string, unknown> = {
            type: "integer",
            divisibleBy: 3,
            multipleOf: 3,
        };
        const diagnostics: Diagnostic[] = [];
        const normalised = normaliseJsonSchema(schema, "draft-04", {
            diagnostics: (d) => diagnostics.push(d),
        });
        expect(normalised.multipleOf).toBe(3);
        expect("divisibleBy" in normalised).toBe(false);
        expect(
            diagnostics.filter((d) => d.code === "divisible-by-conflict").length
        ).toBe(0);
    });

    it("translates divisibleBy inside nested properties", () => {
        const schema: Record<string, unknown> = {
            type: "object",
            properties: {
                count: { type: "integer", divisibleBy: 5 },
            },
        };
        const normalised = normaliseJsonSchema(schema, "draft-04");
        const properties = normalised.properties;
        if (!isObject(properties)) throw new Error("expected properties");
        const count = properties.count;
        if (!isObject(count)) throw new Error("expected count");
        expect(count.multipleOf).toBe(5);
        expect("divisibleBy" in count).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Draft 2019-09: $recursiveRef value preservation
// ---------------------------------------------------------------------------

describe("Draft 2019-09 $recursiveRef value preservation", () => {
    it("preserves anchored $recursiveRef value when rewriting to $ref", () => {
        const schema: Record<string, unknown> = {
            $schema: "https://json-schema.org/draft/2019-09/schema",
            $recursiveAnchor: "meta",
            type: "object",
            properties: {
                next: { $recursiveRef: "#meta" },
            },
        };
        const normalised = normaliseJsonSchema(schema, "draft-2019-09");
        const properties = normalised.properties;
        if (!isObject(properties)) throw new Error("expected properties");
        const next = properties.next;
        if (!isObject(next)) throw new Error("expected next");
        // Original value "#meta" must survive — not be collapsed to "#"
        expect(next.$ref).toBe("#meta");
        expect("$recursiveRef" in next).toBe(false);
        // String-valued $recursiveAnchor is preserved as the $anchor name
        expect(normalised.$anchor).toBe("meta");
        expect("$recursiveAnchor" in normalised).toBe(false);
    });

    it("still rewrites bare $recursiveRef: '#' to $ref: '#'", () => {
        const schema: Record<string, unknown> = {
            $recursiveAnchor: true,
            type: "object",
            properties: {
                self: { $recursiveRef: "#" },
            },
        };
        const normalised = normaliseJsonSchema(schema, "draft-2019-09");
        const properties = normalised.properties;
        if (!isObject(properties)) throw new Error("expected properties");
        const self = properties.self;
        if (!isObject(self)) throw new Error("expected self");
        expect(self.$ref).toBe("#");
        // Bare `true` $recursiveAnchor still becomes the canonical marker
        expect(normalised.$anchor).toBe("__recursive__");
    });
});

// ---------------------------------------------------------------------------
// Draft 2020-12 path: legacy `dependencies` splitting
// ---------------------------------------------------------------------------

describe("Draft 2020-12 legacy dependencies splitting", () => {
    it("splits legacy `dependencies` reaching the 2020-12 path", () => {
        const schema: Record<string, unknown> = {
            type: "object",
            properties: {
                a: { type: "string" },
                b: { type: "string" },
            },
            dependencies: { a: ["b"] },
        };
        const diagnostics: Diagnostic[] = [];
        const normalised = normaliseJsonSchema(schema, "draft-2020-12", {
            diagnostics: (d) => diagnostics.push(d),
        });
        expect("dependencies" in normalised).toBe(false);
        expect(normalised.dependentRequired).toStrictEqual({ a: ["b"] });
        const split = diagnostics.find(
            (d) => d.code === "legacy-dependencies-split"
        );
        expect(split).toBeDefined();
    });

    it("end-to-end via adapter: no $schema → 2020-12 → legacy dependencies split", () => {
        const schema: Record<string, unknown> = {
            type: "object",
            properties: {
                creditCard: { type: "string" },
                billingAddress: { type: "string" },
            },
            dependencies: { creditCard: ["billingAddress"] },
        };
        const diagnostics: Diagnostic[] = [];
        const result = normaliseSchema(schema, undefined, {
            diagnostics: {
                diagnostics: (d) => diagnostics.push(d),
            },
        });
        const normalised = result.jsonSchema;
        if (!isObject(normalised)) throw new Error("expected object");
        expect("dependencies" in normalised).toBe(false);
        expect(normalised.dependentRequired).toStrictEqual({
            creditCard: ["billingAddress"],
        });
        expect(
            diagnostics.some((d) => d.code === "legacy-dependencies-split")
        ).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Unknown $schema URI: emit assumed-draft diagnostic
// ---------------------------------------------------------------------------

describe("unknown $schema URI assumed-draft diagnostic", () => {
    it("emits assumed-draft with the unknown URI in the detail", () => {
        const diagnostics: Diagnostic[] = [];
        normaliseSchema(
            {
                $schema: "http://example.com/schemas/v999",
                type: "string",
            },
            undefined,
            {
                diagnostics: {
                    diagnostics: (d) => diagnostics.push(d),
                },
            }
        );
        const assumed = diagnostics.filter((d) => d.code === "assumed-draft");
        expect(assumed.length).toBe(1);
        const diag = assumed[0];
        if (diag === undefined) throw new Error("expected assumed-draft");
        expect(diag.detail?.draft).toBe("draft-2020-12");
        expect(diag.detail?.inferredFrom).toBe("unknown-uri");
        expect(diag.detail?.uri).toBe("http://example.com/schemas/v999");
    });

    it("does not emit assumed-draft for a recognised $schema URI", () => {
        const diagnostics: Diagnostic[] = [];
        normaliseSchema(
            {
                $schema: "http://json-schema.org/draft-07/schema#",
                type: "string",
            },
            undefined,
            {
                diagnostics: {
                    diagnostics: (d) => diagnostics.push(d),
                },
            }
        );
        expect(
            diagnostics.filter((d) => d.code === "assumed-draft").length
        ).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// dependentRequired: non-string entries
// ---------------------------------------------------------------------------

describe("dependent-required-invalid diagnostic", () => {
    it("emits a diagnostic for each non-string entry and drops the property", () => {
        const schema: Record<string, unknown> = {
            type: "object",
            dependentRequired: {
                a: ["b", 42],
            },
        };
        const diagnostics: Diagnostic[] = [];
        normaliseJsonSchema(schema, "draft-2020-12", {
            diagnostics: (d) => diagnostics.push(d),
        });
        const invalid = diagnostics.filter(
            (d) => d.code === "dependent-required-invalid"
        );
        expect(invalid.length).toBe(1);
        const diag = invalid[0];
        if (diag === undefined) throw new Error("expected diagnostic");
        expect(diag.detail?.property).toBe("a");
        expect(diag.detail?.index).toBe(1);
        expect(diag.detail?.value).toBe(42);
    });

    it("emits dependent-required-invalid when legacy dependencies contains non-strings", () => {
        const schema: Record<string, unknown> = {
            type: "object",
            dependencies: {
                a: ["b", 42],
            },
        };
        const diagnostics: Diagnostic[] = [];
        const normalised = normaliseJsonSchema(schema, "draft-04", {
            diagnostics: (d) => diagnostics.push(d),
        });
        const invalid = diagnostics.filter(
            (d) => d.code === "dependent-required-invalid"
        );
        expect(invalid.length).toBe(1);
        const diag = invalid[0];
        if (diag === undefined) throw new Error("expected diagnostic");
        expect(diag.detail?.property).toBe("a");
        expect(diag.detail?.index).toBe(1);
        // Property is dropped entirely so the rewrite does not produce a
        // partial constraint silently.
        expect(normalised.dependentRequired).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// Draft 04 bare `exclusiveMinimum: true` / `exclusiveMaximum: true`
// ---------------------------------------------------------------------------

describe("Draft 04 bare exclusive bound without sibling minimum/maximum", () => {
    it("emits bare-exclusive-bound and drops bare `exclusiveMinimum: true`", () => {
        const schema: Record<string, unknown> = {
            $schema: "http://json-schema.org/draft-04/schema#",
            type: "integer",
            exclusiveMinimum: true,
        };
        const diagnostics: Diagnostic[] = [];
        const normalised = normaliseJsonSchema(schema, "draft-04", {
            diagnostics: (d) => diagnostics.push(d),
        });
        expect("exclusiveMinimum" in normalised).toBe(false);
        const diag = diagnostics.find((d) => d.code === "bare-exclusive-bound");
        expect(diag).toBeDefined();
        expect(diag?.detail?.keyword).toBe("exclusiveMinimum");
    });

    it("emits bare-exclusive-bound and drops bare `exclusiveMaximum: true`", () => {
        const schema: Record<string, unknown> = {
            $schema: "http://json-schema.org/draft-04/schema#",
            type: "integer",
            exclusiveMaximum: true,
        };
        const diagnostics: Diagnostic[] = [];
        const normalised = normaliseJsonSchema(schema, "draft-04", {
            diagnostics: (d) => diagnostics.push(d),
        });
        expect("exclusiveMaximum" in normalised).toBe(false);
        const diag = diagnostics.find((d) => d.code === "bare-exclusive-bound");
        expect(diag).toBeDefined();
        expect(diag?.detail?.keyword).toBe("exclusiveMaximum");
    });

    it("does not emit when `exclusiveMinimum: true` is paired with a numeric `minimum`", () => {
        const schema: Record<string, unknown> = {
            $schema: "http://json-schema.org/draft-04/schema#",
            type: "integer",
            minimum: 5,
            exclusiveMinimum: true,
        };
        const diagnostics: Diagnostic[] = [];
        const normalised = normaliseJsonSchema(schema, "draft-04", {
            diagnostics: (d) => diagnostics.push(d),
        });
        expect(normalised.exclusiveMinimum).toBe(5);
        expect("minimum" in normalised).toBe(false);
        expect(
            diagnostics.filter((d) => d.code === "bare-exclusive-bound").length
        ).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// OpenAPI 3.0.x discriminator
// ---------------------------------------------------------------------------
