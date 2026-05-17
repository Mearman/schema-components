/**
 * Issues 3, 4, 5, 9 — Zod 4 type-handling edge cases.
 *
 * - `z.promise(T)` (issue 3) must throw `zod-type-unrepresentable`
 *   rather than silently collapsing to the inner type.
 * - `z.never()` (issue 4) must convert to `{ not: {} }` — the walker
 *   has a dedicated branch for that schema, so we match Zod's existing
 *   behaviour (translate, do not throw). The chosen behaviour is
 *   documented in `screenPreConversion`'s JSDoc.
 * - `z.codec(...)` (issues 5 + 9) must:
 *     - convert successfully (codecs are usable),
 *     - emit a `zod-codec-output-only` diagnostic warning the consumer,
 *     - have its OUTPUT side rendered (per `io: "output"`).
 */

import { describe, it, expect } from "vitest";
import { z } from "zod";
import { normaliseSchema } from "../src/core/adapter.ts";
import { SchemaNormalisationError } from "../src/core/errors.ts";
import type { Diagnostic } from "../src/core/diagnostics.ts";

describe("z.promise — issue 3", () => {
    it("throws SchemaNormalisationError with zod-type-unrepresentable for z.promise(z.string())", () => {
        const schema = z.promise(z.string());
        try {
            normaliseSchema(schema);
            expect.unreachable(
                "Expected z.promise(T) to throw zod-type-unrepresentable"
            );
        } catch (err) {
            expect(err).toBeInstanceOf(SchemaNormalisationError);
            if (err instanceof SchemaNormalisationError) {
                expect(err.kind).toBe("zod-type-unrepresentable");
                expect(err.zodType).toBe("promise");
                // The message must point the developer at restructuring,
                // since Zod's own behaviour (silent unwrap) would have
                // produced an output that misrepresents the input shape.
                expect(err.message).toMatch(/promise|Promise/);
            }
        }
    });

    it("does not silently produce an inner-type schema for z.promise(z.string())", () => {
        const schema = z.promise(z.string());
        // The wrong behaviour (the bug we're guarding against) would be
        // for the result to be `{ type: "string" }`. The screening must
        // throw before any conversion can happen.
        expect(() => normaliseSchema(schema)).toThrow();
    });
});

describe("z.never — issue 4 (translate, do not throw)", () => {
    it("converts z.never() to the walker-compatible { not: {} } shape", () => {
        const schema = z.never();
        const result = normaliseSchema(schema);
        // Zod's neverProcessor produces `{ not: {} }`. We deliberately
        // do NOT throw — the walker's boolean-schema branch interprets
        // `false` (and by extension `{ not: {} }` style negation) as the
        // legitimate "no value is acceptable" type. See JSDoc on
        // `screenPreConversion` for the rationale.
        //
        // The conversion adds a top-level `$schema` URI (from the pinned
        // `target: "draft-2020-12"` option), so we assert the `not`
        // payload structurally rather than equating whole objects.
        expect(result.jsonSchema.not).toStrictEqual({});
    });

    it("does NOT throw zod-type-unrepresentable for z.never()", () => {
        const schema = z.never();
        expect(() => normaliseSchema(schema)).not.toThrow();
    });
});

describe("z.codec — issues 5 + 9 (renders output side, emits diagnostic)", () => {
    it("emits zod-codec-output-only diagnostic at the root", () => {
        // A simple bidirectional codec: a string on the wire that
        // decodes into a number. Output side is `number`, input side
        // is `string`. schema-components renders the output side
        // (a number input control) and warns the consumer.
        const stringToNumber = z.codec(z.string(), z.number(), {
            decode: (s) => Number(s),
            encode: (n) => String(n),
        });

        const received: Diagnostic[] = [];
        const result = normaliseSchema(stringToNumber, undefined, {
            diagnostics: { diagnostics: (d) => received.push(d) },
        });

        // Codec conversion must succeed — the codec is usable.
        expect(result.jsonSchema).toBeDefined();

        const codecDiagnostic = received.find(
            (d) => d.code === "zod-codec-output-only"
        );
        expect(codecDiagnostic).toBeDefined();
        if (codecDiagnostic !== undefined) {
            expect(codecDiagnostic.message).toMatch(/output|input/);
        }
    });

    it("renders the OUTPUT side of the codec (per io: 'output')", () => {
        // Output side is `z.number()`, so the result must be `{ type:
        // "number" }`. This pins the io: "output" behaviour: if Zod's
        // default ever flips, or if a future refactor accidentally
        // switches the call to `io: "input"`, this test catches it.
        const stringToNumber = z.codec(z.string(), z.number(), {
            decode: (s) => Number(s),
            encode: (n) => String(n),
        });

        const result = normaliseSchema(stringToNumber);
        expect(result.jsonSchema.type).toBe("number");
    });

    it("does not throw for a top-level z.codec(...)", () => {
        // Sanity check: codecs are explicitly supported, only warned
        // about. This is distinct from `z.transform`, which throws.
        const stringToNumber = z.codec(z.string(), z.number(), {
            decode: (s) => Number(s),
            encode: (n) => String(n),
        });
        expect(() => normaliseSchema(stringToNumber)).not.toThrow();
    });
});

describe("z.toJSONSchema options pinning — issue 5", () => {
    it("converts an object schema's enum field using draft-2020-12 (target option)", () => {
        // The walker assumes draft-2020-12 shape. By pinning the target
        // we keep the adapter's output on the same draft.
        const schema = z.object({
            colour: z.enum(["red", "green", "blue"]),
        });
        const result = normaliseSchema(schema);
        const props = result.jsonSchema.properties;
        expect(props).toBeDefined();
        if (
            props !== undefined &&
            typeof props === "object" &&
            props !== null
        ) {
            const colour = (props as Record<string, unknown>).colour;
            // Draft 2020-12 represents enums with the `enum` keyword.
            // (Older drafts may use `anyOf` of consts; the target pin
            // keeps us on `enum`.)
            expect(colour).toBeDefined();
            if (typeof colour === "object" && colour !== null) {
                const enumValues = (colour as Record<string, unknown>).enum;
                expect(Array.isArray(enumValues)).toBe(true);
            }
        }
    });
});
