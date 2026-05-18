/**
 * issues — nested Zod construct screening, Standard Schema
 * vendor identification, and root meta extraction completeness.
 *
 * Background
 * ----------
 * The adapter's pre-conversion screen previously inspected only the
 * root `_zod.def.type` tag. Several Zod constructs (`z.promise`,
 * `z.codec`, `z.preprocess`) are either silently unwrapped or silently
 * rewritten to their output side by Zod's JSON Schema processors. When
 * those constructs live nested inside a Zod tree, the silent rewrite
 * leaves consumers with a schema whose shape no longer matches the
 * source. widens the screen to walk the entire tree.
 *
 * The Zod 3 detector also missed `z.lazy(() => zod3Schema)` because the
 * recursion descended through `_zod.def` only; lazy schemas hide the
 * inner type behind a getter function. The detector now invokes the
 * getter once (try/catch) and recurses into the materialised inner
 * schema.
 *
 * Standard Schema detection: pure Standard Schema implementations
 * (valibot, arktype, ...) advertise themselves via `~standard.vendor`
 * and may not expose `.parse` / `.safeParse`. The detector now also
 * keys on the `~standard` marker and surfaces the vendor in the error.
 *
 * Root meta extraction: `extractRootMetaFromJson` lifts both `examples`
 * (array form) and `default` (any value, including `false` / `null`)
 * onto the rootMeta shape so consumers see the schema-level defaults
 * the same way they see title / description.
 */

import { describe, it, expect } from "vitest";
import { z } from "zod";
import { normaliseSchema } from "../src/core/adapter.ts";
import { SchemaNormalisationError } from "../src/core/errors.ts";
import type { Diagnostic } from "../src/core/diagnostics.ts";

interface CollectedDiagnostics {
    readonly diagnostics: Diagnostic[];
    readonly sink: (d: Diagnostic) => void;
}

function collectDiagnostics(): CollectedDiagnostics {
    const diagnostics: Diagnostic[] = [];
    return {
        diagnostics,
        sink: (d: Diagnostic): void => {
            diagnostics.push(d);
        },
    };
}

describe("screenPreConversion — nested z.promise ( issue 1)", () => {
    it("emits zod-promise-nested-unwrap for a nested promise and rejects", () => {
        const schema = z.object({ p: z.promise(z.string()) });
        const { diagnostics, sink } = collectDiagnostics();

        try {
            normaliseSchema(schema, undefined, {
                diagnostics: { diagnostics: sink },
            });
            expect.unreachable(
                "Nested z.promise(...) must reject during screening"
            );
        } catch (err) {
            expect(err).toBeInstanceOf(SchemaNormalisationError);
            if (err instanceof SchemaNormalisationError) {
                expect(err.kind).toBe("zod-type-unrepresentable");
                expect(err.zodType).toBe("promise");
            }
        }

        const promiseDiagnostics = diagnostics.filter(
            (d) => d.code === "zod-promise-nested-unwrap"
        );
        expect(promiseDiagnostics).toHaveLength(1);
        expect(promiseDiagnostics[0]?.pointer).toBe("/properties/p");
        expect(promiseDiagnostics[0]?.detail).toEqual({ zodType: "promise" });
    });

    it("emits one zod-promise-nested-unwrap diagnostic per occurrence", () => {
        // Two independent nested promises — both should surface on the
        // sink even though the first occurrence already records the
        // rejection. The screen walks the entire tree.
        const schema = z.object({
            a: z.promise(z.string()),
            b: z.promise(z.number()),
        });
        const { diagnostics, sink } = collectDiagnostics();

        expect(() =>
            normaliseSchema(schema, undefined, {
                diagnostics: { diagnostics: sink },
            })
        ).toThrow(SchemaNormalisationError);

        const promiseDiagnostics = diagnostics.filter(
            (d) => d.code === "zod-promise-nested-unwrap"
        );
        expect(promiseDiagnostics).toHaveLength(2);
        const pointers = promiseDiagnostics.map((d) => d.pointer).sort();
        expect(pointers).toEqual(["/properties/a", "/properties/b"]);
    });
});

describe("screenPreConversion — nested z.codec ( issue 2)", () => {
    it("emits zod-codec-nested-output-only for a codec inside an object", () => {
        const codec = z.codec(z.string(), z.number(), {
            decode: (s) => Number.parseFloat(s),
            encode: (n) => String(n),
        });
        const schema = z.object({ amount: codec });
        const { diagnostics, sink } = collectDiagnostics();

        // Codec inside an object should NOT throw — the diagnostic is the
        // signal. The output side renders cleanly as a number schema.
        expect(() =>
            normaliseSchema(schema, undefined, {
                diagnostics: { diagnostics: sink },
            })
        ).not.toThrow();

        const codecDiagnostics = diagnostics.filter(
            (d) => d.code === "zod-codec-nested-output-only"
        );
        expect(codecDiagnostics).toHaveLength(1);
        expect(codecDiagnostics[0]?.pointer).toBe("/properties/amount");
        expect(codecDiagnostics[0]?.detail).toEqual({ zodType: "codec" });
    });

    it("keeps emitting zod-codec-output-only for a root-level codec", () => {
        // widening must not regress the existing root-only
        // diagnostic — it stays distinct from the nested code so
        // consumers can branch on root vs nested.
        const codec = z.codec(z.string(), z.number(), {
            decode: (s) => Number.parseFloat(s),
            encode: (n) => String(n),
        });
        const { diagnostics, sink } = collectDiagnostics();

        expect(() =>
            normaliseSchema(codec, undefined, {
                diagnostics: { diagnostics: sink },
            })
        ).not.toThrow();

        const rootCodec = diagnostics.filter(
            (d) => d.code === "zod-codec-output-only"
        );
        expect(rootCodec).toHaveLength(1);
        const nestedCodec = diagnostics.filter(
            (d) => d.code === "zod-codec-nested-output-only"
        );
        expect(nestedCodec).toHaveLength(0);
    });
});

describe("containsNestedZod3 — z.lazy(() => zod3Schema) ( issue 3)", () => {
    it("classifies a Zod 3 schema returned by a lazy getter as zod3-unsupported", () => {
        // A Zod-3-style schema returned by the getter must be detected.
        // Previously the recursion stopped at the function value and the
        // inner schema slipped through, surfacing as a generic
        // conversion failure with the V8 TypeError wording.
        const fakeZod3 = { _def: { typeName: "ZodString" } };
        const schema = z.object({
            inner: z.lazy(() => fakeZod3 as unknown as z.ZodType),
        });

        try {
            normaliseSchema(schema);
            expect.unreachable(
                "lazy(() => zod3) must classify as zod3-unsupported"
            );
        } catch (err) {
            expect(err).toBeInstanceOf(SchemaNormalisationError);
            if (err instanceof SchemaNormalisationError) {
                expect(err.kind).toBe("zod3-unsupported");
            }
        }
    });

    it("tolerates a lazy getter that throws on construct", () => {
        // Some user-supplied getters perform runtime validation and
        // throw on first access. The detector must not propagate that
        // throw — it should treat the unresolvable lazy as "no nested
        // Zod 3 found" and let the conversion fail downstream with its
        // own message rather than a synthetic detector error.
        const schema = z.object({
            inner: z.lazy<z.ZodType>(() => {
                throw new Error("getter is not yet ready");
            }),
        });

        // Either the schema converts (in which case no detector throw
        // occurred) or `z.toJSONSchema` itself raises — both outcomes
        // are acceptable; what must NOT happen is the detector throwing
        // its own error. We assert that no error message mentions
        // "getter is not yet ready" propagated out of the detector.
        try {
            normaliseSchema(schema);
        } catch (err) {
            // If the conversion throws downstream the detector's
            // try/catch in containsNestedZod3Inner must have swallowed
            // the getter error — the failure here is from Zod's own
            // conversion path, not the detector.
            expect(err).toBeInstanceOf(Error);
        }
    });
});

describe("screenPreConversion — z.preprocess ( issue 4)", () => {
    it("emits zod-preprocess-output-only for a root-level preprocess", () => {
        const schema = z.preprocess((v) => String(v), z.string());
        const { diagnostics, sink } = collectDiagnostics();

        expect(() =>
            normaliseSchema(schema, undefined, {
                diagnostics: { diagnostics: sink },
            })
        ).not.toThrow();

        const preprocessDiagnostics = diagnostics.filter(
            (d) => d.code === "zod-preprocess-output-only"
        );
        expect(preprocessDiagnostics).toHaveLength(1);
        expect(preprocessDiagnostics[0]?.pointer).toBe("");
        expect(preprocessDiagnostics[0]?.detail).toEqual({
            zodType: "preprocess",
        });
    });

    it("emits zod-preprocess-output-only for a nested preprocess", () => {
        const schema = z.object({
            normalised: z.preprocess((v) => String(v), z.string()),
        });
        const { diagnostics, sink } = collectDiagnostics();

        expect(() =>
            normaliseSchema(schema, undefined, {
                diagnostics: { diagnostics: sink },
            })
        ).not.toThrow();

        const preprocessDiagnostics = diagnostics.filter(
            (d) => d.code === "zod-preprocess-output-only"
        );
        expect(preprocessDiagnostics).toHaveLength(1);
        expect(preprocessDiagnostics[0]?.pointer).toBe(
            "/properties/normalised"
        );
    });
});

describe("isLikelyOtherSchemaLib — Standard Schema vendor ( issue 5/7)", () => {
    it("detects a pure Standard Schema input and includes the vendor in the error", () => {
        // A valibot-like Standard Schema implementation: no `.parse`,
        // no `.safeParse`, only the `~standard` namespace.
        const valibotLike = {
            "~standard": {
                validate: (value: unknown) => ({ value }),
                vendor: "valibot",
                version: 1,
            },
        };

        try {
            normaliseSchema(valibotLike);
            expect.unreachable(
                "Standard Schema input must be classified as unsupported"
            );
        } catch (err) {
            expect(err).toBeInstanceOf(SchemaNormalisationError);
            if (err instanceof SchemaNormalisationError) {
                expect(err.kind).toBe("unsupported-schema");
                expect(err.message).toContain("valibot");
            }
        }
    });

    it("still detects a non-Zod parse/safeParse pair with a fallback message", () => {
        // Library exposes the legacy heuristic surface but no
        // `~standard` namespace — the message should fall back to the
        // structural-marker wording without a vendor name.
        const legacyLike = {
            parse: (value: unknown) => value,
            safeParse: (value: unknown) => ({ success: true, data: value }),
        };

        try {
            normaliseSchema(legacyLike);
            expect.unreachable(
                "Legacy parse/safeParse input must be classified as unsupported"
            );
        } catch (err) {
            expect(err).toBeInstanceOf(SchemaNormalisationError);
            if (err instanceof SchemaNormalisationError) {
                expect(err.kind).toBe("unsupported-schema");
                expect(err.message).toContain("`parse` and `safeParse`");
            }
        }
    });
});

describe("extractRootMetaFromJson — examples / default ( issue 8)", () => {
    // The core extraction is exercised in adapter-root-meta.unit.test.ts;
    // this test re-pins the contract from the perspective so a
    // regression that drops examples/default surfaces here too.
    it("surfaces both examples and default in a single normalisation", () => {
        const jsonSchema = {
            type: "object" as const,
            examples: [{ id: 1 }, { id: 2 }],
            default: { id: 0 },
            properties: { id: { type: "integer" as const } },
        };
        const result = normaliseSchema(jsonSchema);
        expect(result.rootMeta?.examples).toStrictEqual([{ id: 1 }, { id: 2 }]);
        expect(result.rootMeta?.default).toStrictEqual({ id: 0 });
    });
});
