/**
 * Tests for legacy `dependencies` splitting into `dependentRequired` /
 * `dependentSchemas` during normalisation.
 */

import { describe, it, expect } from "vitest";
import { normaliseJsonSchema } from "../src/core/normalise.ts";
import { walk } from "../src/core/walker.ts";
import { normaliseSchema } from "../src/core/adapter.ts";
import { isObject } from "../src/core/guards.ts";

// ---------------------------------------------------------------------------
// Draft 04: dependencies splitting
// ---------------------------------------------------------------------------

describe("Draft 04 dependencies splitting", () => {
    it("splits required-only dependencies", () => {
        const schema = {
            $schema: "http://json-schema.org/draft-04/schema#",
            type: "object",
            properties: {
                name: { type: "string" },
                creditCard: { type: "string" },
                billingAddress: { type: "string" },
            },
            dependencies: {
                creditCard: ["billingAddress"],
            },
        } as Record<string, unknown>;

        const normalised = normaliseJsonSchema(schema, "draft-04");
        expect("dependencies" in normalised).toBe(false);
        expect(normalised.dependentRequired).toStrictEqual({
            creditCard: ["billingAddress"],
        });
        expect(normalised.dependentSchemas).toBeUndefined();
    });

    it("splits schema-only dependencies", () => {
        const schema = {
            type: "object",
            properties: {
                name: { type: "string" },
                age: { type: "number" },
            },
            dependencies: {
                age: {
                    properties: {
                        name: { type: "string" },
                    },
                    required: ["name"],
                },
            },
        } as Record<string, unknown>;

        const normalised = normaliseJsonSchema(schema, "draft-04");
        expect("dependencies" in normalised).toBe(false);
        expect(normalised.dependentRequired).toBeUndefined();
        const depSchemas = normalised.dependentSchemas;
        expect(isObject(depSchemas)).toBe(true);
        if (isObject(depSchemas)) {
            expect("age" in depSchemas).toBe(true);
        }
    });

    it("splits mixed dependencies (required + schema in same object)", () => {
        const schema = {
            type: "object",
            properties: {
                name: { type: "string" },
                creditCard: { type: "string" },
                billingAddress: { type: "string" },
                age: { type: "number" },
            },
            dependencies: {
                creditCard: ["billingAddress"],
                age: {
                    properties: {
                        name: { type: "string" },
                    },
                    required: ["name"],
                },
            },
        } as Record<string, unknown>;

        const normalised = normaliseJsonSchema(schema, "draft-04");
        expect("dependencies" in normalised).toBe(false);
        expect(normalised.dependentRequired).toStrictEqual({
            creditCard: ["billingAddress"],
        });
        const depSchemas = normalised.dependentSchemas;
        expect(isObject(depSchemas)).toBe(true);
        if (isObject(depSchemas)) {
            expect("age" in depSchemas).toBe(true);
        }
    });

    it("handles empty dependencies object", () => {
        const schema = {
            type: "object",
            dependencies: {},
        } as Record<string, unknown>;

        const normalised = normaliseJsonSchema(schema, "draft-04");
        expect("dependencies" in normalised).toBe(false);
        expect(normalised.dependentRequired).toBeUndefined();
        expect(normalised.dependentSchemas).toBeUndefined();
    });

    it("drops malformed dependency values", () => {
        const schema = {
            type: "object",
            dependencies: {
                foo: 42,
                bar: "invalid",
            },
        } as Record<string, unknown>;

        const normalised = normaliseJsonSchema(schema, "draft-04");
        expect("dependencies" in normalised).toBe(false);
        expect(normalised.dependentRequired).toBeUndefined();
        expect(normalised.dependentSchemas).toBeUndefined();
    });

    it("merges with existing dependentRequired and dependentSchemas", () => {
        const schema = {
            type: "object",
            dependentRequired: { existing: ["field"] },
            dependentSchemas: {
                existing: { properties: { field: { type: "string" } } },
            },
            dependencies: {
                newField: ["another"],
            },
        } as Record<string, unknown>;

        const normalised = normaliseJsonSchema(schema, "draft-04");
        const depReq = normalised.dependentRequired;
        expect(depReq).toStrictEqual({
            existing: ["field"],
            newField: ["another"],
        });
    });
});

// ---------------------------------------------------------------------------
// Draft 06/07: dependencies splitting (same logic, different draft path)
// ---------------------------------------------------------------------------

describe("Draft 06/07 dependencies splitting", () => {
    it("splits dependencies in Draft 06 schema", () => {
        const schema = {
            $schema: "http://json-schema.org/draft-06/schema#",
            type: "object",
            properties: {
                name: { type: "string" },
                age: { type: "integer" },
            },
            dependencies: {
                age: ["name"],
            },
        } as Record<string, unknown>;

        const normalised = normaliseJsonSchema(schema, "draft-06");
        expect("dependencies" in normalised).toBe(false);
        expect(normalised.dependentRequired).toStrictEqual({ age: ["name"] });
    });

    it("splits dependencies in Draft 07 schema", () => {
        const schema = {
            $schema: "http://json-schema.org/draft-07/schema#",
            type: "object",
            properties: {
                name: { type: "string" },
                age: { type: "integer" },
            },
            dependencies: {
                age: ["name"],
            },
        } as Record<string, unknown>;

        const normalised = normaliseJsonSchema(schema, "draft-07");
        expect("dependencies" in normalised).toBe(false);
        expect(normalised.dependentRequired).toStrictEqual({ age: ["name"] });
    });

    it("walks Draft 06 schema with dependencies end-to-end", () => {
        const schema = {
            $schema: "http://json-schema.org/draft-06/schema#",
            type: "object",
            properties: {
                creditCard: { type: "string" },
                billingAddress: { type: "string" },
            },
            dependencies: {
                creditCard: ["billingAddress"],
            },
        } as Record<string, unknown>;

        const result = normaliseSchema(schema);
        const tree = walk(result.jsonSchema, {
            rootDocument: result.rootDocument,
        });
        expect(tree.type).toBe("object");
        if (tree.type === "object") {
            expect(tree.dependentRequired).toStrictEqual({
                creditCard: ["billingAddress"],
            });
        }
    });
});

// ---------------------------------------------------------------------------
// Schema dependency: recursive normalisation
// ---------------------------------------------------------------------------

describe("recursive normalisation of schema dependencies", () => {
    it("normalises exclusiveMinimum inside a schema dependency", () => {
        const schema = {
            type: "object",
            properties: {
                age: { type: "integer" },
            },
            dependencies: {
                age: {
                    properties: {
                        score: {
                            type: "number",
                            minimum: 0,
                            exclusiveMinimum: true,
                        },
                    },
                },
            },
        } as Record<string, unknown>;

        const normalised = normaliseJsonSchema(schema, "draft-04");
        expect(isObject(normalised.dependentSchemas)).toBe(true);
        const depSchemas = normalised.dependentSchemas;
        if (!isObject(depSchemas)) return;

        const ageSchema = depSchemas.age;
        expect(isObject(ageSchema)).toBe(true);
        if (!isObject(ageSchema)) return;

        const props = ageSchema.properties;
        expect(isObject(props)).toBe(true);
        if (!isObject(props)) return;

        const score = props.score;
        expect(isObject(score)).toBe(true);
        if (!isObject(score)) return;

        // exclusiveMinimum: true + minimum: 0 → exclusiveMinimum: 0
        expect(score.exclusiveMinimum).toBe(0);
        expect(score.minimum).toBeUndefined();
    });
});
