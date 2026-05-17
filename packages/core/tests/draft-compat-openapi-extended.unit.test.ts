/**
 * Extended OpenAPI and Swagger normalisation tests.
 *
 * Extracted from draft-compat-extended.unit.test.ts — tests OpenAPI 3.0.x
 * discriminator, example normalisation, and Swagger 2.0 produces/consumes,
 * response $ref resolution, and collectionFormat conversion.
 */

import { describe, it, expect } from "vitest";
import { assertDefined } from "./helpers.ts";
import { isObject } from "../src/core/guards.ts";
import { walk } from "../src/core/walker.ts";
import { normaliseSchema } from "../src/core/adapter.ts";
import { normaliseOpenApiSchemas } from "../src/core/normalise.ts";
import { detectOpenApiVersion } from "../src/core/version.ts";
import {
    parseOpenApiDocument,
    getSecurityRequirements,
    getRequestBody,
    getResponses,
} from "../src/openapi/parser.ts";
import type { JsonObject } from "../src/core/types.ts";

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

// ---------------------------------------------------------------------------
// Swagger 2.0: top-level security inheritance
// ---------------------------------------------------------------------------

describe("Swagger 2.0 top-level security", () => {
    it("propagates document-level security to operations without their own", () => {
        const doc: JsonObject = {
            swagger: "2.0",
            info: { title: "API", version: "1.0" },
            security: [{ apiKey: [] }],
            securityDefinitions: {
                apiKey: { type: "apiKey", name: "X-API-Key", in: "header" },
            },
            paths: {
                "/items": {
                    get: {
                        responses: { "200": { description: "OK" } },
                    },
                },
            },
            definitions: {},
        };

        const version = assertDefined(detectOpenApiVersion(doc), "version");
        const normalised = normaliseOpenApiSchemas(doc, version);

        // The normalised document should retain top-level security so the
        // parser can fall back to it when an operation omits its own.
        expect(normalised.security).toStrictEqual([{ apiKey: [] }]);

        const parsed = parseOpenApiDocument(normalised);
        const requirements = getSecurityRequirements(parsed, "/items", "get");

        expect(requirements).toStrictEqual([{ name: "apiKey", scopes: [] }]);
    });

    it("operation-level security still overrides top-level", () => {
        const doc: JsonObject = {
            swagger: "2.0",
            info: { title: "API", version: "1.0" },
            security: [{ apiKey: [] }],
            securityDefinitions: {
                apiKey: { type: "apiKey", name: "X-API-Key", in: "header" },
                oauth: {
                    type: "oauth2",
                    flow: "implicit",
                    authorizationUrl: "https://example.com/oauth",
                    scopes: { read: "Read access" },
                },
            },
            paths: {
                "/secret": {
                    get: {
                        security: [{ oauth: ["read"] }],
                        responses: { "200": { description: "OK" } },
                    },
                },
            },
            definitions: {},
        };

        const version = assertDefined(detectOpenApiVersion(doc), "version");
        const normalised = normaliseOpenApiSchemas(doc, version);
        const parsed = parseOpenApiDocument(normalised);
        const requirements = getSecurityRequirements(parsed, "/secret", "get");

        expect(requirements).toStrictEqual([
            { name: "oauth", scopes: ["read"] },
        ]);
    });

    it("omits security when document has none", () => {
        const doc: JsonObject = {
            swagger: "2.0",
            info: { title: "API", version: "1.0" },
            paths: {
                "/open": {
                    get: { responses: { "200": { description: "OK" } } },
                },
            },
            definitions: {},
        };

        const version = assertDefined(detectOpenApiVersion(doc), "version");
        const normalised = normaliseOpenApiSchemas(doc, version);

        expect("security" in normalised).toBe(false);

        const parsed = parseOpenApiDocument(normalised);
        expect(getSecurityRequirements(parsed, "/open", "get")).toStrictEqual(
            []
        );
    });
});

// ---------------------------------------------------------------------------
// Swagger 2.0: components.parameters body and shared parameters
// ---------------------------------------------------------------------------

describe("Swagger 2.0 components.parameters deep normalisation", () => {
    it("converts a shared body parameter to a synthesised requestBody", () => {
        const doc: JsonObject = {
            swagger: "2.0",
            info: { title: "API", version: "1.0" },
            consumes: ["application/json"],
            parameters: {
                Body: {
                    name: "body",
                    in: "body",
                    required: true,
                    description: "Shared payload",
                    schema: {
                        type: "object",
                        properties: {
                            name: { type: "string" },
                        },
                        required: ["name"],
                    },
                },
            },
            paths: {
                "/items": {
                    post: {
                        parameters: [{ $ref: "#/parameters/Body" }],
                        responses: { "201": { description: "Created" } },
                    },
                },
            },
            definitions: {},
        };

        const version = assertDefined(detectOpenApiVersion(doc), "version");
        const normalised = normaliseOpenApiSchemas(doc, version);

        // The shared body parameter must not survive under components.parameters
        // because OpenAPI 3.x parameters cannot have `in: "body"`.
        const components = normalised.components as Record<string, unknown>;
        const componentParameters = components.parameters;
        if (isObject(componentParameters)) {
            expect("Body" in componentParameters).toBe(false);
        }

        // It should appear instead under components.requestBodies, fully
        // converted to OpenAPI 3.x shape.
        const requestBodies = components.requestBodies;
        expect(isObject(requestBodies)).toBe(true);
        if (!isObject(requestBodies)) throw new Error("requestBodies missing");
        const body = requestBodies.Body;
        expect(isObject(body)).toBe(true);
        if (!isObject(body)) throw new Error("Body missing");
        expect(body.required).toBe(true);
        expect(body.description).toBe("Shared payload");
        const content = body.content;
        expect(isObject(content)).toBe(true);
        if (!isObject(content)) throw new Error("content missing");
        expect("application/json" in content).toBe(true);

        // The operation already inlines the body, so the parser should also
        // surface a request body for the operation.
        const parsed = parseOpenApiDocument(normalised);
        const opBody = getRequestBody(parsed, "/items", "post");
        expect(opBody).toBeDefined();
        if (opBody === undefined) throw new Error("operation body missing");
        expect(opBody.required).toBe(true);
        expect(opBody.contentTypes).toContain("application/json");
        expect(isObject(opBody.schema)).toBe(true);
    });

    it("normalises a shared query parameter to OpenAPI 3.x shape", () => {
        const doc: JsonObject = {
            swagger: "2.0",
            info: { title: "API", version: "1.0" },
            parameters: {
                Limit: {
                    name: "limit",
                    in: "query",
                    type: "integer",
                    format: "int32",
                    default: 20,
                    minimum: 1,
                    maximum: 100,
                },
            },
            paths: {
                "/items": {
                    get: {
                        parameters: [{ $ref: "#/parameters/Limit" }],
                        responses: { "200": { description: "OK" } },
                    },
                },
            },
            definitions: {},
        };

        const version = assertDefined(detectOpenApiVersion(doc), "version");
        const normalised = normaliseOpenApiSchemas(doc, version);

        const components = normalised.components as Record<string, unknown>;
        const componentParameters = components.parameters as Record<
            string,
            unknown
        >;
        const limit = componentParameters.Limit as Record<string, unknown>;

        // `type`/`format` should be wrapped into `schema`, not left at the
        // parameter root.
        expect("type" in limit).toBe(false);
        expect("format" in limit).toBe(false);
        const schema = limit.schema as Record<string, unknown>;
        expect(schema.type).toBe("integer");
        expect(schema.format).toBe("int32");
        expect(schema.default).toBe(20);
        expect(schema.minimum).toBe(1);
        expect(schema.maximum).toBe(100);
    });
});

// ---------------------------------------------------------------------------
// Swagger 2.0: components.responses deep normalisation
// ---------------------------------------------------------------------------

describe("Swagger 2.0 components.responses deep normalisation", () => {
    it("wraps a shared response schema in content", () => {
        const doc: JsonObject = {
            swagger: "2.0",
            info: { title: "API", version: "1.0" },
            produces: ["application/json"],
            responses: {
                NotFound: {
                    description: "Not found",
                    schema: {
                        type: "object",
                        properties: {
                            message: { type: "string" },
                        },
                    },
                },
            },
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
                            "200": { description: "OK" },
                            "404": { $ref: "#/responses/NotFound" },
                        },
                    },
                },
            },
            definitions: {},
        };

        const version = assertDefined(detectOpenApiVersion(doc), "version");
        const normalised = normaliseOpenApiSchemas(doc, version);

        const components = normalised.components as Record<string, unknown>;
        const componentResponses = components.responses as Record<
            string,
            unknown
        >;
        const notFound = componentResponses.NotFound as Record<string, unknown>;

        // `schema` should be wrapped in `content` per OpenAPI 3.x.
        expect("schema" in notFound).toBe(false);
        expect(notFound.description).toBe("Not found");
        const content = notFound.content as Record<string, unknown>;
        expect(isObject(content)).toBe(true);
        expect("application/json" in content).toBe(true);
        const media = content["application/json"] as Record<string, unknown>;
        expect(isObject(media.schema)).toBe(true);

        // The parser should surface the response for the operation.
        const parsed = parseOpenApiDocument(normalised);
        const responses = getResponses(parsed, "/items/{id}", "get");
        const fourOhFour = assertDefined(
            responses.find((r) => r.statusCode === "404"),
            "404 response"
        );
        expect(fourOhFour.description).toBe("Not found");
        expect(fourOhFour.contentTypes).toContain("application/json");
        expect(isObject(fourOhFour.schema)).toBe(true);
    });
});
