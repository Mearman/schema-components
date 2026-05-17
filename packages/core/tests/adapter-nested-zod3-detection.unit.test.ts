/**
 * Issues 7, 8 — nested Zod 3 detector tightening.
 *
 * - Issue 7: targeted descent into Zod 4 nodes. Only `_zod.def` is
 *   recursed; sibling members (`traits`, `parse`, `bag`, ...) are not
 *   walked. Depth is capped at `NESTED_ZOD3_MAX_DEPTH` so pathological
 *   inputs cannot blow the stack.
 * - Issue 8: a Zod-3-style `_def` *without* a string `typeName` (some
 *   third-party libraries omit it) is still detected. Detection keys on
 *   `_def` being an object combined with the absence of `_zod`.
 */

import { describe, it, expect } from "vitest";
import { z } from "zod";
import { normaliseSchema } from "../src/core/adapter.ts";
import { SchemaNormalisationError } from "../src/core/errors.ts";

describe("nested Zod 3 detection — issue 8 (typeName-less _def)", () => {
    it("detects a nested _def-bearing object even when typeName is missing", () => {
        // A Zod-3-style schema that does NOT expose `typeName`. Older
        // wrappers around Zod 3 and a couple of third-party schema
        // libraries strip the `typeName` field; the detector must not
        // rely on it.
        const fakeZod3WithoutTypeName = { _def: { kind: "string" } };
        const schema = z.object({
            inner: fakeZod3WithoutTypeName as unknown as z.ZodType,
        });

        try {
            normaliseSchema(schema);
            expect.unreachable("Expected normaliseSchema to throw");
        } catch (err) {
            expect(err).toBeInstanceOf(SchemaNormalisationError);
            if (err instanceof SchemaNormalisationError) {
                expect(err.kind).toBe("zod3-unsupported");
            }
        }
    });

    it("detects _def with an arbitrary non-string typeName as zod3-unsupported", () => {
        // Even if `typeName` is present but not a string, the absence
        // of `_zod` is the load-bearing signal.
        const fakeZod3 = { _def: { typeName: 42 } };
        const schema = z.object({
            inner: fakeZod3 as unknown as z.ZodType,
        });

        try {
            normaliseSchema(schema);
            expect.unreachable("Expected normaliseSchema to throw");
        } catch (err) {
            expect(err).toBeInstanceOf(SchemaNormalisationError);
            if (err instanceof SchemaNormalisationError) {
                expect(err.kind).toBe("zod3-unsupported");
            }
        }
    });
});

describe("nested Zod 3 detection — issue 7 (targeted descent)", () => {
    it("still classifies a deeply nested Zod 3 inside a Zod 4 tree", () => {
        // The targeted descent into `_zod.def` must still reach
        // user-supplied sub-schemas. Three levels deep.
        const fakeZod3 = { _def: { typeName: "ZodString" } };
        const layer1 = z.object({
            field: fakeZod3 as unknown as z.ZodType,
        });
        const layer2 = z.object({ wrap: layer1 });
        const layer3 = z.object({ root: layer2 });

        try {
            normaliseSchema(layer3);
            expect.unreachable("Expected normaliseSchema to throw");
        } catch (err) {
            expect(err).toBeInstanceOf(SchemaNormalisationError);
            if (err instanceof SchemaNormalisationError) {
                expect(err.kind).toBe("zod3-unsupported");
            }
        }
    });

    it("does not misclassify a wide-but-flat Zod 4 schema", () => {
        // A large object with many sibling fields must not trip the
        // detector even though the walk visits every shape entry.
        const fields: Record<string, z.ZodType> = {};
        for (let i = 0; i < 50; i += 1) {
            fields[`field${String(i)}`] = z.string();
        }
        const schema = z.object(fields);
        expect(() => normaliseSchema(schema)).not.toThrow();
    });

    it("does not throw a stack overflow on a deeply nested chain", () => {
        // 100-level nested object chain — deeper than the
        // `NESTED_ZOD3_MAX_DEPTH` cap of 64 — must not crash. The depth
        // cap returns `false` (no nested Zod 3 found) for nodes beyond
        // the limit; the schema itself is valid Zod 4 throughout, so
        // normalisation must succeed.
        let schema: z.ZodType = z.string();
        for (let i = 0; i < 100; i += 1) {
            schema = z.object({ next: schema });
        }
        expect(() => normaliseSchema(schema)).not.toThrow();
    });
});
