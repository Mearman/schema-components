/**
 * Swagger 2.0 global parameters `$ref` cycle handling.
 *
 * The old behaviour returned the original `{ $ref }` envelope on
 * cycle; downstream code read `resolved.in` (undefined) and silently
 * dropped the parameter without any diagnostic. The fix emits
 * `swagger-cyclic-parameter-ref` and skips the entry explicitly.
 */

import { describe, it, expect } from "vitest";
import { normaliseOpenApiSchemas } from "../src/core/normalise.ts";
import { detectOpenApiVersion } from "../src/core/version.ts";
import { assertDefined } from "./helpers.ts";
import type { Diagnostic, DiagnosticSink } from "../src/core/diagnostics.ts";

function collect(doc: Record<string, unknown>): {
    result: Record<string, unknown>;
    diagnostics: Diagnostic[];
} {
    const version = detectOpenApiVersion(doc);
    const diagnostics: Diagnostic[] = [];
    const sink: DiagnosticSink = (d) => diagnostics.push(d);
    const result = normaliseOpenApiSchemas(
        doc,
        assertDefined(version, "version"),
        {
            diagnostics: sink,
        }
    );
    return { result, diagnostics };
}

describe("Swagger 2.0 cyclic parameter $ref", () => {
    it("emits diagnostic and skips entry when an operation references a self-cycling parameter", () => {
        const doc: Record<string, unknown> = {
            swagger: "2.0",
            info: { title: "Test", version: "1.0.0" },
            paths: {
                "/items": {
                    get: {
                        operationId: "list",
                        parameters: [{ $ref: "#/parameters/Recursive" }],
                        responses: { "200": { description: "ok" } },
                    },
                },
            },
            parameters: {
                Recursive: { $ref: "#/parameters/Recursive" },
            },
        };

        const { result, diagnostics } = collect(doc);

        const diag = diagnostics.find(
            (d) => d.code === "swagger-cyclic-parameter-ref"
        );
        expect(diag).toBeDefined();
        expect(diag?.detail?.ref).toBe("#/parameters/Recursive");

        const paths = result.paths as Record<string, unknown>;
        const items = paths["/items"] as Record<string, unknown>;
        const get = items.get as Record<string, unknown>;
        // The parameter is skipped — no junk { $ref } envelope survives.
        expect(get.parameters).toBeUndefined();
    });

    it("emits diagnostic and skips entry at the document-level parameters map", () => {
        const doc: Record<string, unknown> = {
            swagger: "2.0",
            info: { title: "Test", version: "1.0.0" },
            paths: {},
            parameters: {
                A: { $ref: "#/parameters/B" },
                B: { $ref: "#/parameters/A" },
            },
        };

        const { result, diagnostics } = collect(doc);

        const cycleDiags = diagnostics.filter(
            (d) => d.code === "swagger-cyclic-parameter-ref"
        );
        // Both entries cycle; expect at least one diagnostic.
        expect(cycleDiags.length).toBeGreaterThan(0);

        // Both refs cycle, so neither lands on a concrete shape and
        // the converted parameter map is empty — meaning components
        // never gets a `parameters` key (or `components` itself is
        // absent when nothing else populates it). Crucially, no
        // junk `{ $ref }` envelope reaches the output.
        const components = result.components as
            | Record<string, unknown>
            | undefined;
        const params = components?.parameters as
            | Record<string, unknown>
            | undefined;
        if (params !== undefined) {
            for (const entry of Object.values(params)) {
                if (typeof entry === "object" && entry !== null) {
                    expect(
                        (entry as Record<string, unknown>).$ref
                    ).toBeUndefined();
                }
            }
        }
    });
});
