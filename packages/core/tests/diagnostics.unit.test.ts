/**
 * Unit tests for the diagnostics channel.
 *
 * Verifies that every silent fallback site emits a diagnostic
 * with a stable code and pointer, and that strict mode converts
 * diagnostics into thrown errors.
 */

import { describe, it, expect } from "vitest";
import { walk } from "../src/core/walker.ts";
import { normaliseSchema } from "../src/core/adapter.ts";
import type { Diagnostic, DiagnosticSink } from "../src/core/diagnostics.ts";
import { assertDefined } from "./helpers.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function collectDiagnostics(fn: (sink: DiagnosticSink) => void): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    fn((d) => diagnostics.push(d));
    return diagnostics;
}

// ---------------------------------------------------------------------------
// Walker diagnostics
// ---------------------------------------------------------------------------

describe("walker diagnostics", () => {
    it("emits unsupported-type for schema with no type", () => {
        const diags = collectDiagnostics((sink) => {
            walk({}, { diagnostics: { diagnostics: sink } });
        });
        expect(diags.length).toBe(1);
        const diag = assertDefined(diags[0], "expected diagnostic");
        expect(diag.code).toBe("unsupported-type");
        expect(diag.pointer).toBe("");
    });

    it("emits unsupported-type for unknown type string", () => {
        const diags = collectDiagnostics((sink) => {
            walk({ type: "custom" }, { diagnostics: { diagnostics: sink } });
        });
        expect(diags.length).toBe(1);
        const diag = assertDefined(diags[0], "expected diagnostic");
        expect(diag.code).toBe("unsupported-type");
        expect(diag.detail?.type).toBe("custom");
    });

    it("emits invalid-const for non-primitive const value", () => {
        const diags = collectDiagnostics((sink) => {
            walk(
                { const: { nested: true } },
                { diagnostics: { diagnostics: sink } }
            );
        });
        expect(diags.length).toBe(1);
        const diag = assertDefined(diags[0], "expected diagnostic");
        expect(diag.code).toBe("invalid-const");
    });

    it("does not emit invalid-const for primitive const value", () => {
        const diags = collectDiagnostics((sink) => {
            walk({ const: "hello" }, { diagnostics: { diagnostics: sink } });
        });
        expect(diags.filter((d) => d.code === "invalid-const").length).toBe(0);
    });

    it("emits type-negation-fallback for not schema", () => {
        const diags = collectDiagnostics((sink) => {
            walk(
                { not: { type: "string" } },
                { diagnostics: { diagnostics: sink } }
            );
        });
        expect(diags.length).toBe(1);
        const diag = assertDefined(diags[0], "expected diagnostic");
        expect(diag.code).toBe("type-negation-fallback");
    });

    it("emits conditional-fallback for if/then/else schema", () => {
        const diags = collectDiagnostics((sink) => {
            walk(
                {
                    type: "string",
                    if: { minLength: 1 },
                    then: { minLength: 5 },
                },
                { diagnostics: { diagnostics: sink } }
            );
        });
        const conditional = diags.filter(
            (d) => d.code === "conditional-fallback"
        );
        expect(conditional.length).toBe(1);
    });

    it("emits external-ref for non-fragment $ref", () => {
        const diags = collectDiagnostics((sink) => {
            walk(
                { $ref: "external.yaml#/components/schemas/Pet" },
                { diagnostics: { diagnostics: sink } }
            );
        });
        const external = diags.filter((d) => d.code === "external-ref");
        expect(external.length).toBe(1);
        const ext = assertDefined(external[0], "expected external-ref");
        expect(ext.detail?.ref).toBe("external.yaml#/components/schemas/Pet");
        // Also emits unresolved-ref since dereference can't resolve external refs
        const unresolved = diags.filter((d) => d.code === "unresolved-ref");
        expect(unresolved.length).toBe(1);
    });

    it("tracks pointer for nested object properties", () => {
        const diags = collectDiagnostics((sink) => {
            walk(
                {
                    type: "object",
                    properties: {
                        inner: {},
                    },
                },
                { diagnostics: { diagnostics: sink } }
            );
        });
        const unsupported = diags.filter((d) => d.code === "unsupported-type");
        expect(unsupported.length).toBe(1);
        const unsup = assertDefined(
            unsupported[0],
            "expected unsupported-type"
        );
        expect(unsup.pointer).toBe("/inner");
    });

    it("emits unknown-format for unrecognised format string", () => {
        const diags = collectDiagnostics((sink) => {
            walk(
                { type: "string", format: "custom-format" },
                { diagnostics: { diagnostics: sink } }
            );
        });
        const fmt = diags.filter((d) => d.code === "unknown-format");
        expect(fmt.length).toBe(1);
        const fmtDiag = assertDefined(fmt[0], "expected unknown-format");
        expect(fmtDiag.detail?.format).toBe("custom-format");
    });

    it("does not emit unknown-format for known formats", () => {
        const knownFormats = [
            "date-time",
            "date",
            "time",
            "email",
            "uuid",
            "uri",
            "hostname",
            "ipv4",
            "ipv6",
        ];
        for (const fmt of knownFormats) {
            const diags = collectDiagnostics((sink) => {
                walk(
                    { type: "string", format: fmt },
                    { diagnostics: { diagnostics: sink } }
                );
            });
            expect(
                diags.filter((d) => d.code === "unknown-format").length
            ).toBe(0);
        }
    });
});

// ---------------------------------------------------------------------------
// Ref diagnostics
// ---------------------------------------------------------------------------

describe("ref diagnostics", () => {
    it("emits unresolved-ref for unresolvable $ref", () => {
        const diags = collectDiagnostics((sink) => {
            walk(
                { $ref: "#/components/schemas/Missing" },
                { diagnostics: { diagnostics: sink } }
            );
        });
        const unresolved = diags.filter((d) => d.code === "unresolved-ref");
        expect(unresolved.length).toBe(1);
        const ref = assertDefined(unresolved[0], "expected unresolved-ref");
        expect(ref.detail?.ref).toBe("#/components/schemas/Missing");
    });
});

// ---------------------------------------------------------------------------
// Strict mode
// ---------------------------------------------------------------------------

describe("strict mode", () => {
    it("throws on any diagnostic when strict is true", () => {
        expect(() => {
            walk({}, { diagnostics: { strict: true } });
        }).toThrow("unsupported-type");
    });

    it("does not throw when no diagnostics are emitted", () => {
        expect(() => {
            walk({ type: "string" }, { diagnostics: { strict: true } });
        }).not.toThrow();
    });
});

// ---------------------------------------------------------------------------
// Adapter diagnostics propagation
// ---------------------------------------------------------------------------

describe("adapter diagnostics propagation", () => {
    it("passes diagnostics through normaliseSchema and walk", () => {
        const diags = collectDiagnostics((sink) => {
            const result = normaliseSchema(
                { type: "string", format: "totally-unknown" },
                undefined,
                { diagnostics: { diagnostics: sink } }
            );
            // Walk the normalised schema to trigger format diagnostic
            walk(result.jsonSchema, { diagnostics: { diagnostics: sink } });
        });
        expect(diags.some((d) => d.code === "unknown-format")).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Default behaviour unchanged
// ---------------------------------------------------------------------------

describe("default behaviour (no diagnostics sink)", () => {
    it("walker produces same output with or without diagnostics", () => {
        const schema = {
            type: "object",
            properties: {
                name: { type: "string" },
                age: { type: "number" },
            },
        };

        const without = walk(schema);
        const diags: Diagnostic[] = [];
        const withDiagnostics = walk(schema, {
            diagnostics: {
                diagnostics: (d) => {
                    diags.push(d);
                },
            },
        });

        expect(without.type).toBe(withDiagnostics.type);
        expect(without.meta).toEqual(withDiagnostics.meta);
        expect(diags.length).toBe(0);
    });
});
