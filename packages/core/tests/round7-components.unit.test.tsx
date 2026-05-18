/**
 * Round 7 — runtime tests for `openapi/components.tsx` and the helpers
 * its components depend on.
 *
 * Covers:
 *  - `detectOpenApiVersion` returns `undefined` for malformed version
 *    strings instead of fabricating `{ major: NaN, minor: NaN, patch: 0 }`.
 *  - `<ApiParameters>` skips a Parameter Object that declares no
 *    `schema` (or `content`) and emits a `parameter-missing-schema`
 *    diagnostic, rather than substituting a sentinel `{ type: "string" }`.
 *  - Response root metadata is extracted through the canonical
 *    `extractRootMetaFromJson` adapter and so carries `examples` and
 *    `default` alongside the historic `title`/`description` keys.
 */

import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { ApiParameters } from "../src/openapi/components.tsx";
import { detectOpenApiVersion } from "../src/core/version.ts";
import { extractRootMetaFromJson } from "../src/core/adapter.ts";
import type { Diagnostic } from "../src/core/diagnostics.ts";

// ---------------------------------------------------------------------------
// detectOpenApiVersion — malformed strings return undefined
// ---------------------------------------------------------------------------

describe("detectOpenApiVersion (round 7)", () => {
    it("returns undefined for a malformed `openapi` string", () => {
        const result = detectOpenApiVersion({ openapi: "v3" });
        expect(result).toBeUndefined();
    });

    it("returns undefined when the minor segment fails to parse", () => {
        const result = detectOpenApiVersion({ openapi: "3.x.0" });
        expect(result).toBeUndefined();
    });

    it("returns undefined when the swagger string is empty", () => {
        const result = detectOpenApiVersion({ swagger: "" });
        expect(result).toBeUndefined();
    });

    it("parses a complete OpenAPI 3.1.0 string", () => {
        const result = detectOpenApiVersion({ openapi: "3.1.0" });
        expect(result).toStrictEqual({ major: 3, minor: 1, patch: 0 });
    });

    it("defaults patch to 0 when omitted but rejects missing minor", () => {
        expect(detectOpenApiVersion({ openapi: "3.1" })).toStrictEqual({
            major: 3,
            minor: 1,
            patch: 0,
        });
        expect(detectOpenApiVersion({ openapi: "3" })).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// <ApiParameters> — parameter-missing-schema diagnostic
// ---------------------------------------------------------------------------

describe("ApiParameters (round 7)", () => {
    it("emits parameter-missing-schema and skips render when schema is absent", () => {
        const diagnostics: Diagnostic[] = [];
        const doc = {
            openapi: "3.1.0",
            info: { title: "Schema-less parameter", version: "1.0.0" },
            paths: {
                "/items": {
                    get: {
                        parameters: [
                            {
                                name: "limit",
                                in: "query",
                                // intentionally no schema and no content
                                description: "Maximum item count",
                            },
                        ],
                        responses: { "200": { description: "ok" } },
                    },
                },
            },
        };

        const html = renderToString(
            createElement(ApiParameters, {
                schema: doc,
                path: "/items",
                method: "get",
                onDiagnostic: (d) => diagnostics.push(d),
            })
        );

        // The parameter must NOT render (no sentinel `{ type: "string" }`
        // input). The component still renders the surrounding
        // `<section data-parameters>` because the resolver reported a
        // non-empty parameter list — the per-parameter skip surfaces
        // through the diagnostic channel.
        expect(html).not.toContain("data-parameter=");
        const codes = diagnostics.map((d) => d.code);
        expect(codes).toContain("parameter-missing-schema");
        const event = diagnostics.find(
            (d) => d.code === "parameter-missing-schema"
        );
        expect(event?.pointer).toBe("/paths/~1items/get/parameters/limit");
        expect(event?.detail).toMatchObject({
            name: "limit",
            location: "query",
        });
    });
});

// ---------------------------------------------------------------------------
// Root meta extraction — `examples` and `default` are surfaced
// ---------------------------------------------------------------------------

describe("response body root metadata (round 7)", () => {
    it("extractRootMetaFromJson surfaces examples and default", () => {
        // The components.tsx renderer used to call a private
        // extractRootMetaFromSchema that dropped these keys. Replacing
        // the private helper with the canonical adapter export means
        // both are now visible to the walker as root meta.
        const meta = extractRootMetaFromJson({
            title: "Pet",
            description: "A pet",
            examples: [{ id: 1, name: "Rex" }],
            default: { id: 0, name: "Unknown" },
        });
        expect(meta).toBeDefined();
        expect(meta?.title).toBe("Pet");
        expect(meta?.description).toBe("A pet");
        expect(meta?.examples).toStrictEqual([{ id: 1, name: "Rex" }]);
        expect(meta?.default).toStrictEqual({ id: 0, name: "Unknown" });
    });
});
