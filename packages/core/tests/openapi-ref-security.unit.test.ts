/**
 * Security tests for JSON Pointer resolution inside the OpenAPI parser
 * and the OpenAPI bundler.
 *
 * Both resolvers walk `$ref` strings segment by segment using dynamic
 * indexing. Without filtering, a crafted reference such as
 * `#/__proto__/polluted` reads `Object.prototype` and lets the attacker
 * smuggle properties from the runtime prototype chain into the resolved
 * schema. The parser and bundler must refuse to traverse `__proto__`,
 * `constructor` and `prototype` segments and surface `undefined`.
 */

import { describe, it, expect } from "vitest";
import { parseOpenApiDocument, extractSchema } from "../src/openapi/parser.ts";
import { bundleOpenApiDoc } from "../src/openapi/bundle.ts";
import type { BundleResolver } from "../src/openapi/bundle.ts";
import { dereference } from "../src/core/ref.ts";
import { resolveOperation } from "../src/openapi/resolve.ts";
import { isObject } from "../src/core/guards.ts";

function extractSchemasMap(
    doc: Record<string, unknown>
): Record<string, unknown> {
    const components = doc.components;
    if (!isObject(components)) return {};
    const schemas = components.schemas;
    if (!isObject(schemas)) return {};
    return schemas;
}

function getRefString(value: unknown): string | undefined {
    if (!isObject(value)) return undefined;
    const ref = value.$ref;
    return typeof ref === "string" ? ref : undefined;
}

// ---------------------------------------------------------------------------
// parser.ts — resolveRefInDoc via extractSchema
// ---------------------------------------------------------------------------

describe("parser resolveRefInDoc — prototype pollution refusal", () => {
    it("returns undefined for a $ref pointing at __proto__", () => {
        const doc = {
            openapi: "3.1.0",
            info: { title: "t", version: "1" },
            paths: {},
        };
        const parsed = parseOpenApiDocument(doc);
        const resolved = extractSchema(parsed, "#/__proto__/polluted");
        expect(resolved).toBe(undefined);
    });

    it("returns undefined for a $ref pointing at constructor", () => {
        const doc = {
            openapi: "3.1.0",
            info: { title: "t", version: "1" },
            paths: {},
        };
        const parsed = parseOpenApiDocument(doc);
        const resolved = extractSchema(parsed, "#/constructor/prototype");
        expect(resolved).toBe(undefined);
    });

    it("returns undefined for a $ref pointing at prototype", () => {
        const doc = {
            openapi: "3.1.0",
            info: { title: "t", version: "1" },
            paths: {},
        };
        const parsed = parseOpenApiDocument(doc);
        const resolved = extractSchema(parsed, "#/prototype");
        expect(resolved).toBe(undefined);
    });

    it("does not return Object.prototype for a __proto__ ref", () => {
        const doc = {
            openapi: "3.1.0",
            info: { title: "t", version: "1" },
            paths: {},
        };
        const parsed = parseOpenApiDocument(doc);
        const resolved = extractSchema(parsed, "#/__proto__");
        // The result must not be the global Object prototype object — a
        // truthy return here would let an attacker mutate every plain
        // object reachable from the resolved schema.
        const objectPrototype = Object.getPrototypeOf({}) as unknown;
        expect(resolved).not.toBe(objectPrototype);
        expect(resolved).toBe(undefined);
    });
});

// ---------------------------------------------------------------------------
// bundle.ts — resolveFragment via bundleOpenApiDoc
// ---------------------------------------------------------------------------

describe("bundle resolveFragment — prototype pollution refusal", () => {
    it("refuses to inline an external ref that targets __proto__", async () => {
        const docWithDangerousRef = {
            openapi: "3.1.0",
            info: { title: "t", version: "1" },
            paths: {},
            components: {
                schemas: {
                    Polluted: { $ref: "https://example.com/x.json#/__proto__" },
                },
            },
        };
        const resolver: BundleResolver = () => ({
            // Mock external doc — any traversal into __proto__ here must
            // be refused before the bundler can inline it.
            anything: {},
        });
        const bundled = await bundleOpenApiDoc(docWithDangerousRef, resolver);
        // The original ref is left untouched because the fragment did not
        // resolve to a usable schema — no inlined entry should appear.
        const schemas = extractSchemasMap(bundled);
        // Only the original `Polluted` entry should be present — no
        // additional inlined entry sourced from `__proto__`.
        expect(Object.keys(schemas)).toStrictEqual(["Polluted"]);
        // The ref string is rewritten only when the fragment resolves;
        // it must remain the original external ref here.
        expect(getRefString(schemas.Polluted)).toBe(
            "https://example.com/x.json#/__proto__"
        );
    });
});

// ---------------------------------------------------------------------------
// ref.ts — dereference (canonical JSON Pointer resolver used by adapter.ts)
// ---------------------------------------------------------------------------

describe("ref dereference — prototype pollution refusal", () => {
    it("returns undefined for a $ref pointing at __proto__", () => {
        const root = { components: { schemas: {} } };
        const resolved = dereference("#/__proto__/polluted", root);
        expect(resolved).toBe(undefined);
    });

    it("returns undefined for a $ref pointing at constructor", () => {
        const root = { components: { schemas: {} } };
        const resolved = dereference("#/constructor/prototype", root);
        expect(resolved).toBe(undefined);
    });

    it("returns undefined for a $ref pointing at prototype", () => {
        const root = { components: { schemas: {} } };
        const resolved = dereference("#/prototype", root);
        expect(resolved).toBe(undefined);
    });

    it("does not return Object.prototype for a __proto__ ref", () => {
        const root = { components: { schemas: {} } };
        const resolved = dereference("#/__proto__", root);
        // The result must not be the global Object prototype object — a
        // truthy return here would let an attacker mutate every plain
        // object reachable from the resolved schema.
        const objectPrototype = Object.getPrototypeOf({}) as unknown;
        expect(resolved).not.toBe(objectPrototype);
        expect(resolved).toBe(undefined);
    });
});

// ---------------------------------------------------------------------------
// resolve.ts — resolvePathItemNode (reached via resolveOperation)
// ---------------------------------------------------------------------------

describe("resolve resolvePathItemNode — prototype pollution refusal", () => {
    it("does not return Object.prototype for a pathItems $ref at __proto__", () => {
        // pathItem with a `$ref` targeting `__proto__`. The resolver must
        // refuse traversal and never surface `Object.prototype` as the
        // Path Item Object — instead, the operation lookup throws because
        // no usable path item resolves.
        const doc = {
            openapi: "3.1.0",
            info: { title: "t", version: "1" },
            paths: {
                "/pets": {
                    $ref: "#/__proto__/polluted",
                    get: { responses: { "200": { description: "ok" } } },
                },
            },
        };
        expect(() => resolveOperation(doc, "/pets", "get")).toThrow();
    });

    it("does not return Object.prototype for a pathItems $ref at constructor", () => {
        const doc = {
            openapi: "3.1.0",
            info: { title: "t", version: "1" },
            paths: {
                "/pets": {
                    $ref: "#/constructor/prototype",
                    get: { responses: { "200": { description: "ok" } } },
                },
            },
        };
        expect(() => resolveOperation(doc, "/pets", "get")).toThrow();
    });

    it("does not return Object.prototype for a pathItems $ref at prototype", () => {
        const doc = {
            openapi: "3.1.0",
            info: { title: "t", version: "1" },
            paths: {
                "/pets": {
                    $ref: "#/prototype",
                    get: { responses: { "200": { description: "ok" } } },
                },
            },
        };
        expect(() => resolveOperation(doc, "/pets", "get")).toThrow();
    });
});
