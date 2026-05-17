/**
 * Swagger 2.0 `type: "file"` outside `in: formData`.
 *
 * Per the Swagger 2.0 spec, `type: "file"` is only valid for
 * formData parameters. A non-formData parameter declaring
 * `type: "file"` is malformed but real; the normaliser must surface
 * a diagnostic and emit a best-effort fallback rather than synthesise
 * an invalid `{ type: "file" }` schema.
 */

import { describe, it, expect } from "vitest";
import { normaliseOpenApiSchemas } from "../src/core/normalise.ts";
import { detectOpenApiVersion } from "../src/core/version.ts";
import { assertDefined } from "./helpers.ts";
import type { Diagnostic, DiagnosticSink } from "../src/core/diagnostics.ts";

function collect(fn: (sink: DiagnosticSink) => Record<string, unknown>): {
    diagnostics: Diagnostic[];
    result: Record<string, unknown>;
} {
    const diagnostics: Diagnostic[] = [];
    const result = fn((d) => diagnostics.push(d));
    return { diagnostics, result };
}

describe("Swagger 2.0 type: file outside formData", () => {
    it("emits swagger-invalid-file-parameter and falls back to binary string", () => {
        const doc: Record<string, unknown> = {
            swagger: "2.0",
            info: { title: "Test", version: "1.0.0" },
            paths: {
                "/upload": {
                    post: {
                        operationId: "upload",
                        parameters: [
                            {
                                name: "file",
                                in: "query",
                                type: "file",
                            },
                        ],
                        responses: {
                            "200": { description: "ok" },
                        },
                    },
                },
            },
        };

        const version = detectOpenApiVersion(doc);
        const { diagnostics, result } = collect((sink) =>
            normaliseOpenApiSchemas(doc, assertDefined(version, "version"), {
                diagnostics: sink,
            })
        );

        const fileDiag = diagnostics.find(
            (d) => d.code === "swagger-invalid-file-parameter"
        );
        expect(fileDiag).toBeDefined();
        expect(fileDiag?.detail?.name).toBe("file");
        expect(fileDiag?.detail?.in).toBe("query");

        const paths = result.paths as Record<string, unknown>;
        const upload = paths["/upload"] as Record<string, unknown>;
        const post = upload.post as Record<string, unknown>;
        const params = post.parameters as Record<string, unknown>[];
        const param = assertDefined(params[0], "first parameter");
        const schema = param.schema as Record<string, unknown>;
        expect(schema.type).toBe("string");
        expect(schema.format).toBe("binary");
    });

    it("does NOT emit the diagnostic for type: file under in: formData", () => {
        // formData file parameters are valid per the Swagger 2.0 spec
        // and follow the buildFormDataBody path, not normaliseSwaggerParameter
        // — confirm no spurious diagnostic.
        const doc: Record<string, unknown> = {
            swagger: "2.0",
            info: { title: "Test", version: "1.0.0" },
            paths: {
                "/upload": {
                    post: {
                        operationId: "upload",
                        consumes: ["multipart/form-data"],
                        parameters: [
                            {
                                name: "file",
                                in: "formData",
                                type: "file",
                            },
                        ],
                        responses: {
                            "200": { description: "ok" },
                        },
                    },
                },
            },
        };

        const version = detectOpenApiVersion(doc);
        const { diagnostics } = collect((sink) =>
            normaliseOpenApiSchemas(doc, assertDefined(version, "version"), {
                diagnostics: sink,
            })
        );

        const fileDiag = diagnostics.find(
            (d) => d.code === "swagger-invalid-file-parameter"
        );
        expect(fileDiag).toBeUndefined();
    });
});
