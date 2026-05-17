/**
 * Issues 2, 6 — schema kind detection edge cases.
 *
 * - Non-canonical schemas exposing only `parse`/`safeParse` (Standard
 *   Schema, valibot, arktype-likes) must be classified as
 *   `unsupported-schema-lib` and surface a `SchemaNormalisationError`
 *   with `kind: "unsupported-schema"`.
 * - Half-constructed `_zod` markers (e.g. `{ _zod: true }`) must produce
 *   `unsupported-schema` errors that mention "not a valid Zod 4 schema",
 *   not the generic `invalid-zod`.
 */

import { describe, it, expect } from "vitest";
import { detectSchemaKind, normaliseSchema } from "../src/core/adapter.ts";
import { SchemaNormalisationError } from "../src/core/errors.ts";

describe("detectSchemaKind — non-Zod schema libraries", () => {
    it("classifies an object with parse and safeParse but no _zod/_def as unsupported-schema-lib", () => {
        const fakeStandardSchema = {
            parse: () => null,
            safeParse: () => ({ success: true, data: null }),
        };
        expect(detectSchemaKind(fakeStandardSchema)).toBe(
            "unsupported-schema-lib"
        );
    });

    it("does NOT classify a Zod 4 schema as unsupported-schema-lib", () => {
        // Real Zod 4 schemas also expose `parse`/`safeParse`, but they
        // carry `_zod` so the zod4 branch wins.
        // (Construction deferred to avoid coupling this assertion to a
        // particular Zod builder — using the same z imported elsewhere
        // would over-couple this isolated assertion file.)
        const fakeZod4 = {
            _zod: { def: { type: "string" } },
            parse: () => null,
            safeParse: () => ({ success: true, data: null }),
        };
        expect(detectSchemaKind(fakeZod4)).toBe("zod4");
    });

    it("does NOT classify a plain JSON Schema object as unsupported-schema-lib", () => {
        const jsonSchema = {
            type: "object",
            properties: { x: { type: "string" } },
        };
        expect(detectSchemaKind(jsonSchema)).toBe("jsonSchema");
    });
});

describe("normaliseSchema — unsupported schema libraries", () => {
    it("throws SchemaNormalisationError with kind unsupported-schema for parse-bearing non-Zod input", () => {
        const fakeStandardSchema = {
            parse: () => null,
            safeParse: () => ({ success: true, data: null }),
        };
        try {
            normaliseSchema(fakeStandardSchema);
            expect.unreachable("Expected normaliseSchema to throw");
        } catch (err) {
            expect(err).toBeInstanceOf(SchemaNormalisationError);
            if (err instanceof SchemaNormalisationError) {
                expect(err.kind).toBe("unsupported-schema");
                expect(err.message).toMatch(/non-Zod library|Zod 4/);
            }
        }
    });

    it("error message points the consumer at the Zod 4 contract", () => {
        const fakeStandardSchema = {
            parse: () => null,
            safeParse: () => ({ success: true, data: null }),
        };
        expect(() => normaliseSchema(fakeStandardSchema)).toThrow(
            /zod\.dev\/v4/
        );
    });
});

describe("normaliseZod4 — strict _zod / _zod.def validation (issue 6)", () => {
    it("rejects half-constructed { _zod: true } as unsupported-schema", () => {
        const halfConstructed = { _zod: true };
        try {
            normaliseSchema(halfConstructed);
            expect.unreachable("Expected normaliseSchema to throw");
        } catch (err) {
            expect(err).toBeInstanceOf(SchemaNormalisationError);
            if (err instanceof SchemaNormalisationError) {
                // The kind must be `unsupported-schema`, not the older
                // `invalid-zod`. The wording must mention Zod 4
                // explicitly so the consumer is sent to the migration.
                expect(err.kind).toBe("unsupported-schema");
                expect(err.message).toMatch(/Zod 4/);
            }
        }
    });

    it("rejects { _zod: null } as unsupported-schema (null is not an object)", () => {
        const sentinel = { _zod: null };
        try {
            normaliseSchema(sentinel);
            expect.unreachable("Expected normaliseSchema to throw");
        } catch (err) {
            expect(err).toBeInstanceOf(SchemaNormalisationError);
            if (err instanceof SchemaNormalisationError) {
                expect(err.kind).toBe("unsupported-schema");
            }
        }
    });

    it("rejects { _zod: {} } (no def) as unsupported-schema", () => {
        const noDef = { _zod: {} };
        try {
            normaliseSchema(noDef);
            expect.unreachable("Expected normaliseSchema to throw");
        } catch (err) {
            expect(err).toBeInstanceOf(SchemaNormalisationError);
            if (err instanceof SchemaNormalisationError) {
                expect(err.kind).toBe("unsupported-schema");
                expect(err.message).toMatch(/_zod\.def/);
            }
        }
    });

    it("rejects { _zod: { def: null } } as unsupported-schema (def must be an object)", () => {
        const nullDef = { _zod: { def: null } };
        try {
            normaliseSchema(nullDef);
            expect.unreachable("Expected normaliseSchema to throw");
        } catch (err) {
            expect(err).toBeInstanceOf(SchemaNormalisationError);
            if (err instanceof SchemaNormalisationError) {
                expect(err.kind).toBe("unsupported-schema");
            }
        }
    });
});
