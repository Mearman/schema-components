/**
 * Prototype-pollution diagnostic tests for `core/merge.ts` and
 * `core/swagger2.ts`.
 *
 * The walker already refuses to register `__proto__`, `constructor`, or
 * `prototype` as field names on the merged object (and emits a
 * `prototype-polluting-property` diagnostic when it does so). The merge
 * helper and the Swagger 2.0 normaliser host the same shape of property
 * copy loop, but historically dropped the keys silently. A silent drop
 * conceals the fact that an attacker-controlled schema tried to smuggle
 * a polluting key — surface the same diagnostic so consumers see the
 * attempt at every site.
 */

import { describe, it, expect } from "vitest";
import type { Diagnostic, DiagnosticSink } from "../src/core/diagnostics.ts";
import { mergeAllOf } from "../src/core/merge.ts";
import { normaliseOpenApiSchemas } from "../src/core/normalise.ts";
import { detectOpenApiVersion } from "../src/core/version.ts";
import { assertDefined } from "./helpers.ts";

function collectDiagnostics(fn: (sink: DiagnosticSink) => void): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    fn((d) => diagnostics.push(d));
    return diagnostics;
}

// ---------------------------------------------------------------------------
// mergeAllOf — prototype-polluting property in an allOf branch
// ---------------------------------------------------------------------------

describe("mergeAllOf — prototype-polluting property", () => {
    it("emits prototype-polluting-property and drops __proto__", () => {
        // Use JSON.parse so `__proto__` is an own enumerable property
        // rather than setting the prototype of the literal.
        const schemas = [
            JSON.parse(
                '{"type":"object","properties":{"__proto__":{"type":"string"},"legitimate":{"type":"string"}}}'
            ) as Record<string, unknown>,
            { type: "object", properties: { other: { type: "string" } } },
        ];
        const diagnostics = collectDiagnostics((sink) => {
            mergeAllOf(schemas, { diagnostics: sink });
        });
        const protoDiag = diagnostics.find(
            (d) => d.code === "prototype-polluting-property"
        );
        expect(protoDiag).toBeDefined();
        expect(protoDiag?.detail?.propertyName).toBe("__proto__");
    });

    it("emits prototype-polluting-property for a constructor branch", () => {
        // Use JSON.parse for the same reason as above — and to dodge the
        // TS structural-typing complaint when `constructor` overlaps the
        // built-in `Function` member.
        const schemas = [
            JSON.parse(
                '{"type":"object","properties":{"constructor":{"type":"string"},"kept":{"type":"string"}}}'
            ) as Record<string, unknown>,
            JSON.parse(
                '{"type":"object","properties":{"other":{"type":"string"}}}'
            ) as Record<string, unknown>,
        ];
        const diagnostics = collectDiagnostics((sink) => {
            mergeAllOf(schemas, { diagnostics: sink });
        });
        const protoDiag = diagnostics.find(
            (d) => d.code === "prototype-polluting-property"
        );
        expect(protoDiag).toBeDefined();
        expect(protoDiag?.detail?.propertyName).toBe("constructor");
    });

    it("emits prototype-polluting-property for a prototype branch", () => {
        const schemas = [
            JSON.parse(
                '{"type":"object","properties":{"prototype":{"type":"string"}}}'
            ) as Record<string, unknown>,
        ];
        const diagnostics = collectDiagnostics((sink) => {
            mergeAllOf(schemas, { diagnostics: sink });
        });
        const protoDiag = diagnostics.find(
            (d) => d.code === "prototype-polluting-property"
        );
        expect(protoDiag).toBeDefined();
        expect(protoDiag?.detail?.propertyName).toBe("prototype");
    });

    it("merged result excludes polluting names and includes legitimate ones", () => {
        const schemas = [
            JSON.parse(
                '{"type":"object","properties":{"__proto__":{"type":"string"},"name":{"type":"string"}}}'
            ) as Record<string, unknown>,
        ];
        const merged = mergeAllOf(schemas);
        // Should not be false (which would indicate `false` schema collapse).
        expect(merged).not.toBe(false);
        if (merged === false) return;
        const props = merged.properties;
        expect(props && typeof props === "object").toBe(true);
        if (props === undefined || typeof props !== "object" || props === null)
            return;
        expect(Object.hasOwn(props, "__proto__")).toBe(false);
        expect(Object.hasOwn(props, "name")).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// normaliseSwagger2Document — prototype-polluting property in operation /
// parameter / response / header copy loops
// ---------------------------------------------------------------------------

describe("normaliseSwagger2Document — prototype-polluting property", () => {
    // Note on the test fixtures: a JavaScript object literal
    // `{ __proto__: ... }` sets the prototype rather than creating an
    // own enumerable property, and `JSON.stringify` then skips the key
    // entirely. We construct the documents from raw JSON strings so
    // `__proto__` is preserved as an own enumerable property — which is
    // exactly the shape an attacker-supplied JSON document carries.

    it("emits the diagnostic when an operation carries __proto__ as an own property", () => {
        const doc = JSON.parse(
            '{"swagger":"2.0","info":{"title":"T","version":"1"},"paths":{"/x":{"get":{"__proto__":{"polluted":"value"},"responses":{"200":{"description":"ok"}}}}}}'
        ) as Record<string, unknown>;
        const version = assertDefined(
            detectOpenApiVersion(doc),
            "expected Swagger 2.0 version to be detected"
        );
        const diagnostics = collectDiagnostics((sink) => {
            normaliseOpenApiSchemas(doc, version, { diagnostics: sink });
        });
        const protoDiag = diagnostics.find(
            (d) =>
                d.code === "prototype-polluting-property" &&
                d.detail?.propertyName === "__proto__"
        );
        expect(protoDiag).toBeDefined();
    });

    it("emits the diagnostic when a parameter carries __proto__ as an own property", () => {
        const doc = JSON.parse(
            '{"swagger":"2.0","info":{"title":"T","version":"1"},"paths":{"/x":{"get":{"parameters":[{"name":"q","in":"query","type":"string","__proto__":{"polluted":"value"}}],"responses":{"200":{"description":"ok"}}}}}}'
        ) as Record<string, unknown>;
        const version = assertDefined(
            detectOpenApiVersion(doc),
            "expected Swagger 2.0 version to be detected"
        );
        const diagnostics = collectDiagnostics((sink) => {
            normaliseOpenApiSchemas(doc, version, { diagnostics: sink });
        });
        const protoDiag = diagnostics.find(
            (d) =>
                d.code === "prototype-polluting-property" &&
                d.detail?.propertyName === "__proto__"
        );
        expect(protoDiag).toBeDefined();
    });

    it("emits the diagnostic when a response carries __proto__ as an own property", () => {
        const doc = JSON.parse(
            '{"swagger":"2.0","info":{"title":"T","version":"1"},"paths":{"/x":{"get":{"responses":{"200":{"description":"ok","__proto__":{"polluted":"value"}}}}}}}'
        ) as Record<string, unknown>;
        const version = assertDefined(
            detectOpenApiVersion(doc),
            "expected Swagger 2.0 version to be detected"
        );
        const diagnostics = collectDiagnostics((sink) => {
            normaliseOpenApiSchemas(doc, version, { diagnostics: sink });
        });
        const protoDiag = diagnostics.find(
            (d) =>
                d.code === "prototype-polluting-property" &&
                d.detail?.propertyName === "__proto__"
        );
        expect(protoDiag).toBeDefined();
    });

    it("emits the diagnostic when a response header carries __proto__ as an own property", () => {
        const doc = JSON.parse(
            '{"swagger":"2.0","info":{"title":"T","version":"1"},"paths":{"/x":{"get":{"responses":{"200":{"description":"ok","headers":{"X-Custom":{"type":"string","__proto__":{"polluted":"value"}}}}}}}}}'
        ) as Record<string, unknown>;
        const version = assertDefined(
            detectOpenApiVersion(doc),
            "expected Swagger 2.0 version to be detected"
        );
        const diagnostics = collectDiagnostics((sink) => {
            normaliseOpenApiSchemas(doc, version, { diagnostics: sink });
        });
        const protoDiag = diagnostics.find(
            (d) =>
                d.code === "prototype-polluting-property" &&
                d.detail?.propertyName === "__proto__"
        );
        expect(protoDiag).toBeDefined();
    });

    it("does not pollute Object.prototype during normalisation", () => {
        const doc = JSON.parse(
            '{"swagger":"2.0","info":{"title":"T","version":"1"},"paths":{"/x":{"get":{"__proto__":{"polluted":"value"},"responses":{"200":{"description":"ok"}}}}}}'
        ) as Record<string, unknown>;
        const version = assertDefined(
            detectOpenApiVersion(doc),
            "expected Swagger 2.0 version to be detected"
        );
        normaliseOpenApiSchemas(doc, version);
        // Sanity — the runtime prototype chain is untouched.
        expect(({} as Record<string, unknown>).polluted).toBe(undefined);
    });
});
