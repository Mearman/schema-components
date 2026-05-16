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
        expect("$ref" in schema).toBe(false);
        expect(schema.type).toBe("object");
        expect(schema.properties).toBeDefined();
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
        expect(petSchema.type).toBe("object");
        expect(petSchema.properties).toBeDefined();
        expect(ownerSchema.type).toBe("object");
        expect(ownerSchema.properties).toBeDefined();
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
