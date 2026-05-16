import {
    fieldsOf,
    literalValuesOf,
    numberConstraintsOf,
    elementOf,
    enumValuesOf,
    stringConstraintsOf,
    arrayConstraintsOf,
} from "./helpers.js";
/**
 * Tests for multi-version JSON Schema and OpenAPI compatibility.
 *
 * Covers Draft 04, 06, 07, 2019-09, and 2020-12 schemas walking through
 * the normalisation pipeline, plus OpenAPI 3.0.x and Swagger 2.0 document
 * normalisation.
 */
import { describe, it, expect } from "vitest";
import { assertDefined } from "./helpers.ts";
import { walk } from "../src/core/walker.ts";
import { normaliseSchema } from "../src/core/adapter.ts";
import { normaliseJsonSchema } from "../src/core/normalise.ts";
import { detectJsonSchemaDraft } from "../src/core/version.ts";

// ---------------------------------------------------------------------------
// Draft 04: exclusiveMinimum/exclusiveMaximum boolean form
// ---------------------------------------------------------------------------

describe("Draft 04", () => {
    const draft04Schema = {
        $schema: "http://json-schema.org/draft-04/schema#",
        type: "object",
        properties: {
            name: { type: "string" },
            age: {
                type: "integer",
                minimum: 0,
                exclusiveMinimum: true,
            },
            score: {
                type: "number",
                maximum: 100,
                exclusiveMaximum: true,
            },
            rating: {
                type: "number",
                minimum: 1,
                maximum: 5,
            },
        },
        required: ["name"],
    } as Record<string, unknown>;

    it("detects Draft 04 from $schema", () => {
        expect(detectJsonSchemaDraft(draft04Schema)).toBe("draft-04");
    });

    it("normalises exclusiveMinimum boolean → number", () => {
        const normalised = normaliseJsonSchema(draft04Schema, "draft-04");
        // After normalisation, should be a Draft 2020-12-compatible schema
        const tree = walk(normalised, {});
        expect(tree.type).toBe("object");

        const age = assertDefined(
            assertDefined(fieldsOf(tree), "fields").age,
            "age"
        );
        // exclusiveMinimum: true + minimum: 0 → exclusiveMinimum: 0
        expect(numberConstraintsOf(age)?.exclusiveMinimum).toBe(0);
        expect(numberConstraintsOf(age)?.minimum).toBe(undefined);
    });

    it("normalises exclusiveMaximum boolean → number", () => {
        const normalised = normaliseJsonSchema(draft04Schema, "draft-04");
        const tree = walk(normalised, {});

        const score = assertDefined(
            assertDefined(fieldsOf(tree), "fields").score,
            "score"
        );
        // exclusiveMaximum: true + maximum: 100 → exclusiveMaximum: 100
        expect(numberConstraintsOf(score)?.exclusiveMaximum).toBe(100);
        expect(numberConstraintsOf(score)?.maximum).toBe(undefined);
    });

    it("preserves inclusive minimum/maximum when exclusive is absent", () => {
        const normalised = normaliseJsonSchema(draft04Schema, "draft-04");
        const tree = walk(normalised, {});

        const rating = assertDefined(
            assertDefined(fieldsOf(tree), "fields").rating,
            "rating"
        );
        expect(numberConstraintsOf(rating)?.minimum).toBe(1);
        expect(numberConstraintsOf(rating)?.maximum).toBe(5);
        expect(numberConstraintsOf(rating)?.exclusiveMinimum).toBe(undefined);
        expect(numberConstraintsOf(rating)?.exclusiveMaximum).toBe(undefined);
    });

    it("normalises via adapter end-to-end", () => {
        const result = normaliseSchema(draft04Schema);
        const tree = walk(result.jsonSchema, {
            rootDocument: result.rootDocument,
        });
        expect(tree.type).toBe("object");
        const age = assertDefined(
            assertDefined(fieldsOf(tree), "fields").age,
            "age"
        );
        expect(numberConstraintsOf(age)?.exclusiveMinimum).toBe(0);
    });

    it("handles exclusiveMinimum: false by removing it", () => {
        const schema = {
            type: "number",
            minimum: 5,
            exclusiveMinimum: false,
        } as Record<string, unknown>;
        const normalised = normaliseJsonSchema(schema, "draft-04");
        const tree = walk(normalised, {});
        expect(numberConstraintsOf(tree)?.minimum).toBe(5);
        expect(numberConstraintsOf(tree)?.exclusiveMinimum).toBe(undefined);
    });

    it("handles exclusiveMaximum: false by removing it", () => {
        const schema = {
            type: "number",
            maximum: 10,
            exclusiveMaximum: false,
        } as Record<string, unknown>;
        const normalised = normaliseJsonSchema(schema, "draft-04");
        const tree = walk(normalised, {});
        expect(numberConstraintsOf(tree)?.maximum).toBe(10);
        expect(numberConstraintsOf(tree)?.exclusiveMaximum).toBe(undefined);
    });

    it("normalises exclusiveMinimum in nested properties", () => {
        const schema = {
            type: "object",
            properties: {
                inner: {
                    type: "object",
                    properties: {
                        value: {
                            type: "number",
                            minimum: 1,
                            exclusiveMinimum: true,
                        },
                    },
                },
            },
        } as Record<string, unknown>;
        const normalised = normaliseJsonSchema(schema, "draft-04");
        const tree = walk(normalised, {});
        const inner = assertDefined(
            assertDefined(fieldsOf(tree), "fields").inner,
            "inner"
        );
        const value = assertDefined(fieldsOf(inner), "fieldsOf(inner)").value;
        expect(
            numberConstraintsOf(assertDefined(value, "value"))?.exclusiveMinimum
        ).toBe(1);
    });

    it("normalises exclusiveMinimum in allOf", () => {
        const schema = {
            allOf: [
                {
                    type: "object",
                    properties: {
                        count: {
                            type: "integer",
                            minimum: 0,
                            exclusiveMinimum: true,
                        },
                    },
                },
                {
                    type: "object",
                    properties: {
                        name: { type: "string" },
                    },
                    required: ["name"],
                },
            ],
        } as Record<string, unknown>;
        const normalised = normaliseJsonSchema(schema, "draft-04");
        const tree = walk(normalised, {});
        expect(tree.type).toBe("object");
        const count = assertDefined(
            assertDefined(fieldsOf(tree), "fields").count,
            "count"
        );
        expect(numberConstraintsOf(count)?.exclusiveMinimum).toBe(0);
    });

    it("resolves $ref to definitions/", () => {
        const schema = {
            $schema: "http://json-schema.org/draft-04/schema#",
            type: "object",
            properties: {
                user: { $ref: "#/definitions/User" },
            },
            definitions: {
                User: {
                    type: "object",
                    properties: {
                        name: { type: "string" },
                    },
                    required: ["name"],
                },
            },
        } as Record<string, unknown>;
        const result = normaliseSchema(schema);
        const tree = walk(result.jsonSchema, {
            rootDocument: result.rootDocument,
        });
        const user = assertDefined(
            assertDefined(fieldsOf(tree), "fields").user,
            "user"
        );
        expect(user.type).toBe("object");
        expect(
            assertDefined(
                assertDefined(fieldsOf(user), "fieldsOf(user)").name,
                "name"
            ).type
        ).toBe("string");
    });
});

// ---------------------------------------------------------------------------
// Draft 06: already compatible (exclusiveMinimum is a number)
// ---------------------------------------------------------------------------

describe("Draft 06", () => {
    const draft06Schema = {
        $schema: "http://json-schema.org/draft-06/schema#",
        type: "object",
        properties: {
            email: { type: "string", format: "email" },
            count: {
                type: "integer",
                exclusiveMinimum: 0,
            },
        },
        required: ["email"],
    } as Record<string, unknown>;

    it("detects Draft 06 from $schema", () => {
        expect(detectJsonSchemaDraft(draft06Schema)).toBe("draft-06");
    });

    it("walks Draft 06 schema without modification", () => {
        const result = normaliseSchema(draft06Schema);
        const tree = walk(result.jsonSchema, {
            rootDocument: result.rootDocument,
        });
        expect(tree.type).toBe("object");

        const email = assertDefined(
            assertDefined(fieldsOf(tree), "fields").email,
            "email"
        );
        expect(email.type).toBe("string");
        expect(stringConstraintsOf(email)?.format).toBe("email");

        const count = assertDefined(
            assertDefined(fieldsOf(tree), "fields").count,
            "count"
        );
        expect(numberConstraintsOf(count)?.exclusiveMinimum).toBe(0);
    });

    it("supports const keyword (added in Draft 06)", () => {
        const schema = {
            type: "string",
            const: "active",
        };
        const tree = walk(schema, {});
        expect(tree.type).toBe("literal");
        expect(literalValuesOf(tree)).toStrictEqual(["active"]);
    });
});

// ---------------------------------------------------------------------------
// Draft 07: already compatible
// ---------------------------------------------------------------------------

describe("Draft 07", () => {
    const draft07Schema = {
        $schema: "http://json-schema.org/draft-07/schema#",
        type: "object",
        properties: {
            status: { type: "string", enum: ["active", "inactive"] },
            score: {
                type: "number",
                exclusiveMinimum: 0,
                exclusiveMaximum: 100,
            },
        },
        required: ["status"],
    } as Record<string, unknown>;

    it("detects Draft 07 from $schema", () => {
        expect(detectJsonSchemaDraft(draft07Schema)).toBe("draft-07");
    });

    it("walks Draft 07 schema correctly", () => {
        const result = normaliseSchema(draft07Schema);
        const tree = walk(result.jsonSchema, {
            rootDocument: result.rootDocument,
        });
        expect(tree.type).toBe("object");

        const status = assertDefined(
            assertDefined(fieldsOf(tree), "fields").status,
            "status"
        );
        expect(status.type).toBe("enum");
        expect(enumValuesOf(status)).toStrictEqual(["active", "inactive"]);

        const score = assertDefined(
            assertDefined(fieldsOf(tree), "fields").score,
            "score"
        );
        expect(numberConstraintsOf(score)?.exclusiveMinimum).toBe(0);
        expect(numberConstraintsOf(score)?.exclusiveMaximum).toBe(100);
    });

    it("resolves $ref to definitions/ in Draft 07", () => {
        const schema = {
            $schema: "http://json-schema.org/draft-07/schema#",
            type: "object",
            properties: {
                address: { $ref: "#/definitions/Address" },
            },
            definitions: {
                Address: {
                    type: "object",
                    properties: {
                        city: { type: "string" },
                        postcode: { type: "string" },
                    },
                    required: ["city"],
                },
            },
        } as Record<string, unknown>;
        const result = normaliseSchema(schema);
        const tree = walk(result.jsonSchema, {
            rootDocument: result.rootDocument,
        });
        const address = assertDefined(
            assertDefined(fieldsOf(tree), "fields").address,
            "address"
        );
        expect(address.type).toBe("object");
        expect(
            assertDefined(
                assertDefined(fieldsOf(address), "fields").city,
                "city"
            ).type
        ).toBe("string");
    });
});

// ---------------------------------------------------------------------------
// Draft 2019-09: $recursiveRef → $ref
// ---------------------------------------------------------------------------

describe("Draft 2019-09", () => {
    it("detects Draft 2019-09 from $schema", () => {
        expect(
            detectJsonSchemaDraft({
                $schema: "https://json-schema.org/draft/2019-09/schema",
            })
        ).toBe("draft-2019-09");
    });

    it("normalises $recursiveRef to $ref", () => {
        const schema = {
            $schema: "https://json-schema.org/draft/2019-09/schema",
            $recursiveAnchor: true,
            type: "object",
            properties: {
                name: { type: "string" },
                children: {
                    type: "array",
                    items: { $recursiveRef: "#" },
                },
            },
            required: ["name"],
        } as Record<string, unknown>;

        const normalised = normaliseJsonSchema(schema, "draft-2019-09");
        const result = normaliseSchema(normalised);
        const tree = walk(result.jsonSchema, {
            rootDocument: result.rootDocument,
        });

        expect(tree.type).toBe("object");
        const children = assertDefined(
            assertDefined(fieldsOf(tree), "fields").children,
            "children"
        );
        expect(children.type).toBe("array");
        const element = assertDefined(elementOf(children), "element");
        expect(element.type).toBe("object");
        // Should be able to walk one level deep into the recursive element
        expect(
            assertDefined(
                assertDefined(fieldsOf(element), "fields").name,
                "name"
            ).type
        ).toBe("string");
    });

    it("removes $recursiveAnchor after normalisation", () => {
        const schema = {
            $recursiveAnchor: true,
            type: "string",
        } as Record<string, unknown>;

        const normalised = normaliseJsonSchema(schema, "draft-2019-09");
        expect("$recursiveAnchor" in normalised).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Draft 2020-12: current target, regression test
// ---------------------------------------------------------------------------

describe("Draft 2020-12", () => {
    it("detects Draft 2020-12 from $schema", () => {
        expect(
            detectJsonSchemaDraft({
                $schema: "https://json-schema.org/draft/2020-12/schema",
            })
        ).toBe("draft-2020-12");
    });

    it("defaults to Draft 2020-12 when $schema is absent", () => {
        expect(detectJsonSchemaDraft({ type: "string" })).toBe("draft-2020-12");
    });

    it("walks a complex Draft 2020-12 schema correctly", () => {
        const schema = {
            type: "object",
            properties: {
                name: { type: "string", minLength: 1, maxLength: 100 },
                tags: {
                    type: "array",
                    items: { type: "string" },
                    minItems: 1,
                },
                metadata: {
                    type: "object",
                    additionalProperties: { type: "string" },
                },
                role: {
                    enum: ["admin", "editor", "viewer"],
                },
            },
            required: ["name"],
        } as Record<string, unknown>;

        const tree = walk(schema, {});
        expect(tree.type).toBe("object");

        const name = assertDefined(
            assertDefined(fieldsOf(tree), "fields").name,
            "name"
        );
        expect(stringConstraintsOf(name)?.minLength).toBe(1);
        expect(stringConstraintsOf(name)?.maxLength).toBe(100);

        const tags = assertDefined(
            assertDefined(fieldsOf(tree), "fields").tags,
            "tags"
        );
        expect(tags.type).toBe("array");
        expect(arrayConstraintsOf(tags)?.minItems).toBe(1);

        const metadata = assertDefined(
            assertDefined(fieldsOf(tree), "fields").metadata,
            "metadata"
        );
        expect(metadata.type).toBe("record");

        const role = assertDefined(
            assertDefined(fieldsOf(tree), "fields").role,
            "role"
        );
        expect(role.type).toBe("enum");
    });
});

// ---------------------------------------------------------------------------
// OpenAPI 3.0.x: nullable → anyOf [T, null]
// ---------------------------------------------------------------------------
