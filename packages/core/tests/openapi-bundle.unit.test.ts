/**
 * Unit tests for OpenAPI document bundler.
 *
 * Verifies that external $ref targets are inlined and the resulting
 * document is self-contained.
 */

import { describe, it, expect } from "vitest";
import { bundleOpenApiDoc } from "../src/openapi/bundle.ts";
import type { BundleResolver } from "../src/openapi/bundle.ts";
import { walk } from "../src/core/walker.ts";
import { isObject } from "../src/core/guards.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMemoryResolver(
    docs: Record<string, Record<string, unknown>>
): BundleResolver {
    return (uri: string) => {
        const doc = docs[uri];
        if (doc === undefined) {
            throw new Error(`Document not found: ${uri}`);
        }
        return doc;
    };
}

/** Navigate into a document by a chain of keys. Returns undefined if any step fails. */
function navigate(
    root: unknown,
    ...keys: string[]
): Record<string, unknown> | undefined {
    let current: unknown = root;
    for (const key of keys) {
        if (!isObject(current)) return undefined;
        current = current[key];
    }
    return isObject(current) ? current : undefined;
}

// ---------------------------------------------------------------------------
// Bundle tests
// ---------------------------------------------------------------------------

describe("bundleOpenApiDoc", () => {
    it("inlines external $ref targets", async () => {
        const externalSchemas = {
            "https://api.example.com/schemas/Pet.json": {
                type: "object",
                properties: {
                    name: { type: "string" },
                    age: { type: "integer" },
                },
                required: ["name"],
            },
        };

        const resolver = createMemoryResolver(externalSchemas);

        const doc = {
            openapi: "3.1.0",
            info: { title: "Test", version: "1.0" },
            paths: {
                "/pets": {
                    get: {
                        responses: {
                            "200": {
                                content: {
                                    "application/json": {
                                        schema: {
                                            $ref: "https://api.example.com/schemas/Pet.json#",
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        };

        const bundled = await bundleOpenApiDoc(doc, resolver);

        const schema = navigate(
            bundled,
            "paths",
            "/pets",
            "get",
            "responses",
            "200",
            "content",
            "application/json",
            "schema"
        );

        expect(schema).toBeDefined();
        if (schema === undefined) return;
        // External ref is rewritten to an internal ref into components.schemas.
        expect(typeof schema.$ref).toBe("string");
        expect(schema.$ref).toMatch(/^#\/components\/schemas\//);

        // The resolved target lives in components.schemas under a synthesised name.
        const schemas = navigate(bundled, "components", "schemas");
        expect(schemas).toBeDefined();
        if (schemas === undefined) return;
        const pet = schemas.Pet;
        expect(isObject(pet)).toBe(true);
        if (!isObject(pet)) return;
        expect(pet.type).toBe("object");
        expect(pet.properties).toBeDefined();
        expect(schema.$ref).toBe("#/components/schemas/Pet");
    });

    it("handles multiple external refs to the same document", async () => {
        const externalDoc = {
            components: {
                schemas: {
                    Pet: {
                        type: "object",
                        properties: {
                            name: { type: "string" },
                        },
                    },
                    Owner: {
                        type: "object",
                        properties: {
                            email: { type: "string" },
                        },
                    },
                },
            },
        };

        const resolver = createMemoryResolver({
            "https://api.example.com/schemas.json": externalDoc,
        });

        const doc = {
            openapi: "3.1.0",
            info: { title: "Test", version: "1.0" },
            paths: {
                "/pets": {
                    get: {
                        responses: {
                            "200": {
                                content: {
                                    "application/json": {
                                        schema: {
                                            $ref: "https://api.example.com/schemas.json#/components/schemas/Pet",
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
                "/owners": {
                    get: {
                        responses: {
                            "200": {
                                content: {
                                    "application/json": {
                                        schema: {
                                            $ref: "https://api.example.com/schemas.json#/components/schemas/Owner",
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        };

        const bundled = await bundleOpenApiDoc(doc, resolver);

        const petSchema = navigate(
            bundled,
            "paths",
            "/pets",
            "get",
            "responses",
            "200",
            "content",
            "application/json",
            "schema"
        );
        const ownerSchema = navigate(
            bundled,
            "paths",
            "/owners",
            "get",
            "responses",
            "200",
            "content",
            "application/json",
            "schema"
        );

        expect(petSchema).toBeDefined();
        expect(ownerSchema).toBeDefined();
        if (petSchema === undefined || ownerSchema === undefined) return;
        expect(petSchema.$ref).toBe("#/components/schemas/Pet");
        expect(ownerSchema.$ref).toBe("#/components/schemas/Owner");

        const schemas = navigate(bundled, "components", "schemas");
        expect(schemas).toBeDefined();
        if (schemas === undefined) return;
        const pet = schemas.Pet;
        const owner = schemas.Owner;
        expect(isObject(pet)).toBe(true);
        expect(isObject(owner)).toBe(true);
        if (!isObject(pet) || !isObject(owner)) return;
        expect(pet.type).toBe("object");
        expect(pet.properties).toBeDefined();
        expect(owner.type).toBe("object");
        expect(owner.properties).toBeDefined();
    });

    it("does not mutate the original document", async () => {
        const resolver = createMemoryResolver({
            "https://example.com/Schema.json": {
                type: "string",
            },
        });

        const doc = {
            openapi: "3.1.0",
            info: { title: "Test", version: "1.0" },
            paths: {
                "/test": {
                    get: {
                        responses: {
                            "200": {
                                content: {
                                    "application/json": {
                                        schema: {
                                            $ref: "https://example.com/Schema.json#",
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        };

        const originalRef = navigate(
            doc,
            "paths",
            "/test",
            "get",
            "responses",
            "200",
            "content",
            "application/json",
            "schema"
        )?.$ref;

        await bundleOpenApiDoc(doc, resolver);

        const afterRef = navigate(
            doc,
            "paths",
            "/test",
            "get",
            "responses",
            "200",
            "content",
            "application/json",
            "schema"
        )?.$ref;

        expect(afterRef).toBe(originalRef);
    });

    it("caches resolver results for the same URI", async () => {
        let callCount = 0;
        const resolver: BundleResolver = () => {
            callCount++;
            return { type: "string" };
        };

        const doc = {
            openapi: "3.1.0",
            info: { title: "Test", version: "1.0" },
            paths: {
                "/a": {
                    get: {
                        responses: {
                            "200": {
                                content: {
                                    "application/json": {
                                        schema: {
                                            $ref: "https://example.com/Schema.json#",
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
                "/b": {
                    get: {
                        responses: {
                            "200": {
                                content: {
                                    "application/json": {
                                        schema: {
                                            $ref: "https://example.com/Schema.json#",
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        };

        await bundleOpenApiDoc(doc, resolver);
        expect(callCount).toBe(1);
    });

    it("de-duplicates identical external refs into a single components entry", async () => {
        const resolver = createMemoryResolver({
            "https://api.example.com/schemas/Pet.json": {
                type: "object",
                properties: {
                    name: { type: "string" },
                },
            },
        });

        const doc = {
            openapi: "3.1.0",
            info: { title: "Test", version: "1.0" },
            paths: {
                "/pets": {
                    get: {
                        responses: {
                            "200": {
                                content: {
                                    "application/json": {
                                        schema: {
                                            $ref: "https://api.example.com/schemas/Pet.json#",
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
                "/pets/{id}": {
                    get: {
                        responses: {
                            "200": {
                                content: {
                                    "application/json": {
                                        schema: {
                                            $ref: "https://api.example.com/schemas/Pet.json#",
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        };

        const bundled = await bundleOpenApiDoc(doc, resolver);

        const firstSchema = navigate(
            bundled,
            "paths",
            "/pets",
            "get",
            "responses",
            "200",
            "content",
            "application/json",
            "schema"
        );
        const secondSchema = navigate(
            bundled,
            "paths",
            "/pets/{id}",
            "get",
            "responses",
            "200",
            "content",
            "application/json",
            "schema"
        );

        expect(firstSchema).toBeDefined();
        expect(secondSchema).toBeDefined();
        if (firstSchema === undefined || secondSchema === undefined) return;

        // Both call sites point to the same internal ref.
        expect(firstSchema.$ref).toBe("#/components/schemas/Pet");
        expect(secondSchema.$ref).toBe("#/components/schemas/Pet");

        // Only one entry was created in components.schemas for this ref.
        const schemas = navigate(bundled, "components", "schemas");
        expect(schemas).toBeDefined();
        if (schemas === undefined) return;
        const petEntries = Object.keys(schemas).filter((key) =>
            key.startsWith("Pet")
        );
        expect(petEntries).toEqual(["Pet"]);
    });

    it("preserves internal $ref strings", async () => {
        const resolver = createMemoryResolver({});
        const doc = {
            openapi: "3.1.0",
            info: { title: "Test", version: "1.0" },
            components: {
                schemas: {
                    Pet: {
                        type: "object",
                        properties: {
                            name: { type: "string" },
                        },
                    },
                },
            },
            paths: {
                "/pets": {
                    get: {
                        responses: {
                            "200": {
                                content: {
                                    "application/json": {
                                        schema: {
                                            $ref: "#/components/schemas/Pet",
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        };

        const bundled = await bundleOpenApiDoc(doc, resolver);
        const schema = navigate(
            bundled,
            "paths",
            "/pets",
            "get",
            "responses",
            "200",
            "content",
            "application/json",
            "schema"
        );

        expect(schema).toBeDefined();
        if (schema === undefined) return;
        expect(schema.$ref).toBe("#/components/schemas/Pet");
    });
});

// ---------------------------------------------------------------------------
// Walker integration
// ---------------------------------------------------------------------------

describe("bundled doc walker integration", () => {
    it("walks a bundled document without external refs", async () => {
        const resolver = createMemoryResolver({
            "https://example.com/Pet.json": {
                type: "object",
                properties: {
                    name: { type: "string" },
                },
            },
        });

        const doc = {
            openapi: "3.1.0",
            info: { title: "Test", version: "1.0" },
            paths: {
                "/pets": {
                    get: {
                        responses: {
                            "200": {
                                content: {
                                    "application/json": {
                                        schema: {
                                            $ref: "https://example.com/Pet.json#",
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        };

        const bundled = await bundleOpenApiDoc(doc, resolver);
        const schema = navigate(
            bundled,
            "paths",
            "/pets",
            "get",
            "responses",
            "200",
            "content",
            "application/json",
            "schema"
        );

        expect(schema).toBeDefined();
        if (schema === undefined) return;

        const tree = walk(schema, { rootDocument: bundled });
        expect(tree.type).toBe("object");
    });
});
