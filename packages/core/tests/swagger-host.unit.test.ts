/**
 * Swagger 2.0 host/basePath/schemes → servers handling.
 *
 * Per the Swagger 2.0 spec, host is required to form a complete server
 * URL. Absence means "no fixed host"; the historic normaliser
 * fabricated localhost. Likewise basePath absent is "no base path",
 * not "/".
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

describe("Swagger 2.0 server synthesis", () => {
    it("emits swagger-missing-host and skips servers when only schemes is declared", () => {
        const doc: Record<string, unknown> = {
            swagger: "2.0",
            info: { title: "Test", version: "1.0.0" },
            schemes: ["https"],
            paths: {},
        };
        const { result, diagnostics } = collect(doc);
        const diag = diagnostics.find((d) => d.code === "swagger-missing-host");
        expect(diag).toBeDefined();
        expect(result.servers).toBeUndefined();
    });

    it("emits swagger-missing-host and skips servers when only basePath is declared", () => {
        const doc: Record<string, unknown> = {
            swagger: "2.0",
            info: { title: "Test", version: "1.0.0" },
            basePath: "/v1",
            paths: {},
        };
        const { result, diagnostics } = collect(doc);
        const diag = diagnostics.find((d) => d.code === "swagger-missing-host");
        expect(diag).toBeDefined();
        expect(result.servers).toBeUndefined();
    });

    it("does not synthesise a server when host is absent and nothing else is declared", () => {
        const doc: Record<string, unknown> = {
            swagger: "2.0",
            info: { title: "Test", version: "1.0.0" },
            paths: {},
        };
        const { result, diagnostics } = collect(doc);
        expect(result.servers).toBeUndefined();
        // No diagnostic — there was nothing to surface.
        expect(
            diagnostics.find((d) => d.code === "swagger-missing-host")
        ).toBeUndefined();
    });

    it("synthesises a server with no basePath suffix when host is set without basePath", () => {
        const doc: Record<string, unknown> = {
            swagger: "2.0",
            info: { title: "Test", version: "1.0.0" },
            host: "api.example.com",
            paths: {},
        };
        const { result } = collect(doc);
        const servers = result.servers as Record<string, unknown>[];
        expect(servers[0]).toBeDefined();
        expect(servers[0]?.url).toBe("https://api.example.com");
    });

    it("synthesises full URL with host + basePath + scheme", () => {
        const doc: Record<string, unknown> = {
            swagger: "2.0",
            info: { title: "Test", version: "1.0.0" },
            host: "api.example.com",
            basePath: "/v1",
            schemes: ["http"],
            paths: {},
        };
        const { result } = collect(doc);
        const servers = result.servers as Record<string, unknown>[];
        expect(servers[0]?.url).toBe("http://api.example.com/v1");
    });
});
