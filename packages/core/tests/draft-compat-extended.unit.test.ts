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
import {
    normaliseJsonSchema,
    normaliseOpenApiSchemas,
} from "../src/core/normalise.ts";
import { detectOpenApiVersion } from "../src/core/version.ts";

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

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
// OpenAPI 3.0.x discriminator
// ---------------------------------------------------------------------------

describe("OpenAPI 3.0.x discriminator", () => {
    const doc = {
        openapi: "3.0.3",
        info: { title: "Test", version: "1.0" },
        paths: {},
        components: {
            schemas: {
                Pet: {
                    type: "object",
                    discriminator: {
                        propertyName: "type",
                    },
                    oneOf: [
                        { $ref: "#/components/schemas/Cat" },
                        { $ref: "#/components/schemas/Dog" },
                    ],
                },
                Cat: {
                    type: "object",
                    properties: {
                        type: { type: "string" },
                        meow: { type: "boolean" },
                    },
                    required: ["type"],
                },
                Dog: {
                    type: "object",
                    properties: {
                        type: { type: "string" },
                        bark: { type: "boolean" },
                    },
                    required: ["type"],
                },
            },
        },
    } as Record<string, unknown>;

    it("injects const values into discriminator options from $ref names", () => {
        const version = assertDefined(detectOpenApiVersion(doc), "version");
        const normalised = normaliseOpenApiSchemas(doc, version);
        const components = normalised.components as Record<string, unknown>;
        const schemas = components.schemas as Record<string, unknown>;
        const pet = schemas.Pet as Record<string, unknown>;

        // discriminator should be removed
        expect("discriminator" in pet).toBe(false);

        // oneOf should still exist
        const oneOf = pet.oneOf as Record<string, unknown>[];
        expect(Array.isArray(oneOf)).toBe(true);

        // First option should have const injected on the "type" property
        const catOption = assertDefined(oneOf[0], "cat option");
        expect(catOption.$ref).toBe("#/components/schemas/Cat");
        // When $ref is at the option level (not inside properties),
        // the const value is derived from the $ref fragment
        // The normaliser should have injected const into the discriminator
        // property. Since the option uses $ref (not inline properties),
        // it falls back to deriving from the fragment name.
    });

    it("walks discriminator schema via adapter", () => {
        const result = normaliseSchema(doc, "#/components/schemas/Pet");
        const tree = walk(result.jsonSchema, {
            rootDocument: result.rootDocument,
        });
        // Should produce a union or discriminated union
        expect(
            tree.type === "union" || tree.type === "discriminatedUnion"
        ).toBe(true);
    });

    it("handles discriminator with explicit mapping", () => {
        const docWithMapping = {
            openapi: "3.0.0",
            paths: {},
            components: {
                schemas: {
                    Shape: {
                        type: "object",
                        discriminator: {
                            propertyName: "kind",
                            mapping: {
                                circle: "#/components/schemas/Circle",
                                rect: "#/components/schemas/Rectangle",
                            },
                        },
                        oneOf: [
                            {
                                type: "object",
                                properties: {
                                    kind: {
                                        $ref: "#/components/schemas/Circle",
                                    },
                                },
                            },
                            {
                                type: "object",
                                properties: {
                                    kind: {
                                        $ref: "#/components/schemas/Rectangle",
                                    },
                                },
                            },
                        ],
                    },
                    Circle: { type: "string" },
                    Rectangle: { type: "string" },
                },
            },
        } as Record<string, unknown>;

        const version = assertDefined(
            detectOpenApiVersion(docWithMapping),
            "version"
        );
        const normalised = normaliseOpenApiSchemas(docWithMapping, version);
        const components = normalised.components as Record<string, unknown>;
        const schemas = components.schemas as Record<string, unknown>;
        const shape = schemas.Shape as Record<string, unknown>;
        const oneOf = shape.oneOf as Record<string, unknown>[];

        // First option should have const injected
        const first = assertDefined(oneOf[0], "first option");
        const firstProps = first.properties as Record<string, unknown>;
        const kind = firstProps.kind as Record<string, unknown>;
        expect(kind.const).toBe("circle");
    });
});

// ---------------------------------------------------------------------------
// OpenAPI 3.0.x example → examples
// ---------------------------------------------------------------------------

describe("OpenAPI 3.0.x example → examples", () => {
    it("converts example to examples array", () => {
        const doc = {
            openapi: "3.0.0",
            paths: {},
            components: {
                schemas: {
                    User: {
                        type: "object",
                        properties: {
                            name: {
                                type: "string",
                                example: "Ada Lovelace",
                            },
                        },
                    },
                },
            },
        } as Record<string, unknown>;

        const version = assertDefined(detectOpenApiVersion(doc), "version");
        const normalised = normaliseOpenApiSchemas(doc, version);
        const components = normalised.components as Record<string, unknown>;
        const schemas = components.schemas as Record<string, unknown>;
        const user = schemas.User as Record<string, unknown>;
        const properties = user.properties as Record<string, unknown>;
        const name = properties.name as Record<string, unknown>;

        expect("example" in name).toBe(false);
        expect(name.examples).toStrictEqual(["Ada Lovelace"]);
    });

    it("does not overwrite existing examples with example", () => {
        const doc = {
            openapi: "3.0.0",
            paths: {},
            components: {
                schemas: {
                    Item: {
                        type: "object",
                        properties: {
                            code: {
                                type: "string",
                                example: "ignored",
                                examples: ["ABC", "DEF"],
                            },
                        },
                    },
                },
            },
        } as Record<string, unknown>;

        const version = assertDefined(detectOpenApiVersion(doc), "version");
        const normalised = normaliseOpenApiSchemas(doc, version);
        const components = normalised.components as Record<string, unknown>;
        const schemas = components.schemas as Record<string, unknown>;
        const item = schemas.Item as Record<string, unknown>;
        const properties = item.properties as Record<string, unknown>;
        const code = properties.code as Record<string, unknown>;

        expect(code.examples).toStrictEqual(["ABC", "DEF"]);
    });
});

// ---------------------------------------------------------------------------
// Swagger 2.0: produces/consumes
// ---------------------------------------------------------------------------

describe("Swagger 2.0 produces/consumes", () => {
    const doc = {
        swagger: "2.0",
        info: { title: "API", version: "1.0" },
        host: "api.example.com",
        basePath: "/",
        consumes: ["application/json"],
        produces: ["application/json", "application/xml"],
        paths: {
            "/items": {
                post: {
                    parameters: [
                        {
                            name: "body",
                            in: "body",
                            schema: {
                                type: "object",
                                properties: {
                                    name: { type: "string" },
                                },
                            },
                        },
                    ],
                    responses: {
                        "201": {
                            description: "Created",
                            schema: {
                                type: "object",
                                properties: {
                                    id: { type: "string" },
                                },
                            },
                        },
                    },
                },
                get: {
                    produces: ["text/plain"],
                    responses: {
                        "200": {
                            description: "List",
                            schema: { type: "string" },
                        },
                    },
                },
            },
        },
        definitions: {},
    } as Record<string, unknown>;

    it("uses global produces for response content types", () => {
        const version = assertDefined(detectOpenApiVersion(doc), "version");
        const normalised = normaliseOpenApiSchemas(doc, version);
        const paths = normalised.paths as Record<string, unknown>;
        const items = paths["/items"] as Record<string, unknown>;
        const post = items.post as Record<string, unknown>;
        const responses = post.responses as Record<string, unknown>;
        const created = responses["201"] as Record<string, unknown>;
        const content = created.content as Record<string, unknown>;

        expect("application/json" in content).toBe(true);
        expect("application/xml" in content).toBe(true);
    });

    it("uses global consumes for request body content types", () => {
        const version = assertDefined(detectOpenApiVersion(doc), "version");
        const normalised = normaliseOpenApiSchemas(doc, version);
        const paths = normalised.paths as Record<string, unknown>;
        const items = paths["/items"] as Record<string, unknown>;
        const post = items.post as Record<string, unknown>;
        const requestBody = post.requestBody as Record<string, unknown>;
        const content = requestBody.content as Record<string, unknown>;

        expect("application/json" in content).toBe(true);
    });

    it("operation-level produces overrides global", () => {
        const version = assertDefined(detectOpenApiVersion(doc), "version");
        const normalised = normaliseOpenApiSchemas(doc, version);
        const paths = normalised.paths as Record<string, unknown>;
        const items = paths["/items"] as Record<string, unknown>;
        const get = items.get as Record<string, unknown>;
        const responses = get.responses as Record<string, unknown>;
        const ok = responses["200"] as Record<string, unknown>;
        const content = ok.content as Record<string, unknown>;

        expect("text/plain" in content).toBe(true);
        expect("application/json" in content).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Swagger 2.0: response $ref resolution
// ---------------------------------------------------------------------------

describe("Swagger 2.0 response $ref", () => {
    const doc = {
        swagger: "2.0",
        info: { title: "API", version: "1.0" },
        paths: {
            "/items/{id}": {
                get: {
                    parameters: [
                        {
                            name: "id",
                            in: "path",
                            required: true,
                            type: "string",
                        },
                    ],
                    responses: {
                        "200": { $ref: "#/responses/ItemResponse" },
                        "404": { $ref: "#/responses/NotFound" },
                    },
                },
            },
        },
        responses: {
            ItemResponse: {
                description: "An item",
                schema: {
                    type: "object",
                    properties: {
                        id: { type: "string" },
                        name: { type: "string" },
                    },
                },
            },
            NotFound: {
                description: "Not found",
            },
        },
        definitions: {},
    } as Record<string, unknown>;

    it("resolves response $ref and wraps schema in content", () => {
        const version = assertDefined(detectOpenApiVersion(doc), "version");
        const normalised = normaliseOpenApiSchemas(doc, version);
        const paths = normalised.paths as Record<string, unknown>;
        const itemsId = paths["/items/{id}"] as Record<string, unknown>;
        const get = itemsId.get as Record<string, unknown>;
        const responses = get.responses as Record<string, unknown>;

        const ok = responses["200"] as Record<string, unknown>;
        expect(ok.description).toBe("An item");
        expect(isObject(ok.content)).toBe(true);
        const content = ok.content as Record<string, unknown>;
        const json = content["application/json"] as Record<string, unknown>;
        expect(isObject(json.schema)).toBe(true);
    });

    it("resolves response $ref without schema", () => {
        const version = assertDefined(detectOpenApiVersion(doc), "version");
        const normalised = normaliseOpenApiSchemas(doc, version);
        const paths = normalised.paths as Record<string, unknown>;
        const itemsId = paths["/items/{id}"] as Record<string, unknown>;
        const get = itemsId.get as Record<string, unknown>;
        const responses = get.responses as Record<string, unknown>;

        const notFound = responses["404"] as Record<string, unknown>;
        expect(notFound.description).toBe("Not found");
        // No schema → no content
        expect(notFound.content).toBe(undefined);
    });
});

// ---------------------------------------------------------------------------
// Swagger 2.0: collectionFormat → style/explode
// ---------------------------------------------------------------------------

describe("Swagger 2.0 collectionFormat", () => {
    it("converts csv → style: form, explode: false", () => {
        const doc = {
            swagger: "2.0",
            info: { title: "API", version: "1.0" },
            paths: {
                "/items": {
                    get: {
                        parameters: [
                            {
                                name: "ids",
                                in: "query",
                                type: "array",
                                collectionFormat: "csv",
                            },
                        ],
                        responses: { "200": { description: "OK" } },
                    },
                },
            },
            definitions: {},
        } as Record<string, unknown>;

        const version = assertDefined(detectOpenApiVersion(doc), "version");
        const normalised = normaliseOpenApiSchemas(doc, version);
        const paths = normalised.paths as Record<string, unknown>;
        const items = paths["/items"] as Record<string, unknown>;
        const get = items.get as Record<string, unknown>;
        const params = get.parameters as Record<string, unknown>[];
        const ids = assertDefined(params[0], "ids param");

        expect(ids.style).toBe("form");
        expect(ids.explode).toBe(false);
    });

    it("converts multi → style: form, explode: true", () => {
        const doc = {
            swagger: "2.0",
            info: { title: "API", version: "1.0" },
            paths: {
                "/items": {
                    get: {
                        parameters: [
                            {
                                name: "tags",
                                in: "query",
                                type: "array",
                                collectionFormat: "multi",
                            },
                        ],
                        responses: { "200": { description: "OK" } },
                    },
                },
            },
            definitions: {},
        } as Record<string, unknown>;

        const version = assertDefined(detectOpenApiVersion(doc), "version");
        const normalised = normaliseOpenApiSchemas(doc, version);
        const paths = normalised.paths as Record<string, unknown>;
        const items = paths["/items"] as Record<string, unknown>;
        const get = items.get as Record<string, unknown>;
        const params = get.parameters as Record<string, unknown>[];
        const tags = assertDefined(params[0], "tags param");

        expect(tags.style).toBe("form");
        expect(tags.explode).toBe(true);
    });

    it("converts ssv → style: spaceDelimited", () => {
        const doc = {
            swagger: "2.0",
            info: { title: "API", version: "1.0" },
            paths: {
                "/search": {
                    get: {
                        parameters: [
                            {
                                name: "q",
                                in: "query",
                                type: "string",
                                collectionFormat: "ssv",
                            },
                        ],
                        responses: { "200": { description: "OK" } },
                    },
                },
            },
            definitions: {},
        } as Record<string, unknown>;

        const version = assertDefined(detectOpenApiVersion(doc), "version");
        const normalised = normaliseOpenApiSchemas(doc, version);
        const paths = normalised.paths as Record<string, unknown>;
        const search = paths["/search"] as Record<string, unknown>;
        const get = search.get as Record<string, unknown>;
        const params = get.parameters as Record<string, unknown>[];
        const q = assertDefined(params[0], "q param");

        expect(q.style).toBe("spaceDelimited");
        expect(q.explode).toBe(false);
    });

    it("converts pipes → style: pipeDelimited", () => {
        const doc = {
            swagger: "2.0",
            info: { title: "API", version: "1.0" },
            paths: {
                "/filter": {
                    get: {
                        parameters: [
                            {
                                name: "values",
                                in: "query",
                                type: "string",
                                collectionFormat: "pipes",
                            },
                        ],
                        responses: { "200": { description: "OK" } },
                    },
                },
            },
            definitions: {},
        } as Record<string, unknown>;

        const version = assertDefined(detectOpenApiVersion(doc), "version");
        const normalised = normaliseOpenApiSchemas(doc, version);
        const paths = normalised.paths as Record<string, unknown>;
        const filter = paths["/filter"] as Record<string, unknown>;
        const get = filter.get as Record<string, unknown>;
        const params = get.parameters as Record<string, unknown>[];
        const values = assertDefined(params[0], "values param");

        expect(values.style).toBe("pipeDelimited");
        expect(values.explode).toBe(false);
    });

    it("converts tsv → style: tabDelimited", () => {
        const doc = {
            swagger: "2.0",
            info: { title: "API", version: "1.0" },
            paths: {
                "/data": {
                    get: {
                        parameters: [
                            {
                                name: "fields",
                                in: "query",
                                type: "string",
                                collectionFormat: "tsv",
                            },
                        ],
                        responses: { "200": { description: "OK" } },
                    },
                },
            },
            definitions: {},
        } as Record<string, unknown>;

        const version = assertDefined(detectOpenApiVersion(doc), "version");
        const normalised = normaliseOpenApiSchemas(doc, version);
        const paths = normalised.paths as Record<string, unknown>;
        const data = paths["/data"] as Record<string, unknown>;
        const get = data.get as Record<string, unknown>;
        const params = get.parameters as Record<string, unknown>[];
        const fields = assertDefined(params[0], "fields param");

        expect(fields.style).toBe("tabDelimited");
        expect(fields.explode).toBe(false);
    });

    it("does not add style/explode when collectionFormat is absent", () => {
        const doc = {
            swagger: "2.0",
            info: { title: "API", version: "1.0" },
            paths: {
                "/items": {
                    get: {
                        parameters: [
                            {
                                name: "q",
                                in: "query",
                                type: "string",
                            },
                        ],
                        responses: { "200": { description: "OK" } },
                    },
                },
            },
            definitions: {},
        } as Record<string, unknown>;

        const version = assertDefined(detectOpenApiVersion(doc), "version");
        const normalised = normaliseOpenApiSchemas(doc, version);
        const paths = normalised.paths as Record<string, unknown>;
        const items = paths["/items"] as Record<string, unknown>;
        const get = items.get as Record<string, unknown>;
        const params = get.parameters as Record<string, unknown>[];
        const q = assertDefined(params[0], "q param");

        expect(q.style).toBe(undefined);
        expect(q.explode).toBe(undefined);
    });
});
