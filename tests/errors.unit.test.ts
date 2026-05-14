/**
 * Error handling tests.
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { z } from "zod";
import {
    SchemaError,
    SchemaNormalisationError,
    SchemaRenderError,
    SchemaFieldError,
} from "../src/core/errors.ts";
import { renderToHtml } from "../src/html/renderToHtml.ts";

// ---------------------------------------------------------------------------
// Error class hierarchy
// ---------------------------------------------------------------------------

describe("SchemaError", () => {
    it("is the base class", () => {
        const err = new SchemaError("test", { type: "string" });
        assert.ok(err instanceof Error);
        assert.ok(err instanceof SchemaError);
        assert.equal(err.name, "SchemaError");
        assert.equal(err.message, "test");
        assert.deepEqual(err.schema, { type: "string" });
    });
});

describe("SchemaNormalisationError", () => {
    it("extends SchemaError", () => {
        const err = new SchemaNormalisationError(
            "bad schema",
            {},
            "invalid-zod"
        );
        assert.ok(err instanceof SchemaError);
        assert.ok(err instanceof SchemaNormalisationError);
        assert.equal(err.name, "SchemaNormalisationError");
        assert.equal(err.kind, "invalid-zod");
    });

    it("preserves schema reference", () => {
        const schema = { type: "object" };
        const err = new SchemaNormalisationError("msg", schema, "unknown");
        assert.strictEqual(err.schema, schema);
    });
});

describe("SchemaRenderError", () => {
    it("extends SchemaError", () => {
        const cause = new Error("boom");
        const err = new SchemaRenderError("render failed", {}, "string", cause);
        assert.ok(err instanceof SchemaError);
        assert.ok(err instanceof SchemaRenderError);
        assert.equal(err.name, "SchemaRenderError");
        assert.equal(err.schemaType, "string");
        assert.strictEqual(err.cause, cause);
    });
});

describe("SchemaFieldError", () => {
    it("extends SchemaError", () => {
        const err = new SchemaFieldError("not found", {}, "address.city");
        assert.ok(err instanceof SchemaError);
        assert.ok(err instanceof SchemaFieldError);
        assert.equal(err.name, "SchemaFieldError");
        assert.equal(err.path, "address.city");
    });
});

// ---------------------------------------------------------------------------
// Normalisation errors — bad inputs
// ---------------------------------------------------------------------------

describe("Normalisation errors", () => {
    it("throws for Zod 3 schema", () => {
        const zod3Schema = { _def: { type: "string" } };
        assert.throws(
            () => renderToHtml(zod3Schema),
            (err: unknown) => {
                assert.ok(err instanceof Error);
                return err.message.includes("Zod 3");
            }
        );
    });

    it("throws for missing OpenAPI ref", () => {
        const doc = {
            openapi: "3.1.0",
            info: { title: "Test", version: "1.0" },
            paths: {},
        };
        assert.throws(
            () => renderToHtml(doc, { ref: "#/components/schemas/Missing" }),
            (err: unknown) => {
                assert.ok(err instanceof Error);
                return err.message.includes("OpenAPI ref not found");
            }
        );
    });

    it("throws for invalid OpenAPI path ref", () => {
        const doc = {
            openapi: "3.1.0",
            info: { title: "Test", version: "1.0" },
            paths: {},
        };
        assert.throws(
            () => renderToHtml(doc, { ref: "/nonexistent/get" }),
            (err: unknown) => {
                assert.ok(err instanceof Error);
                return err.message.includes("Path not found");
            }
        );
    });

    it("throws for empty OpenAPI doc without ref", () => {
        const doc = {
            openapi: "3.1.0",
            info: { title: "Test", version: "1.0" },
            paths: {},
        };
        assert.throws(
            () => renderToHtml(doc),
            (err: unknown) => {
                assert.ok(err instanceof Error);
                return err.message.includes("OpenAPI");
            }
        );
    });
});

// ---------------------------------------------------------------------------
// HTML renderer — render errors from custom resolver
// ---------------------------------------------------------------------------

describe("Render errors", () => {
    it("propagates errors from custom render function", () => {
        const schema = z.object({ name: z.string() });
        assert.throws(
            () =>
                renderToHtml(schema, {
                    value: { name: "Ada" },
                    resolver: {
                        string: () => {
                            throw new Error("Custom resolver broke");
                        },
                    },
                }),
            (err: unknown) => {
                assert.ok(err instanceof Error);
                return err.message.includes("Custom resolver broke");
            }
        );
    });
});
