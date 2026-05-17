/**
 * Issue 1 — schema cache must not silently drop diagnostics on a second
 * call.
 *
 * The adapter caches normalised results by input object identity. When
 * the first call did not supply a diagnostics sink and the second call
 * does, the cached result would otherwise short-circuit the second call,
 * meaning the new sink never receives the diagnostics that re-running
 * normalisation would emit. The fix mirrors `getParsed` in
 * `openapi/resolve.ts`: any call that supplies `diagnostics` bypasses
 * the cache entirely, both on lookup and on population.
 */

import { describe, it, expect } from "vitest";
import { normaliseSchema } from "../src/core/adapter.ts";
import type { Diagnostic } from "../src/core/diagnostics.ts";

describe("adapter cache — diagnostics interaction", () => {
    it("re-emits diagnostics when a sink is supplied on a follow-up call", () => {
        // A JSON Schema without $schema and with a recognisable keyword
        // pattern triggers an `assumed-draft` diagnostic on every
        // normalisation pass.
        const jsonSchema = {
            type: "object" as const,
            properties: { name: { type: "string" as const } },
        };

        // First call — no diagnostics. Result is cached.
        const first = normaliseSchema(jsonSchema);
        expect(first.jsonSchema.type).toBe("object");

        // Second call — supplies a sink. The cached result must NOT be
        // returned; instead, normalisation must re-run so the sink
        // observes the diagnostic.
        const received: Diagnostic[] = [];
        const second = normaliseSchema(jsonSchema, undefined, {
            diagnostics: { diagnostics: (d) => received.push(d) },
        });
        expect(second.jsonSchema.type).toBe("object");

        // The `assumed-draft` diagnostic must have fired on the second
        // call — the bug it guards against was silent swallowing.
        const codes = received.map((d) => d.code);
        expect(codes).toContain("assumed-draft");
    });

    it("does not poison subsequent no-sink calls after a sink-bearing call", () => {
        // The reverse asymmetry: a sink-bearing call must not cache its
        // result in a way that affects later no-sink callers. Verified
        // by ensuring later non-sink calls still return correctly even
        // when the sink-bearing call ran first.
        const jsonSchema = {
            type: "object" as const,
            properties: { name: { type: "string" as const } },
        };

        const received: Diagnostic[] = [];
        const sinkCall = normaliseSchema(jsonSchema, undefined, {
            diagnostics: { diagnostics: (d) => received.push(d) },
        });
        expect(sinkCall.jsonSchema.type).toBe("object");
        expect(received.length).toBeGreaterThan(0);

        const plainCall = normaliseSchema(jsonSchema);
        expect(plainCall.jsonSchema.type).toBe("object");
    });

    it("re-emits diagnostics on a third sink call after a sink and no-sink mix", () => {
        // Three calls: sink → no-sink → sink. The third call must still
        // see the diagnostic; the no-sink call must not have repopulated
        // the cache in a way that silences the third call.
        const jsonSchema = {
            type: "object" as const,
            properties: { name: { type: "string" as const } },
        };

        const first: Diagnostic[] = [];
        normaliseSchema(jsonSchema, undefined, {
            diagnostics: { diagnostics: (d) => first.push(d) },
        });

        normaliseSchema(jsonSchema);

        const third: Diagnostic[] = [];
        normaliseSchema(jsonSchema, undefined, {
            diagnostics: { diagnostics: (d) => third.push(d) },
        });

        expect(third.map((d) => d.code)).toContain("assumed-draft");
    });
});
