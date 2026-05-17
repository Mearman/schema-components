/**
 * Error handling tests.
 */
import { describe, it, expect } from "vitest";
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
        expect(err).toBeInstanceOf(Error);
        expect(err).toBeInstanceOf(SchemaError);
        expect(err.name).toBe("SchemaError");
        expect(err.message).toBe("test");
        expect(err.schema).toStrictEqual({ type: "string" });
    });
});

describe("SchemaNormalisationError", () => {
    it("extends SchemaError", () => {
        const err = new SchemaNormalisationError(
            "bad schema",
            {},
            "invalid-zod"
        );
        expect(err).toBeInstanceOf(SchemaError);
        expect(err).toBeInstanceOf(SchemaNormalisationError);
        expect(err.name).toBe("SchemaNormalisationError");
        expect(err.kind).toBe("invalid-zod");
    });

    it("preserves schema reference", () => {
        const schema = { type: "object" };
        const err = new SchemaNormalisationError("msg", schema, "unknown");
        expect(err.schema).toBe(schema);
    });
});

describe("SchemaRenderError", () => {
    it("extends SchemaError", () => {
        const cause = new Error("boom");
        const err = new SchemaRenderError("render failed", {}, "string", cause);
        expect(err).toBeInstanceOf(SchemaError);
        expect(err).toBeInstanceOf(SchemaRenderError);
        expect(err.name).toBe("SchemaRenderError");
        expect(err.schemaType).toBe("string");
        expect(err.cause).toBe(cause);
    });
});

describe("SchemaFieldError", () => {
    it("extends SchemaError", () => {
        const err = new SchemaFieldError("not found", {}, "address.city");
        expect(err).toBeInstanceOf(SchemaError);
        expect(err).toBeInstanceOf(SchemaFieldError);
        expect(err.name).toBe("SchemaFieldError");
        expect(err.path).toBe("address.city");
    });
});

// ---------------------------------------------------------------------------
// Normalisation errors — bad inputs
// ---------------------------------------------------------------------------

describe("Normalisation errors", () => {
    it("throws for Zod 3 schema", () => {
        const zod3Schema = { _def: { type: "string" } };
        expect(() => renderToHtml(zod3Schema)).toThrow(/Zod 3/);
    });

    it("throws SchemaNormalisationError(kind=zod3-unsupported) for Zod 3", () => {
        const zod3Schema = { _def: { type: "string" } };
        try {
            renderToHtml(zod3Schema);
            expect.unreachable("Expected renderToHtml to throw");
        } catch (err) {
            expect(err).toBeInstanceOf(SchemaNormalisationError);
            if (err instanceof SchemaNormalisationError) {
                expect(err.kind).toBe("zod3-unsupported");
            }
        }
    });

    it("classifies Zod transforms with kind zod-transform-unsupported", () => {
        const schema = z.string().transform((s) => s.length);
        try {
            renderToHtml(schema);
            expect.unreachable("Expected renderToHtml to throw");
        } catch (err) {
            expect(err).toBeInstanceOf(SchemaNormalisationError);
            if (err instanceof SchemaNormalisationError) {
                expect(err.kind).toBe("zod-transform-unsupported");
            }
        }
    });

    it("classifies unrepresentable Zod types with kind zod-type-unrepresentable", () => {
        const schema = z.bigint();
        try {
            renderToHtml(schema);
            expect.unreachable("Expected renderToHtml to throw");
        } catch (err) {
            expect(err).toBeInstanceOf(SchemaNormalisationError);
            if (err instanceof SchemaNormalisationError) {
                expect(err.kind).toBe("zod-type-unrepresentable");
                expect(err.zodType).toBe("bigint");
            }
        }
    });

    it("throws for missing OpenAPI ref", () => {
        const doc = {
            openapi: "3.1.0",
            info: { title: "Test", version: "1.0" },
            paths: {},
        };
        expect(() =>
            renderToHtml(doc, { ref: "#/components/schemas/Missing" })
        ).toThrow(/OpenAPI ref not found/);
    });

    it("throws for invalid OpenAPI path ref", () => {
        const doc = {
            openapi: "3.1.0",
            info: { title: "Test", version: "1.0" },
            paths: {},
        };
        expect(() => renderToHtml(doc, { ref: "/nonexistent/get" })).toThrow(
            /Path not found/
        );
    });

    it("throws for empty OpenAPI doc without ref", () => {
        const doc = {
            openapi: "3.1.0",
            info: { title: "Test", version: "1.0" },
            paths: {},
        };
        expect(() => renderToHtml(doc)).toThrow(/OpenAPI/);
    });
});

// ---------------------------------------------------------------------------
// HTML renderer — render errors from custom resolver
// ---------------------------------------------------------------------------

describe("Render errors", () => {
    it("propagates errors from custom render function", () => {
        const schema = z.object({ name: z.string() });
        expect(() =>
            renderToHtml(schema, {
                value: { name: "Ada" },
                resolver: {
                    string: () => {
                        throw new Error("Custom resolver broke");
                    },
                },
            })
        ).toThrow(/Custom resolver broke/);
    });
});
