/**
 * Tests for JSON Schema draft and OpenAPI version detection.
 */
import { describe, it, expect } from "vitest";
import {
    detectJsonSchemaDraft,
    detectOpenApiVersion,
    inferJsonSchemaDraft,
    inferJsonSchemaDraftWithReason,
    isOpenApi30,
    isOpenApi31,
    isSwagger2,
    readJsonSchemaDialect,
} from "../src/core/version.ts";
import { walk } from "../src/core/walker.ts";
import { normaliseSchema } from "../src/core/adapter.ts";
import { normaliseOpenApiSchemas } from "../src/core/normalise.ts";
import type { Diagnostic } from "../src/core/diagnostics.ts";

// ---------------------------------------------------------------------------
// detectJsonSchemaDraft
// ---------------------------------------------------------------------------

describe("detectJsonSchemaDraft", () => {
    it("detects Draft 2020-12", () => {
        expect(
            detectJsonSchemaDraft({
                $schema: "https://json-schema.org/draft/2020-12/schema",
            })
        ).toBe("draft-2020-12");
    });

    it("detects Draft 2019-09", () => {
        expect(
            detectJsonSchemaDraft({
                $schema: "https://json-schema.org/draft/2019-09/schema",
            })
        ).toBe("draft-2019-09");
    });

    it("detects Draft 07", () => {
        expect(
            detectJsonSchemaDraft({
                $schema: "http://json-schema.org/draft-07/schema#",
            })
        ).toBe("draft-07");
    });

    it("detects Draft 07 with https", () => {
        expect(
            detectJsonSchemaDraft({
                $schema: "https://json-schema.org/draft-07/schema#",
            })
        ).toBe("draft-07");
    });

    it("detects Draft 06", () => {
        expect(
            detectJsonSchemaDraft({
                $schema: "http://json-schema.org/draft-06/schema#",
            })
        ).toBe("draft-06");
    });

    it("detects Draft 04", () => {
        expect(
            detectJsonSchemaDraft({
                $schema: "http://json-schema.org/draft-04/schema#",
            })
        ).toBe("draft-04");
    });

    it("falls back to heuristic when $schema is absent", () => {
        // has `if` → Draft 07
        expect(
            detectJsonSchemaDraft({
                type: "string",
                if: { minLength: 1 },
            })
        ).toBe("draft-07");
    });

    it("defaults to draft-2020-12 when $schema is not a string", () => {
        expect(detectJsonSchemaDraft({ $schema: 42 })).toBe("draft-2020-12");
    });

    it("defaults to draft-2020-12 for unknown $schema URIs", () => {
        expect(
            detectJsonSchemaDraft({ $schema: "http://example.com/unknown" })
        ).toBe("draft-2020-12");
    });
});

// ---------------------------------------------------------------------------
// inferJsonSchemaDraft
// ---------------------------------------------------------------------------

describe("inferJsonSchemaDraft", () => {
    it("infers Draft 2020-12 from $dynamicRef", () => {
        expect(inferJsonSchemaDraft({ $dynamicRef: "#Foo" })).toBe(
            "draft-2020-12"
        );
    });

    it("infers Draft 2020-12 from $dynamicAnchor", () => {
        expect(inferJsonSchemaDraft({ $dynamicAnchor: "Foo" })).toBe(
            "draft-2020-12"
        );
    });

    it("infers Draft 2020-12 from prefixItems", () => {
        expect(inferJsonSchemaDraft({ prefixItems: [] })).toBe("draft-2020-12");
    });

    it("infers Draft 2019-09 from $recursiveRef", () => {
        expect(inferJsonSchemaDraft({ $recursiveRef: "#" })).toBe(
            "draft-2019-09"
        );
    });

    it("infers Draft 2019-09 from $recursiveAnchor", () => {
        expect(inferJsonSchemaDraft({ $recursiveAnchor: true })).toBe(
            "draft-2019-09"
        );
    });

    it("infers Draft 2019-09 from unevaluatedProperties", () => {
        expect(inferJsonSchemaDraft({ unevaluatedProperties: false })).toBe(
            "draft-2019-09"
        );
    });

    it("infers Draft 2019-09 from unevaluatedItems", () => {
        expect(inferJsonSchemaDraft({ unevaluatedItems: false })).toBe(
            "draft-2019-09"
        );
    });

    it("infers Draft 07 from if/then/else", () => {
        expect(inferJsonSchemaDraft({ if: {}, then: {} })).toBe("draft-07");
    });

    it("infers Draft 07 from contentEncoding", () => {
        expect(inferJsonSchemaDraft({ contentEncoding: "base64" })).toBe(
            "draft-07"
        );
    });

    it("infers Draft 07 from contentMediaType", () => {
        expect(
            inferJsonSchemaDraft({ contentMediaType: "application/json" })
        ).toBe("draft-07");
    });

    it("infers Draft 06 from const", () => {
        expect(inferJsonSchemaDraft({ const: "active" })).toBe("draft-06");
    });

    it("infers Draft 06 from propertyNames", () => {
        expect(inferJsonSchemaDraft({ propertyNames: {} })).toBe("draft-06");
    });

    it("infers Draft 06 from examples array", () => {
        expect(inferJsonSchemaDraft({ examples: ["foo", "bar"] })).toBe(
            "draft-06"
        );
    });

    it("does not infer Draft 06 from non-array examples", () => {
        expect(inferJsonSchemaDraft({ examples: "not-array" })).toBe(
            "draft-2020-12"
        );
    });

    it("infers Draft 04 from boolean exclusiveMinimum", () => {
        expect(
            inferJsonSchemaDraft({ minimum: 0, exclusiveMinimum: true })
        ).toBe("draft-04");
    });

    it("infers Draft 04 from boolean exclusiveMaximum", () => {
        expect(
            inferJsonSchemaDraft({ maximum: 10, exclusiveMaximum: true })
        ).toBe("draft-04");
    });

    it("infers Draft 04 from bare id (no $id)", () => {
        expect(inferJsonSchemaDraft({ id: "MySchema" })).toBe("draft-04");
    });

    it("does not infer Draft 04 when both id and $id present", () => {
        expect(inferJsonSchemaDraft({ id: "X", $id: "Y" })).toBe(
            "draft-2020-12"
        );
    });

    it("defaults to draft-2020-12 when no keywords match", () => {
        expect(inferJsonSchemaDraft({ type: "string" })).toBe("draft-2020-12");
    });
});

// ---------------------------------------------------------------------------
// inferJsonSchemaDraftWithReason
// ---------------------------------------------------------------------------

describe("inferJsonSchemaDraftWithReason", () => {
    it("returns inference reason for prefixItems", () => {
        const result = inferJsonSchemaDraftWithReason({ prefixItems: [] });
        expect(result.draft).toBe("draft-2020-12");
        expect(result.inferredFrom).toBe(
            "dynamic-ref-or-anchor-or-prefixItems"
        );
    });

    it("returns no-signal for empty schema", () => {
        const result = inferJsonSchemaDraftWithReason({});
        expect(result.draft).toBe("draft-2020-12");
        expect(result.inferredFrom).toBe("no-signal");
    });

    it("returns reason for boolean exclusiveMinimum", () => {
        const result = inferJsonSchemaDraftWithReason({
            exclusiveMinimum: true,
        });
        expect(result.draft).toBe("draft-04");
        expect(result.inferredFrom).toBe("boolean-exclusive-min-max");
    });
});

// ---------------------------------------------------------------------------
// assumed-draft diagnostic
// ---------------------------------------------------------------------------

describe("assumed-draft diagnostic", () => {
    it("emits assumed-draft diagnostic when schema has no $schema", () => {
        const diags: Diagnostic[] = [];
        normaliseSchema({ type: "string", if: { minLength: 1 } }, undefined, {
            diagnostics: {
                diagnostics: (d: Diagnostic) => {
                    diags.push(d);
                },
            },
        });
        const assumed = diags.filter((d) => d.code === "assumed-draft");
        expect(assumed.length).toBe(1);
        const diag = assumed[0];
        if (diag === undefined) throw new Error("expected assumed-draft");
        expect(diag.detail?.draft).toBe("draft-07");
        expect(diag.detail?.inferredFrom).toBe("if-then-else");
    });

    it("does not emit assumed-draft when $schema is present", () => {
        const diags: Diagnostic[] = [];
        normaliseSchema(
            {
                $schema: "http://json-schema.org/draft-07/schema#",
                type: "string",
            },
            undefined,
            {
                diagnostics: {
                    diagnostics: (d: Diagnostic) => {
                        diags.push(d);
                    },
                },
            }
        );
        const assumed = diags.filter((d) => d.code === "assumed-draft");
        expect(assumed.length).toBe(0);
    });

    it("uses heuristic result for normalisation", () => {
        // Draft 04 with boolean exclusiveMinimum but no $schema
        const result = normaliseSchema({
            type: "number",
            minimum: 0,
            exclusiveMinimum: true,
        });
        const tree = walk(result.jsonSchema, {
            rootDocument: result.rootDocument,
        });
        // Should be normalised: exclusiveMinimum: true + minimum: 0 → exclusiveMinimum: 0
        if (tree.type !== "number") {
            expect.unreachable("Expected number field");
            return;
        }
        expect(tree.constraints.exclusiveMinimum).toBe(0);
        expect(tree.constraints.minimum).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// detectOpenApiVersion
// ---------------------------------------------------------------------------

describe("detectOpenApiVersion", () => {
    it("detects OpenAPI 3.1.0", () => {
        const version = detectOpenApiVersion({ openapi: "3.1.0" });
        expect(version).toStrictEqual({ major: 3, minor: 1, patch: 0 });
    });

    it("detects OpenAPI 3.0.3", () => {
        const version = detectOpenApiVersion({ openapi: "3.0.3" });
        expect(version).toStrictEqual({ major: 3, minor: 0, patch: 3 });
    });

    it("detects OpenAPI 3.0.0", () => {
        const version = detectOpenApiVersion({ openapi: "3.0.0" });
        expect(version).toStrictEqual({ major: 3, minor: 0, patch: 0 });
    });

    it("detects Swagger 2.0", () => {
        const version = detectOpenApiVersion({ swagger: "2.0" });
        expect(version).toStrictEqual({ major: 2, minor: 0, patch: 0 });
    });

    it("returns undefined for plain JSON Schema", () => {
        expect(detectOpenApiVersion({ type: "object" })).toBe(undefined);
    });

    it("returns undefined for empty object", () => {
        expect(detectOpenApiVersion({})).toBe(undefined);
    });
});

// ---------------------------------------------------------------------------
// Version type guards
// ---------------------------------------------------------------------------

describe("readJsonSchemaDialect", () => {
    it("returns absent when the keyword is missing", () => {
        const result = readJsonSchemaDialect({
            openapi: "3.1.0",
            info: { title: "T", version: "1" },
            paths: {},
        });
        expect(result.kind).toBe("absent");
    });

    it("returns absent when the keyword is not a string", () => {
        const result = readJsonSchemaDialect({
            openapi: "3.1.0",
            jsonSchemaDialect: 42,
        });
        expect(result.kind).toBe("absent");
    });

    it("returns known for the Draft 2020-12 dialect URI", () => {
        const uri = "https://json-schema.org/draft/2020-12/schema";
        const result = readJsonSchemaDialect({
            openapi: "3.1.0",
            jsonSchemaDialect: uri,
        });
        if (result.kind !== "known") {
            expect.unreachable(`expected known dialect, got ${result.kind}`);
            return;
        }
        expect(result.draft).toBe("draft-2020-12");
        expect(result.uri).toBe(uri);
    });

    it("returns known for the Draft 2019-09 dialect URI", () => {
        const uri = "https://json-schema.org/draft/2019-09/schema";
        const result = readJsonSchemaDialect({
            openapi: "3.1.0",
            jsonSchemaDialect: uri,
        });
        if (result.kind !== "known") {
            expect.unreachable(`expected known dialect, got ${result.kind}`);
            return;
        }
        expect(result.draft).toBe("draft-2019-09");
    });

    it("returns unknown for a URI that does not match any supported draft", () => {
        const uri = "https://example.com/dialects/custom";
        const result = readJsonSchemaDialect({
            openapi: "3.1.0",
            jsonSchemaDialect: uri,
        });
        if (result.kind !== "unknown") {
            expect.unreachable(`expected unknown dialect, got ${result.kind}`);
            return;
        }
        expect(result.uri).toBe(uri);
    });
});

describe("unknown-json-schema-dialect diagnostic", () => {
    it("emits the diagnostic for an unknown jsonSchemaDialect URI in OAS 3.1", () => {
        const diags: Diagnostic[] = [];
        normaliseOpenApiSchemas(
            {
                openapi: "3.1.0",
                jsonSchemaDialect: "https://example.com/dialects/custom",
                info: { title: "T", version: "1" },
                paths: {},
            },
            { major: 3, minor: 1, patch: 0 },
            {
                diagnostics: (d: Diagnostic) => {
                    diags.push(d);
                },
            }
        );
        const dialect = diags.filter(
            (d) => d.code === "unknown-json-schema-dialect"
        );
        expect(dialect.length).toBe(1);
        const diag = dialect[0];
        if (diag === undefined) throw new Error("expected diagnostic");
        expect(diag.pointer).toBe("/jsonSchemaDialect");
        expect(diag.detail?.uri).toBe("https://example.com/dialects/custom");
    });

    it("does not emit the diagnostic when jsonSchemaDialect is absent", () => {
        const diags: Diagnostic[] = [];
        normaliseOpenApiSchemas(
            {
                openapi: "3.1.0",
                info: { title: "T", version: "1" },
                paths: {},
            },
            { major: 3, minor: 1, patch: 0 },
            {
                diagnostics: (d: Diagnostic) => {
                    diags.push(d);
                },
            }
        );
        expect(
            diags.filter((d) => d.code === "unknown-json-schema-dialect").length
        ).toBe(0);
    });

    it("does not emit the diagnostic for a known jsonSchemaDialect URI", () => {
        const diags: Diagnostic[] = [];
        normaliseOpenApiSchemas(
            {
                openapi: "3.1.0",
                jsonSchemaDialect:
                    "https://json-schema.org/draft/2020-12/schema",
                info: { title: "T", version: "1" },
                paths: {},
            },
            { major: 3, minor: 1, patch: 0 },
            {
                diagnostics: (d: Diagnostic) => {
                    diags.push(d);
                },
            }
        );
        expect(
            diags.filter((d) => d.code === "unknown-json-schema-dialect").length
        ).toBe(0);
    });

    it("does not emit the diagnostic for OpenAPI 3.0 documents", () => {
        const diags: Diagnostic[] = [];
        // 3.0 doesn't define jsonSchemaDialect — if present, it's a
        // foreign keyword and the 3.0 normaliser should ignore it.
        normaliseOpenApiSchemas(
            {
                openapi: "3.0.3",
                jsonSchemaDialect: "https://example.com/dialects/custom",
                info: { title: "T", version: "1" },
                paths: {},
            },
            { major: 3, minor: 0, patch: 3 },
            {
                diagnostics: (d: Diagnostic) => {
                    diags.push(d);
                },
            }
        );
        expect(
            diags.filter((d) => d.code === "unknown-json-schema-dialect").length
        ).toBe(0);
    });
});

describe("version type guards", () => {
    it("isOpenApi30 identifies 3.0.x", () => {
        expect(isOpenApi30({ major: 3, minor: 0, patch: 3 })).toBe(true);
        expect(isOpenApi30({ major: 3, minor: 0, patch: 0 })).toBe(true);
        expect(isOpenApi30({ major: 3, minor: 1, patch: 0 })).toBe(false);
        expect(isOpenApi30({ major: 2, minor: 0, patch: 0 })).toBe(false);
    });

    it("isOpenApi31 identifies 3.1.x", () => {
        expect(isOpenApi31({ major: 3, minor: 1, patch: 0 })).toBe(true);
        expect(isOpenApi31({ major: 3, minor: 0, patch: 3 })).toBe(false);
    });

    it("isSwagger2 identifies 2.0", () => {
        expect(isSwagger2({ major: 2, minor: 0, patch: 0 })).toBe(true);
        expect(isSwagger2({ major: 3, minor: 0, patch: 0 })).toBe(false);
    });
});
