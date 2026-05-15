import {
    fieldsOf,
    optionsOf,
    numberConstraintsOf,
    stringConstraintsOf,
    arrayConstraintsOf,
    objectConstraintsOf,
    ifClauseOf,
    thenClauseOf,
    elseClauseOf,
    negatedOf,
} from "./helpers.js";
/**
 * Tests for full-compliance features:
 * - multipleOf, uniqueItems, minProperties, maxProperties constraints
 * - if/then/else conditional schemas
 * - not (negation)
 * - contains / minContains / maxContains
 * - $anchor resolution
 * - type array constraint stripping
 * - Swagger 2.0 type: file
 * - Swagger 2.0 recursive $ref
 */
import { describe, it, expect } from "vitest";
import { walk } from "../src/core/walker.ts";
import { normaliseSchema } from "../src/core/adapter.ts";
import { renderToHtml } from "../src/html/renderToHtml.ts";

// ---------------------------------------------------------------------------
// multipleOf
// ---------------------------------------------------------------------------

describe("multipleOf constraint", () => {
    it("extracts multipleOf from number schema", () => {
        const tree = walk({ type: "number", multipleOf: 0.5 }, {});
        expect(numberConstraintsOf(tree)?.multipleOf).toBe(0.5);
    });

    it("extracts multipleOf from integer schema", () => {
        const tree = walk({ type: "integer", multipleOf: 10 }, {});
        expect(numberConstraintsOf(tree)?.multipleOf).toBe(10);
    });
});

// ---------------------------------------------------------------------------
// uniqueItems
// ---------------------------------------------------------------------------

describe("uniqueItems constraint", () => {
    it("extracts uniqueItems: true", () => {
        const tree = walk(
            { type: "array", items: { type: "string" }, uniqueItems: true },
            {}
        );
        expect(arrayConstraintsOf(tree)?.uniqueItems).toBe(true);
    });

    it("omits uniqueItems when absent", () => {
        const tree = walk({ type: "array", items: { type: "string" } }, {});
        expect(arrayConstraintsOf(tree)?.uniqueItems).toBe(undefined);
    });
});

// ---------------------------------------------------------------------------
// minProperties / maxProperties
// ---------------------------------------------------------------------------

describe("minProperties / maxProperties constraints", () => {
    it("extracts minProperties", () => {
        const tree = walk(
            {
                type: "object",
                properties: { a: { type: "string" } },
                minProperties: 1,
            },
            {}
        );
        expect(objectConstraintsOf(tree)?.minProperties).toBe(1);
    });

    it("extracts maxProperties", () => {
        const tree = walk(
            {
                type: "object",
                properties: { a: { type: "string" } },
                maxProperties: 5,
            },
            {}
        );
        expect(objectConstraintsOf(tree)?.maxProperties).toBe(5);
    });
});

// ---------------------------------------------------------------------------
// if / then / else
// ---------------------------------------------------------------------------

describe("if / then / else", () => {
    it("walks a conditional schema with all three clauses", () => {
        const tree = walk(
            {
                type: "object",
                properties: {
                    kind: { type: "string" },
                },
                if: {
                    type: "object",
                    properties: { kind: { const: "a" } },
                },
                then: {
                    type: "object",
                    properties: { value: { type: "number" } },
                },
                else: {
                    type: "object",
                    properties: { value: { type: "string" } },
                },
            },
            {}
        );
        expect(tree.type).toBe("conditional");
        expect(ifClauseOf(tree)).toBeTruthy();
        expect(ifClauseOf(tree)?.type).toBe("object");
        expect(thenClauseOf(tree)).toBeTruthy();
        expect(elseClauseOf(tree)).toBeTruthy();
    });

    it("walks conditional with only if and then", () => {
        const tree = walk(
            {
                type: "string",
                if: { minLength: 5 },
                then: { maxLength: 100 },
            },
            {}
        );
        expect(tree.type).toBe("conditional");
        expect(ifClauseOf(tree)).toBeTruthy();
        expect(thenClauseOf(tree)).toBeTruthy();
        expect(elseClauseOf(tree)).toBe(undefined);
    });

    it("walks conditional with only if and else", () => {
        const tree = walk(
            {
                type: "number",
                if: { minimum: 0 },
                else: { type: "null" },
            },
            {}
        );
        expect(tree.type).toBe("conditional");
        expect(ifClauseOf(tree)).toBeTruthy();
        expect(thenClauseOf(tree)).toBe(undefined);
        expect(elseClauseOf(tree)).toBeTruthy();
    });

    it("renders conditional as HTML", () => {
        const html = renderToHtml({
            type: "object",
            properties: { x: { type: "number" } },
            if: { properties: { x: { minimum: 0 } } },
            then: { description: "positive" },
        });
        expect(html.includes("sc-conditional")).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// not (negation)
// ---------------------------------------------------------------------------

describe("not (negation)", () => {
    it("walks a negation schema", () => {
        const tree = walk({ not: { type: "string" } }, {});
        expect(tree.type).toBe("negation");
        expect(negatedOf(tree)).toBeTruthy();
        expect(negatedOf(tree)?.type).toBe("string");
    });

    it("walks negation with complex sub-schema", () => {
        const tree = walk(
            {
                not: {
                    type: "object",
                    properties: {
                        forbidden: { type: "boolean" },
                    },
                },
            },
            {}
        );
        expect(tree.type).toBe("negation");
        expect(negatedOf(tree)?.type).toBe("object");
    });

    it("renders negation as HTML", () => {
        const html = renderToHtml({ not: { type: "string" } });
        expect(html.includes("sc-negation")).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// contains / minContains / maxContains
// ---------------------------------------------------------------------------

describe("contains / minContains / maxContains", () => {
    it("extracts contains schema", () => {
        const tree = walk(
            {
                type: "array",
                items: { type: "number" },
                contains: { type: "number", minimum: 10 },
            },
            {}
        );
        expect(tree.type).toBe("array");
        expect(arrayConstraintsOf(tree)?.contains).toStrictEqual({
            type: "number",
            minimum: 10,
        });
    });

    it("extracts minContains and maxContains", () => {
        const tree = walk(
            {
                type: "array",
                items: { type: "number" },
                contains: { type: "number", minimum: 10 },
                minContains: 1,
                maxContains: 5,
            },
            {}
        );
        expect(arrayConstraintsOf(tree)?.minContains).toBe(1);
        expect(arrayConstraintsOf(tree)?.maxContains).toBe(5);
    });

    it("omits contains when absent", () => {
        const tree = walk({ type: "array", items: { type: "number" } }, {});
        expect(arrayConstraintsOf(tree)?.contains).toBe(undefined);
        expect(arrayConstraintsOf(tree)?.minContains).toBe(undefined);
        expect(arrayConstraintsOf(tree)?.maxContains).toBe(undefined);
    });
});

// ---------------------------------------------------------------------------
// $anchor resolution
// ---------------------------------------------------------------------------

describe("$anchor resolution", () => {
    it("resolves $ref to $anchor", () => {
        const rootDocument = {
            type: "object",
            properties: {
                user: { $ref: "#User" },
            },
            $defs: {
                User: {
                    $anchor: "User",
                    type: "object",
                    properties: {
                        name: { type: "string" },
                    },
                    required: ["name"],
                },
            },
        } as Record<string, unknown>;
        const tree = walk(rootDocument, { rootDocument });
        const user = (fieldsOf(tree) as Record<string, unknown>).user;
        expect((user as { type: string }).type).toBe("object");
    });

    it("resolves $anchor across nested $defs", () => {
        const rootDocument = {
            type: "object",
            properties: {
                address: { $ref: "#Address" },
            },
            $defs: {
                inner: {
                    Address: {
                        $anchor: "Address",
                        type: "object",
                        properties: {
                            city: { type: "string" },
                        },
                    },
                },
            },
        } as Record<string, unknown>;
        const tree = walk(rootDocument, { rootDocument });
        const address = (fieldsOf(tree) as Record<string, unknown>).address;
        expect((address as { type: string }).type).toBe("object");
    });
});

// ---------------------------------------------------------------------------
// Type array constraint stripping
// ---------------------------------------------------------------------------

describe("type array constraint stripping", () => {
    it("strips string constraints from number union option", () => {
        const tree = walk(
            {
                type: ["string", "number"],
                minLength: 1,
                minimum: 0,
            },
            {}
        );
        expect(tree.type).toBe("union");
        expect(optionsOf(tree)).toBeTruthy();
        const stringOpt = optionsOf(tree)?.find((o) => o.type === "string");
        const numberOpt = optionsOf(tree)?.find((o) => o.type === "number");
        // String option should keep minLength, not minimum
        if (stringOpt !== undefined) {
            expect(stringConstraintsOf(stringOpt)?.minLength).toBe(1);
            expect(numberConstraintsOf(stringOpt)?.minimum).toBe(undefined);
        }
        // Number option should keep minimum, not minLength
        if (numberOpt !== undefined) {
            expect(numberConstraintsOf(numberOpt)?.minimum).toBe(0);
            expect(stringConstraintsOf(numberOpt)?.minLength).toBe(undefined);
        }
    });

    it("strips array constraints from string single-type expansion", () => {
        const tree = walk({ type: ["string", "null"], minItems: 1 }, {});
        expect(tree.type).toBe("string");
        expect(tree.isNullable).toBe(true);
        // minItems should be stripped since the resolved type is string
        expect(arrayConstraintsOf(tree)?.minItems).toBe(undefined);
    });
});

// ---------------------------------------------------------------------------
// Swagger 2.0 type: "file"
// ---------------------------------------------------------------------------

describe("Swagger 2.0 type: file", () => {
    const doc = {
        swagger: "2.0",
        info: { title: "Upload API", version: "1.0" },
        host: "api.example.com",
        consumes: ["multipart/form-data"],
        paths: {
            "/upload": {
                post: {
                    parameters: [
                        {
                            name: "file",
                            in: "formData",
                            type: "file",
                            description: "File to upload",
                        },
                    ],
                    responses: {
                        "200": { description: "OK" },
                    },
                },
            },
        },
        definitions: {},
    } as Record<string, unknown>;

    it("converts file formData to binary string schema", () => {
        const result = normaliseSchema(doc, "/upload/post");
        // The request body should have multipart/form-data content
        const jsonSchema = result.jsonSchema;
        expect(jsonSchema.type).toBe("object");
        const properties = jsonSchema.properties as Record<string, unknown>;
        const file = properties.file as Record<string, unknown>;
        expect(file.type).toBe("string");
        expect(file.format).toBe("binary");
    });

    it("uses multipart/form-data content type for formData", () => {
        const result = normaliseSchema(doc, "/upload/post");
        const rootDoc = result.rootDocument;
        const paths = rootDoc.paths as Record<string, unknown>;
        const upload = paths["/upload"] as Record<string, unknown>;
        const post = upload.post as Record<string, unknown>;
        const requestBody = post.requestBody as Record<string, unknown>;
        const content = requestBody.content as Record<string, unknown>;
        expect("multipart/form-data" in content).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Swagger 2.0 recursive $ref resolution
// ---------------------------------------------------------------------------

describe("Swagger 2.0 recursive $ref", () => {
    const doc = {
        swagger: "2.0",
        info: { title: "API", version: "1.0" },
        paths: {},
        definitions: {
            Item: {
                type: "object",
                properties: {
                    id: { type: "string" },
                },
            },
        },
    } as Record<string, unknown>;

    it("resolves #/components/schemas/Item from normalised Swagger doc", () => {
        const result = normaliseSchema(doc, "#/components/schemas/Item");
        expect(result.jsonSchema.type).toBe("object");
        const properties = result.jsonSchema.properties as Record<
            string,
            unknown
        >;
        const id = properties.id as Record<string, unknown>;
        expect(id.type).toBe("string");
    });
});
