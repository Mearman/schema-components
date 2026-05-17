/**
 * Cross-Schema-Object relative ref diagnostic.
 *
 * The normalisation pipeline only resolves relative refs within a
 * single Schema Object via $id base URIs. Refs that cross Schema
 * Object boundaries survive unresolved; getParsed walks the
 * normalised doc and emits cross-schema-relative-ref-unsupported
 * per offending ref so consumers see the silent failure.
 */

import { describe, it, expect } from "vitest";
import { getParsed } from "../src/openapi/resolve.ts";
import type { Diagnostic, DiagnosticSink } from "../src/core/diagnostics.ts";

describe("Cross-Schema-Object relative ref diagnostic", () => {
    it("emits diagnostic when a non-fragment ref survives normalisation", () => {
        const doc: Record<string, unknown> = {
            openapi: "3.1.0",
            info: { title: "Test", version: "1.0" },
            paths: {},
            components: {
                schemas: {
                    A: {
                        $id: "https://example.com/schemas/A",
                        type: "object",
                        properties: {
                            // Cross-schema relative ref — refers to B's $id
                            // but the normaliser doesn't resolve across
                            // sibling Schema Objects.
                            bRef: { $ref: "https://example.com/schemas/B" },
                        },
                    },
                    B: {
                        $id: "https://example.com/schemas/B",
                        type: "string",
                    },
                },
            },
        };
        const diagnostics: Diagnostic[] = [];
        const sink: DiagnosticSink = (d) => diagnostics.push(d);
        getParsed(doc, { diagnostics: sink });
        const diag = diagnostics.find(
            (d) => d.code === "cross-schema-relative-ref-unsupported"
        );
        expect(diag).toBeDefined();
        expect(diag?.detail?.ref).toBe("https://example.com/schemas/B");
    });

    it("does not emit the diagnostic for in-document refs", () => {
        const doc: Record<string, unknown> = {
            openapi: "3.1.0",
            info: { title: "Test", version: "1.0" },
            paths: {},
            components: {
                schemas: {
                    A: {
                        type: "object",
                        properties: {
                            bRef: { $ref: "#/components/schemas/B" },
                        },
                    },
                    B: { type: "string" },
                },
            },
        };
        const diagnostics: Diagnostic[] = [];
        const sink: DiagnosticSink = (d) => diagnostics.push(d);
        getParsed(doc, { diagnostics: sink });
        expect(
            diagnostics.find(
                (d) => d.code === "cross-schema-relative-ref-unsupported"
            )
        ).toBeUndefined();
    });
});
