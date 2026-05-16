/**
 * OpenAPI 3.0.x and Swagger 2.0 normalisation + walk tests.
 *
 * Extracted from draft-compat.unit.test.ts — tests OpenAPI nullable,
 * discriminator, example normalisation and Swagger 2.0 document restructure.
 */

import { describe, it, expect } from "vitest";
import { assertDefined, fieldsOf, enumValuesOf } from "./helpers.ts";
import { walk } from "../src/core/walker.ts";
import { normaliseSchema } from "../src/core/adapter.ts";
import { normaliseOpenApiSchemas } from "../src/core/normalise.ts";
import { detectOpenApiVersion } from "../src/core/version.ts";

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
