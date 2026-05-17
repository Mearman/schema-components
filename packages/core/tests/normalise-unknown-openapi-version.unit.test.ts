/**
 * Tests for the `unknown-openapi-version` diagnostic emitted by
 * `normaliseOpenApiSchemas` when the document declares a version that
 * does not match any of the supported dispatch paths (Swagger 2.0,
 * OpenAPI 3.0.x, OpenAPI 3.1.x).
 */
import { describe, it, expect } from "vitest";
import { normaliseOpenApiSchemas } from "../src/core/normalise.ts";
import { detectOpenApiVersion } from "../src/core/version.ts";
import type { Diagnostic } from "../src/core/diagnostics.ts";

function collect(): {
    diagnostics: Diagnostic[];
    sink: (d: Diagnostic) => void;
} {
    const diagnostics: Diagnostic[] = [];
    return {
        diagnostics,
        sink: (d: Diagnostic) => {
            diagnostics.push(d);
        },
    };
}

describe("unknown-openapi-version diagnostic", () => {
    it("emits the diagnostic for a Swagger 1.2 document", () => {
        const doc = {
            swagger: "1.2",
            info: { title: "T", version: "1" },
            paths: {},
        };
        const version = detectOpenApiVersion(doc);
        if (version === undefined) {
            expect.unreachable("expected a parsed version");
            return;
        }
        const { diagnostics, sink } = collect();
        normaliseOpenApiSchemas(doc, version, { diagnostics: sink });
        const unknown = diagnostics.filter(
            (d) => d.code === "unknown-openapi-version"
        );
        expect(unknown.length).toBe(1);
        const diag = unknown[0];
        if (diag === undefined) throw new Error("expected diagnostic");
        expect(diag.detail?.version).toBe("1.2");
        expect(diag.detail?.major).toBe(1);
        expect(diag.detail?.minor).toBe(2);
        expect(diag.pointer).toBe("/swagger");
    });

    it("emits the diagnostic for an OpenAPI 3.2 document", () => {
        const doc = {
            openapi: "3.2.0",
            info: { title: "T", version: "1" },
            paths: {},
        };
        const version = detectOpenApiVersion(doc);
        if (version === undefined) {
            expect.unreachable("expected a parsed version");
            return;
        }
        const { diagnostics, sink } = collect();
        normaliseOpenApiSchemas(doc, version, { diagnostics: sink });
        const unknown = diagnostics.filter(
            (d) => d.code === "unknown-openapi-version"
        );
        expect(unknown.length).toBe(1);
        const diag = unknown[0];
        if (diag === undefined) throw new Error("expected diagnostic");
        expect(diag.detail?.version).toBe("3.2.0");
        expect(diag.detail?.major).toBe(3);
        expect(diag.detail?.minor).toBe(2);
        expect(diag.pointer).toBe("/openapi");
    });

    it("emits the diagnostic for an OpenAPI 4.0 document", () => {
        const doc = {
            openapi: "4.0.0",
            info: { title: "T", version: "1" },
            paths: {},
        };
        const version = detectOpenApiVersion(doc);
        if (version === undefined) {
            expect.unreachable("expected a parsed version");
            return;
        }
        const { diagnostics, sink } = collect();
        normaliseOpenApiSchemas(doc, version, { diagnostics: sink });
        const unknown = diagnostics.filter(
            (d) => d.code === "unknown-openapi-version"
        );
        expect(unknown.length).toBe(1);
        const diag = unknown[0];
        if (diag === undefined) throw new Error("expected diagnostic");
        expect(diag.detail?.version).toBe("4.0.0");
        expect(diag.detail?.major).toBe(4);
        expect(diag.pointer).toBe("/openapi");
    });

    it("does not emit the diagnostic for OpenAPI 3.1.0", () => {
        const doc = {
            openapi: "3.1.0",
            info: { title: "T", version: "1" },
            paths: {},
        };
        const { diagnostics, sink } = collect();
        normaliseOpenApiSchemas(
            doc,
            { major: 3, minor: 1, patch: 0 },
            { diagnostics: sink }
        );
        expect(
            diagnostics.filter((d) => d.code === "unknown-openapi-version")
                .length
        ).toBe(0);
    });

    it("does not emit the diagnostic for OpenAPI 3.0.3", () => {
        const doc = {
            openapi: "3.0.3",
            info: { title: "T", version: "1" },
            paths: {},
        };
        const { diagnostics, sink } = collect();
        normaliseOpenApiSchemas(
            doc,
            { major: 3, minor: 0, patch: 3 },
            { diagnostics: sink }
        );
        expect(
            diagnostics.filter((d) => d.code === "unknown-openapi-version")
                .length
        ).toBe(0);
    });

    it("does not emit the diagnostic for Swagger 2.0", () => {
        const doc = {
            swagger: "2.0",
            info: { title: "T", version: "1" },
            paths: {},
        };
        const { diagnostics, sink } = collect();
        normaliseOpenApiSchemas(
            doc,
            { major: 2, minor: 0, patch: 0 },
            { diagnostics: sink }
        );
        expect(
            diagnostics.filter((d) => d.code === "unknown-openapi-version")
                .length
        ).toBe(0);
    });
});
