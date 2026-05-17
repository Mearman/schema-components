/**
 * Swagger 2.0 consumes/produces default handling.
 *
 * Per the Swagger 2.0 spec, absence at BOTH the operation level and
 * the document level means "no body" — NOT an implicit
 * `application/json`. The historic normaliser silently invented
 * `application/json` content for body-less operations. The corrected
 * behaviour:
 *
 * - Operation has no body → no synthesised content, no diagnostic.
 * - Operation has a body but no consumes → synthesise
 *   `application/json` AND emit swagger-missing-consumes.
 * - Response carries a schema but no produces → synthesise
 *   `application/json` AND emit swagger-missing-consumes (the same
 *   code with a "response" detail).
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

describe("Swagger 2.0 consumes/produces", () => {
    it("does not synthesise content for a body-less operation with absent consumes/produces", () => {
        const doc: Record<string, unknown> = {
            swagger: "2.0",
            info: { title: "Test", version: "1.0.0" },
            paths: {
                "/ping": {
                    get: {
                        operationId: "ping",
                        responses: {
                            "204": { description: "No content" },
                        },
                    },
                },
            },
        };
        const { result, diagnostics } = collect(doc);

        // No consumes diagnostic for body-less operation.
        expect(
            diagnostics.find((d) => d.code === "swagger-missing-consumes")
        ).toBeUndefined();

        const paths = result.paths as Record<string, unknown>;
        const ping = paths["/ping"] as Record<string, unknown>;
        const get = ping.get as Record<string, unknown>;
        expect(get.requestBody).toBeUndefined();

        // The 204 response declared no schema; no content should be invented.
        const responses = get.responses as Record<string, unknown>;
        const noContent = responses["204"] as Record<string, unknown>;
        expect(noContent.content).toBeUndefined();
    });

    it("emits swagger-missing-consumes and defaults to application/json when body is present", () => {
        const doc: Record<string, unknown> = {
            swagger: "2.0",
            info: { title: "Test", version: "1.0.0" },
            paths: {
                "/pets": {
                    post: {
                        operationId: "createPet",
                        parameters: [
                            {
                                name: "pet",
                                in: "body",
                                schema: { type: "object" },
                            },
                        ],
                        responses: {
                            "201": { description: "Created" },
                        },
                    },
                },
            },
        };
        const { result, diagnostics } = collect(doc);

        const diag = diagnostics.find(
            (d) => d.code === "swagger-missing-consumes"
        );
        expect(diag).toBeDefined();
        expect(diag?.detail?.level).toBe("operation");

        const paths = result.paths as Record<string, unknown>;
        const pets = paths["/pets"] as Record<string, unknown>;
        const post = pets.post as Record<string, unknown>;
        const requestBody = post.requestBody as Record<string, unknown>;
        const content = requestBody.content as Record<string, unknown>;
        expect(content["application/json"]).toBeDefined();
    });

    it("does NOT emit the diagnostic when consumes is declared at document level", () => {
        const doc: Record<string, unknown> = {
            swagger: "2.0",
            info: { title: "Test", version: "1.0.0" },
            consumes: ["application/xml"],
            paths: {
                "/pets": {
                    post: {
                        operationId: "createPet",
                        parameters: [
                            {
                                name: "pet",
                                in: "body",
                                schema: { type: "object" },
                            },
                        ],
                        responses: {
                            "201": { description: "Created" },
                        },
                    },
                },
            },
        };
        const { result, diagnostics } = collect(doc);

        expect(
            diagnostics.find((d) => d.code === "swagger-missing-consumes")
        ).toBeUndefined();

        const paths = result.paths as Record<string, unknown>;
        const pets = paths["/pets"] as Record<string, unknown>;
        const post = pets.post as Record<string, unknown>;
        const requestBody = post.requestBody as Record<string, unknown>;
        const content = requestBody.content as Record<string, unknown>;
        expect(content["application/xml"]).toBeDefined();
    });

    it("emits swagger-missing-consumes for a response schema without produces", () => {
        const doc: Record<string, unknown> = {
            swagger: "2.0",
            info: { title: "Test", version: "1.0.0" },
            paths: {
                "/pets": {
                    get: {
                        operationId: "listPets",
                        responses: {
                            "200": {
                                description: "ok",
                                schema: { type: "array" },
                            },
                        },
                    },
                },
            },
        };
        const { diagnostics } = collect(doc);

        const diag = diagnostics.find(
            (d) =>
                d.code === "swagger-missing-consumes" &&
                d.detail?.level === "response"
        );
        expect(diag).toBeDefined();
        expect(diag?.detail?.statusCode).toBe("200");
    });

    it("does NOT emit produces diagnostic for response without schema", () => {
        const doc: Record<string, unknown> = {
            swagger: "2.0",
            info: { title: "Test", version: "1.0.0" },
            paths: {
                "/pets": {
                    get: {
                        operationId: "listPets",
                        responses: {
                            "204": { description: "No content" },
                        },
                    },
                },
            },
        };
        const { diagnostics } = collect(doc);

        expect(
            diagnostics.find(
                (d) =>
                    d.code === "swagger-missing-consumes" &&
                    d.detail?.level === "response"
            )
        ).toBeUndefined();
    });
});
