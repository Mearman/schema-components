/**
 * OAS 3.0/3.1 XML Schema Object metadata diagnostic.
 *
 * Swagger 2.0 already surfaces `dropped-swagger-feature` for `xml`.
 * OAS 3.0/3.1 Schema Objects support the same keyword but the library
 * has no renderer surface for it; surface the equivalent diagnostic
 * from `getParsed` so consumers can audit silent feature drops.
 */

import { describe, it, expect } from "vitest";
import { getParsed } from "../src/openapi/resolve.ts";
import type { Diagnostic, DiagnosticSink } from "../src/core/diagnostics.ts";

function collect(doc: Record<string, unknown>): { diagnostics: Diagnostic[] } {
    const diagnostics: Diagnostic[] = [];
    const sink: DiagnosticSink = (d) => diagnostics.push(d);
    getParsed(doc, { diagnostics: sink });
    return { diagnostics };
}

describe("OAS 3.0/3.1 xml metadata diagnostic", () => {
    it("emits dropped-swagger-feature when an OAS 3.0 schema carries xml", () => {
        const doc: Record<string, unknown> = {
            openapi: "3.0.3",
            info: { title: "Test", version: "1.0" },
            paths: {},
            components: {
                schemas: {
                    Pet: {
                        type: "object",
                        xml: { name: "pet", namespace: "https://x" },
                        properties: {
                            name: { type: "string" },
                        },
                    },
                },
            },
        };
        const { diagnostics } = collect(doc);
        const diag = diagnostics.find((d) => {
            if (d.code !== "dropped-swagger-feature") return false;
            if (d.detail === undefined) return false;
            return (
                d.detail.feature === "xml" && d.detail.source === "openapi-3.x"
            );
        });
        expect(diag).toBeDefined();
    });

    it("emits the diagnostic for OAS 3.1 schemas too", () => {
        const doc: Record<string, unknown> = {
            openapi: "3.1.0",
            info: { title: "Test", version: "1.0" },
            paths: {},
            components: {
                schemas: {
                    Pet: {
                        type: "object",
                        xml: { name: "pet" },
                        properties: {
                            name: { type: "string" },
                        },
                    },
                },
            },
        };
        const { diagnostics } = collect(doc);
        const diag = diagnostics.find((d) => {
            if (d.code !== "dropped-swagger-feature") return false;
            if (d.detail === undefined) return false;
            return d.detail.source === "openapi-3.x";
        });
        expect(diag).toBeDefined();
    });

    it("does not emit the diagnostic when no xml metadata is present", () => {
        const doc: Record<string, unknown> = {
            openapi: "3.0.3",
            info: { title: "Test", version: "1.0" },
            paths: {},
            components: {
                schemas: {
                    Pet: {
                        type: "object",
                        properties: { name: { type: "string" } },
                    },
                },
            },
        };
        const { diagnostics } = collect(doc);
        const diag = diagnostics.find((d) => {
            if (d.code !== "dropped-swagger-feature") return false;
            if (d.detail === undefined) return false;
            return d.detail.source === "openapi-3.x";
        });
        expect(diag).toBeUndefined();
    });
});
