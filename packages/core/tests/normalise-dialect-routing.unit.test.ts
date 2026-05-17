/**
 * Tests for OpenAPI 3.1 `jsonSchemaDialect` routing to per-draft
 * normalisation transforms.
 *
 * When an OAS 3.1 document declares a `jsonSchemaDialect` URI that
 * resolves to a known draft other than 2020-12, every Schema Object in
 * the document is routed through that draft's per-node transform so
 * legacy keywords (Draft 04 boolean `exclusiveMinimum`, Draft 04–07
 * tuple-form `items`, Draft 04–07 `dependencies`, Draft 2019-09
 * `$recursiveRef`) are translated to canonical Draft 2020-12 form
 * before the walker sees them.
 */
import { describe, it, expect } from "vitest";
import { normaliseOpenApiSchemas } from "../src/core/normalise.ts";
import { isObject } from "../src/core/guards.ts";

const OAS_31: { major: number; minor: number; patch: number } = {
    major: 3,
    minor: 1,
    patch: 0,
};

function componentsSchemas(
    doc: Record<string, unknown>
): Record<string, unknown> {
    const components = doc.components;
    if (!isObject(components)) throw new Error("expected components");
    const schemas = components.schemas;
    if (!isObject(schemas)) throw new Error("expected components.schemas");
    return schemas;
}

function schemaByName(
    doc: Record<string, unknown>,
    name: string
): Record<string, unknown> {
    const value = componentsSchemas(doc)[name];
    if (!isObject(value)) throw new Error(`expected schema named "${name}"`);
    return value;
}

describe("OpenAPI 3.1 jsonSchemaDialect routing — Draft 04", () => {
    it("rewrites boolean exclusiveMinimum/exclusiveMaximum to numbers", () => {
        const doc = {
            openapi: "3.1.0",
            jsonSchemaDialect: "http://json-schema.org/draft-04/schema#",
            info: { title: "T", version: "1" },
            paths: {},
            components: {
                schemas: {
                    Bound: {
                        type: "integer",
                        minimum: 5,
                        exclusiveMinimum: true,
                    },
                },
            },
        };
        const out = normaliseOpenApiSchemas(doc, OAS_31);
        const bound = schemaByName(out, "Bound");
        expect(bound.exclusiveMinimum).toBe(5);
        expect(bound.minimum).toBe(undefined);
    });

    it("translates tuple-form items to prefixItems", () => {
        const doc = {
            openapi: "3.1.0",
            jsonSchemaDialect: "http://json-schema.org/draft-04/schema#",
            info: { title: "T", version: "1" },
            paths: {},
            components: {
                schemas: {
                    Pair: {
                        type: "array",
                        items: [{ type: "string" }, { type: "number" }],
                    },
                },
            },
        };
        const out = normaliseOpenApiSchemas(doc, OAS_31);
        const pair = schemaByName(out, "Pair");
        const prefixItems = pair.prefixItems;
        if (!Array.isArray(prefixItems)) {
            expect.unreachable("expected prefixItems array");
            return;
        }
        expect(prefixItems.length).toBe(2);
    });

    it("rewrites bare id to $id", () => {
        const doc = {
            openapi: "3.1.0",
            jsonSchemaDialect: "http://json-schema.org/draft-04/schema#",
            info: { title: "T", version: "1" },
            paths: {},
            components: {
                schemas: {
                    Doc: {
                        id: "https://example.com/Doc",
                        type: "string",
                    },
                },
            },
        };
        const out = normaliseOpenApiSchemas(doc, OAS_31);
        const docNode = schemaByName(out, "Doc");
        expect(docNode.$id).toBe("https://example.com/Doc");
        expect(docNode.id).toBe(undefined);
    });
});

describe("OpenAPI 3.1 jsonSchemaDialect routing — Draft 07", () => {
    it("splits dependencies into dependentRequired and dependentSchemas", () => {
        const doc = {
            openapi: "3.1.0",
            jsonSchemaDialect: "http://json-schema.org/draft-07/schema#",
            info: { title: "T", version: "1" },
            paths: {},
            components: {
                schemas: {
                    Person: {
                        type: "object",
                        properties: {
                            name: { type: "string" },
                            email: { type: "string" },
                            phone: { type: "string" },
                        },
                        dependencies: {
                            email: ["phone"],
                            phone: { required: ["email"] },
                        },
                    },
                },
            },
        };
        const out = normaliseOpenApiSchemas(doc, OAS_31);
        const person = schemaByName(out, "Person");
        expect(person.dependencies).toBe(undefined);
        const depReq = person.dependentRequired;
        if (!isObject(depReq)) {
            expect.unreachable("expected dependentRequired");
            return;
        }
        expect(depReq.email).toStrictEqual(["phone"]);
        const depSchemas = person.dependentSchemas;
        if (!isObject(depSchemas)) {
            expect.unreachable("expected dependentSchemas");
            return;
        }
        expect(depSchemas.phone).toBeDefined();
    });

    it("translates tuple-form items + additionalItems to prefixItems + items", () => {
        const doc = {
            openapi: "3.1.0",
            jsonSchemaDialect: "http://json-schema.org/draft-07/schema#",
            info: { title: "T", version: "1" },
            paths: {},
            components: {
                schemas: {
                    Triple: {
                        type: "array",
                        items: [{ type: "string" }, { type: "number" }],
                        additionalItems: { type: "boolean" },
                    },
                },
            },
        };
        const out = normaliseOpenApiSchemas(doc, OAS_31);
        const triple = schemaByName(out, "Triple");
        const prefixItems = triple.prefixItems;
        if (!Array.isArray(prefixItems)) {
            expect.unreachable("expected prefixItems array");
            return;
        }
        expect(prefixItems.length).toBe(2);
        const rest = triple.items;
        if (!isObject(rest)) {
            expect.unreachable("expected rest items");
            return;
        }
        expect(rest.type).toBe("boolean");
        expect(triple.additionalItems).toBe(undefined);
    });
});

describe("OpenAPI 3.1 jsonSchemaDialect routing — Draft 2019-09", () => {
    it("rewrites $recursiveRef to $ref", () => {
        const doc = {
            openapi: "3.1.0",
            jsonSchemaDialect: "https://json-schema.org/draft/2019-09/schema",
            info: { title: "T", version: "1" },
            paths: {},
            components: {
                schemas: {
                    Tree: {
                        $recursiveAnchor: true,
                        type: "object",
                        properties: {
                            value: { type: "string" },
                            children: {
                                type: "array",
                                items: { $recursiveRef: "#" },
                            },
                        },
                    },
                },
            },
        };
        const out = normaliseOpenApiSchemas(doc, OAS_31);
        const tree = schemaByName(out, "Tree");
        const props = tree.properties;
        if (!isObject(props)) {
            expect.unreachable("expected properties");
            return;
        }
        const children = props.children;
        if (!isObject(children)) {
            expect.unreachable("expected children");
            return;
        }
        const items = children.items;
        if (!isObject(items)) {
            expect.unreachable("expected items");
            return;
        }
        expect(items.$ref).toBe("#");
        expect(items.$recursiveRef).toBe(undefined);
    });
});

describe("OpenAPI 3.1 jsonSchemaDialect routing — default", () => {
    it("keeps tuple-form items untouched when no dialect is declared (2020-12 default)", () => {
        // Under Draft 2020-12 `items` as an array is not legacy tuple
        // syntax — it is invalid input the walker ignores. The routing
        // path must not rewrite it.
        const doc = {
            openapi: "3.1.0",
            info: { title: "T", version: "1" },
            paths: {},
            components: {
                schemas: {
                    Pair: {
                        type: "array",
                        items: [{ type: "string" }, { type: "number" }],
                    },
                },
            },
        };
        const out = normaliseOpenApiSchemas(doc, OAS_31);
        const pair = schemaByName(out, "Pair");
        expect(pair.prefixItems).toBe(undefined);
        expect(Array.isArray(pair.items)).toBe(true);
    });

    it("keeps the 2020-12 pipeline when the declared dialect IS 2020-12", () => {
        const doc = {
            openapi: "3.1.0",
            jsonSchemaDialect: "https://json-schema.org/draft/2020-12/schema",
            info: { title: "T", version: "1" },
            paths: {},
            components: {
                schemas: {
                    Pair: {
                        type: "array",
                        items: [{ type: "string" }, { type: "number" }],
                    },
                },
            },
        };
        const out = normaliseOpenApiSchemas(doc, OAS_31);
        const pair = schemaByName(out, "Pair");
        expect(pair.prefixItems).toBe(undefined);
    });
});
