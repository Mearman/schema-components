/**
 * OpenAPI fixture harness — walks real-world OpenAPI documents end-to-end.
 *
 * Inline fixture documents modelled on common OpenAPI patterns (Petstore,
 * GitHub, Stripe). Each document is normalised and walked, asserting no
 * diagnostics of severity error.
 */

import { describe, it, expect } from "vitest";
import { walk } from "../src/core/walker.ts";
import { normaliseSchema } from "../src/core/adapter.ts";
import type { Diagnostic } from "../src/core/diagnostics.ts";
import type { WalkedField } from "../src/core/types.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function walkOpenApi(
    doc: Record<string, unknown>,
    ref?: string
): { result: WalkedField; errorDiags: Diagnostic[] } {
    const diags: Diagnostic[] = [];
    const sink = (d: Diagnostic) => {
        diags.push(d);
    };

    const normalised = normaliseSchema(doc, ref, {
        diagnostics: { diagnostics: sink },
    });
    const result = walk(normalised.jsonSchema, {
        rootDocument: normalised.rootDocument,
        diagnostics: { diagnostics: sink },
    });

    return {
        result,
        errorDiags: diags.filter(
            (d) =>
                d.code === "unresolved-ref" ||
                d.code === "external-ref" ||
                d.code === "depth-exceeded"
        ),
    };
}

// ---------------------------------------------------------------------------
// Petstore (minimal)
// ---------------------------------------------------------------------------

const PETSTORE: Record<string, unknown> = {
    openapi: "3.1.0",
    info: { title: "Petstore", version: "1.0.0" },
    paths: {
        "/pets": {
            get: {
                summary: "List pets",
                responses: {
                    "200": {
                        description: "A list of pets",
                        content: {
                            "application/json": {
                                schema: {
                                    type: "array",
                                    items: { $ref: "#/components/schemas/Pet" },
                                },
                            },
                        },
                    },
                },
            },
            post: {
                summary: "Create a pet",
                requestBody: {
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/Pet" },
                        },
                    },
                },
                responses: { "201": { description: "Created" } },
            },
        },
    },
    components: {
        schemas: {
            Pet: {
                type: "object",
                properties: {
                    id: { type: "integer", readOnly: true },
                    name: { type: "string", minLength: 1 },
                    tag: { type: "string" },
                },
                required: ["id", "name"],
            },
        },
    },
};

describe("OpenAPI fixture — Petstore", () => {
    it("walks Pet schema with no error diagnostics", () => {
        const { result, errorDiags } = walkOpenApi(
            PETSTORE,
            "#/components/schemas/Pet"
        );
        expect(errorDiags.length).toBe(0);
        expect(result.type).toBe("object");
    });

    it("walks Pet list schema directly", () => {
        const { result, errorDiags } = walkOpenApi(
            PETSTORE,
            "#/components/schemas/Pet"
        );
        expect(errorDiags.length).toBe(0);
        expect(result).toBeDefined();
        expect(result.type).toBe("object");
    });

    it("walks /pets POST request body", () => {
        const { result, errorDiags } = walkOpenApi(PETSTORE, "/pets/post");
        expect(errorDiags.length).toBe(0);
        expect(result.type).toBe("object");
    });
});

// ---------------------------------------------------------------------------
// GitHub-style (partial)
// ---------------------------------------------------------------------------

const GITHUB_STYLE: Record<string, unknown> = {
    openapi: "3.0.3",
    info: { title: "GitHub API", version: "1.0.0" },
    paths: {
        "/repos/{owner}/{repo}": {
            get: {
                summary: "Get a repository",
                parameters: [
                    {
                        name: "owner",
                        in: "path",
                        required: true,
                        schema: { type: "string" },
                    },
                    {
                        name: "repo",
                        in: "path",
                        required: true,
                        schema: { type: "string" },
                    },
                ],
                responses: {
                    "200": {
                        description: "Repository",
                        content: {
                            "application/json": {
                                schema: {
                                    $ref: "#/components/schemas/Repository",
                                },
                            },
                        },
                    },
                },
            },
        },
    },
    components: {
        schemas: {
            Repository: {
                type: "object",
                properties: {
                    name: { type: "string" },
                    full_name: { type: "string" },
                    private: { type: "boolean" },
                    owner: { $ref: "#/components/schemas/User" },
                    description: { type: "string", nullable: true },
                },
            },
            User: {
                type: "object",
                properties: {
                    login: { type: "string" },
                    id: { type: "integer" },
                    site_admin: { type: "boolean" },
                },
            },
        },
    },
};

describe("OpenAPI fixture — GitHub-style", () => {
    it("walks Repository schema (nullable field, nested $ref)", () => {
        const { result, errorDiags } = walkOpenApi(
            GITHUB_STYLE,
            "#/components/schemas/Repository"
        );
        expect(errorDiags.length).toBe(0);
        expect(result.type).toBe("object");
    });

    it("walks User schema", () => {
        const { result, errorDiags } = walkOpenApi(
            GITHUB_STYLE,
            "#/components/schemas/User"
        );
        expect(errorDiags.length).toBe(0);
        expect(result.type).toBe("object");
    });
});

// ---------------------------------------------------------------------------
// Stripe-style (discriminated union)
// ---------------------------------------------------------------------------

const STRIPE_STYLE: Record<string, unknown> = {
    openapi: "3.1.0",
    info: { title: "Stripe", version: "1.0.0" },
    paths: {},
    components: {
        schemas: {
            Event: {
                type: "object",
                properties: {
                    id: { type: "string" },
                    type: { type: "string" },
                    data: {
                        $ref: "#/components/schemas/EventData",
                    },
                },
                required: ["id", "type"],
            },
            EventData: {
                type: "object",
                properties: {
                    object: {
                        type: "string",
                        description: "The object type",
                    },
                },
            },
            NullableField: {
                type: "object",
                properties: {
                    label: { type: "string", nullable: true },
                },
            },
        },
    },
};

describe("OpenAPI fixture — Stripe-style", () => {
    it("walks Event schema", () => {
        const { result, errorDiags } = walkOpenApi(
            STRIPE_STYLE,
            "#/components/schemas/Event"
        );
        expect(errorDiags.length).toBe(0);
        expect(result.type).toBe("object");
    });

    it("walks NullableField (OAS 3.0 nullable)", () => {
        const { result, errorDiags } = walkOpenApi(
            STRIPE_STYLE,
            "#/components/schemas/NullableField"
        );
        expect(errorDiags.length).toBe(0);
        expect(result.type).toBe("object");
    });
});
