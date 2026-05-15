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
import {
    normaliseJsonSchema,
    normaliseOpenApiSchemas,
} from "../src/core/normalise.ts";
import {
    detectJsonSchemaDraft,
    detectOpenApiVersion,
} from "../src/core/version.ts";

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

describe("OpenAPI 3.0.x", () => {
    const openApi30Doc = {
        openapi: "3.0.3",
        info: { title: "Test API", version: "1.0.0" },
        paths: {
            "/users": {
                get: {
                    operationId: "listUsers",
                    responses: {
                        "200": {
                            description: "List of users",
                            content: {
                                "application/json": {
                                    schema: {
                                        type: "array",
                                        items: {
                                            $ref: "#/components/schemas/User",
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
        components: {
            schemas: {
                User: {
                    type: "object",
                    properties: {
                        id: { type: "string", readOnly: true },
                        name: { type: "string" },
                        email: { type: "string", nullable: true },
                        role: {
                            type: "string",
                            enum: ["admin", "user"],
                            nullable: true,
                        },
                    },
                    required: ["id", "name"],
                },
            },
        },
    } as Record<string, unknown>;

    it("detects OpenAPI 3.0.3", () => {
        const version = detectOpenApiVersion(openApi30Doc);
        expect(version).toStrictEqual({ major: 3, minor: 0, patch: 3 });
    });

    it("normalises nullable to anyOf [T, null]", () => {
        const version = detectOpenApiVersion(openApi30Doc);
        const normalised = normaliseOpenApiSchemas(
            openApi30Doc,
            assertDefined(version, "version")
        );

        // Check that the User schema's email has been normalised
        const userSchema = (normalised.components as Record<string, unknown>)
            .schemas as Record<string, unknown>;
        const user = userSchema.User as Record<string, unknown>;
        const properties = user.properties as Record<string, unknown>;
        const email = properties.email as Record<string, unknown>;

        // nullable should be removed and anyOf should be added
        expect("nullable" in email).toBe(false);
        expect(Array.isArray(email.anyOf)).toBe(true);
    });

    it("walks normalised OpenAPI 3.0 schema via adapter", () => {
        const result = normaliseSchema(
            openApi30Doc,
            "#/components/schemas/User"
        );
        const tree = walk(result.jsonSchema, {
            rootDocument: result.rootDocument,
        });

        expect(tree.type).toBe("object");

        const email = assertDefined(
            assertDefined(fieldsOf(tree), "fields").email,
            "email"
        );
        // After normalisation, nullable → anyOf [T, null] → walker detects nullable
        expect(email.type).toBe("string");
        expect(email.isNullable).toBe(true);
    });

    it("normalises nullable enum correctly", () => {
        const result = normaliseSchema(
            openApi30Doc,
            "#/components/schemas/User"
        );
        const tree = walk(result.jsonSchema, {
            rootDocument: result.rootDocument,
        });

        const role = assertDefined(
            assertDefined(fieldsOf(tree), "fields").role,
            "role"
        );
        expect(role.isNullable).toBe(true);
    });

    it("removes nullable: false without adding anyOf", () => {
        const doc = {
            openapi: "3.0.0",
            paths: {},
            components: {
                schemas: {
                    Item: {
                        type: "object",
                        properties: {
                            name: { type: "string", nullable: false },
                        },
                    },
                },
            },
        } as Record<string, unknown>;

        const version = detectOpenApiVersion(doc);
        const normalised = normaliseOpenApiSchemas(
            doc,
            assertDefined(version, "version")
        );
        const itemSchema = (normalised.components as Record<string, unknown>)
            .schemas as Record<string, unknown>;
        const item = itemSchema.Item as Record<string, unknown>;
        const properties = item.properties as Record<string, unknown>;
        const name = properties.name as Record<string, unknown>;

        expect("nullable" in name).toBe(false);
        expect("anyOf" in name).toBe(false);
        expect(name.type).toBe("string");
    });
});

// ---------------------------------------------------------------------------
// Swagger 2.0: full document normalisation
// ---------------------------------------------------------------------------

describe("Swagger 2.0", () => {
    const swagger2Doc = {
        swagger: "2.0",
        info: { title: "Pet Store", version: "1.0.0" },
        host: "petstore.example.com",
        basePath: "/v1",
        schemes: ["https"],
        paths: {
            "/pets": {
                get: {
                    operationId: "listPets",
                    parameters: [
                        {
                            name: "limit",
                            in: "query",
                            type: "integer",
                            minimum: 0,
                            maximum: 100,
                        },
                    ],
                    responses: {
                        "200": {
                            description: "A list of pets",
                            schema: {
                                type: "array",
                                items: {
                                    $ref: "#/definitions/Pet",
                                },
                            },
                        },
                    },
                },
                post: {
                    operationId: "createPet",
                    parameters: [
                        {
                            name: "body",
                            in: "body",
                            required: true,
                            schema: {
                                type: "object",
                                properties: {
                                    name: { type: "string" },
                                    tag: { type: "string" },
                                },
                                required: ["name"],
                            },
                        },
                    ],
                    responses: {
                        "201": {
                            description: "Created",
                            schema: {
                                $ref: "#/definitions/Pet",
                            },
                        },
                    },
                },
            },
            "/pets/{petId}": {
                get: {
                    operationId: "getPet",
                    parameters: [
                        {
                            name: "petId",
                            in: "path",
                            required: true,
                            type: "string",
                        },
                    ],
                    responses: {
                        "200": {
                            description: "A pet",
                            schema: {
                                $ref: "#/definitions/Pet",
                            },
                        },
                    },
                },
            },
        },
        definitions: {
            Pet: {
                type: "object",
                properties: {
                    id: { type: "string" },
                    name: { type: "string" },
                    status: {
                        type: "string",
                        enum: ["available", "sold"],
                    },
                },
                required: ["id", "name"],
            },
        },
    } as Record<string, unknown>;

    it("detects Swagger 2.0", () => {
        const version = detectOpenApiVersion(swagger2Doc);
        expect(version).toStrictEqual({ major: 2, minor: 0, patch: 0 });
    });

    it("normalises to OpenAPI 3.1.0 structure", () => {
        const version = detectOpenApiVersion(swagger2Doc);
        const normalised = normaliseOpenApiSchemas(
            swagger2Doc,
            assertDefined(version, "version")
        );

        expect(normalised.openapi).toBe("3.1.0");
        expect(isObject(normalised.info)).toBe(true);
    });

    it("converts host/basePath to servers", () => {
        const version = detectOpenApiVersion(swagger2Doc);
        const normalised = normaliseOpenApiSchemas(
            swagger2Doc,
            assertDefined(version, "version")
        );

        const servers = normalised.servers;
        expect(Array.isArray(servers)).toBe(true);
        const serverList = servers as Record<string, unknown>[];
        expect(serverList.length).toBeGreaterThan(0);
        expect(assertDefined(serverList[0], "server").url).toBe(
            "https://petstore.example.com/v1"
        );
    });

    it("moves definitions to components/schemas", () => {
        const version = detectOpenApiVersion(swagger2Doc);
        const normalised = normaliseOpenApiSchemas(
            swagger2Doc,
            assertDefined(version, "version")
        );

        const components = normalised.components as Record<string, unknown>;
        const schemas = components.schemas as Record<string, unknown>;
        expect("Pet" in schemas).toBe(true);
        const pet = schemas.Pet as Record<string, unknown>;
        expect(pet.type).toBe("object");
    });

    it("converts body parameter to requestBody", () => {
        const version = detectOpenApiVersion(swagger2Doc);
        const normalised = normaliseOpenApiSchemas(
            swagger2Doc,
            assertDefined(version, "version")
        );

        const paths = normalised.paths as Record<string, unknown>;
        const pets = paths["/pets"] as Record<string, unknown>;
        const post = pets.post as Record<string, unknown>;

        expect(isObject(post.requestBody)).toBe(true);
        const requestBody = post.requestBody as Record<string, unknown>;
        expect(requestBody.required).toBe(true);
        expect(isObject(requestBody.content)).toBe(true);
    });

    it("converts query parameters to OpenAPI 3.x format", () => {
        const version = detectOpenApiVersion(swagger2Doc);
        const normalised = normaliseOpenApiSchemas(
            swagger2Doc,
            assertDefined(version, "version")
        );

        const paths = normalised.paths as Record<string, unknown>;
        const pets = paths["/pets"] as Record<string, unknown>;
        const get = pets.get as Record<string, unknown>;

        const parameters = get.parameters as Record<string, unknown>[];
        expect(parameters.length).toBe(1);
        const limit = assertDefined(parameters[0], "limit");
        expect(limit.name).toBe("limit");
        expect(limit.in).toBe("query");
        // Swagger type/format should be wrapped in schema
        expect(isObject(limit.schema)).toBe(true);
        const schema = limit.schema as Record<string, unknown>;
        expect(schema.type).toBe("integer");
    });

    it("wraps response schemas in content", () => {
        const version = detectOpenApiVersion(swagger2Doc);
        const normalised = normaliseOpenApiSchemas(
            swagger2Doc,
            assertDefined(version, "version")
        );

        const paths = normalised.paths as Record<string, unknown>;
        const pets = paths["/pets"] as Record<string, unknown>;
        const get = pets.get as Record<string, unknown>;
        const responses = get.responses as Record<string, unknown>;
        const ok = responses["200"] as Record<string, unknown>;

        expect(isObject(ok.content)).toBe(true);
        const content = ok.content as Record<string, unknown>;
        const json = content["application/json"] as Record<string, unknown>;
        expect(isObject(json.schema)).toBe(true);
    });

    it("converts path parameters correctly", () => {
        const version = detectOpenApiVersion(swagger2Doc);
        const normalised = normaliseOpenApiSchemas(
            swagger2Doc,
            assertDefined(version, "version")
        );

        const paths = normalised.paths as Record<string, unknown>;
        const petsId = paths["/pets/{petId}"] as Record<string, unknown>;
        const get = petsId.get as Record<string, unknown>;
        const parameters = get.parameters as Record<string, unknown>[];

        expect(parameters.length).toBe(1);
        const petId = assertDefined(parameters[0], "petId");
        expect(petId.name).toBe("petId");
        expect(petId.in).toBe("path");
        expect(petId.required).toBe(true);
    });

    it("walks Pet schema from normalised Swagger 2.0 document", () => {
        const result = normaliseSchema(swagger2Doc, "#/components/schemas/Pet");
        const tree = walk(result.jsonSchema, {
            rootDocument: result.rootDocument,
        });

        expect(tree.type).toBe("object");
        const fields = assertDefined(fieldsOf(tree), "fields");
        expect(assertDefined(fields.id, "id").type).toBe("string");
        expect(assertDefined(fields.name, "name").type).toBe("string");

        const status = assertDefined(fields.status, "status");
        expect(status.type).toBe("enum");
        expect(enumValuesOf(status)).toStrictEqual(["available", "sold"]);
    });
});

// ---------------------------------------------------------------------------
// Utility: type guard helper used in tests
// ---------------------------------------------------------------------------

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
