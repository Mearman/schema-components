/**
 * Security scheme type validation.
 *
 * The OpenAPI 3.0/3.1 spec defines a closed set of Security Scheme
 * types: apiKey, http, oauth2, openIdConnect, mutualTLS. The parser
 * historically accepted any value silently — a typo like `mutalTLS`
 * would render without warning. Validate the type in `getParsed` and
 * surface a `unknown-security-scheme-type` diagnostic, and render the
 * type with an "(unknown type)" label so authors notice immediately.
 */
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { ApiOperation } from "../src/openapi/components.tsx";
import { getParsed } from "../src/openapi/resolve.ts";
import type { Diagnostic, DiagnosticSink } from "../src/core/diagnostics.ts";

const docWithBadSchemeType = {
    openapi: "3.1.0",
    info: { title: "Test", version: "1.0" },
    paths: {
        "/items": {
            get: {
                operationId: "list",
                security: [{ broken: [] }],
                responses: { "200": { description: "ok" } },
            },
        },
    },
    components: {
        securitySchemes: {
            broken: { type: "mutalTLS" },
        },
    },
};

describe("Security scheme type validation", () => {
    it("emits unknown-security-scheme-type for typoed type values", () => {
        const diagnostics: Diagnostic[] = [];
        const sink: DiagnosticSink = (d) => diagnostics.push(d);
        getParsed(docWithBadSchemeType, { diagnostics: sink });
        const diag = diagnostics.find(
            (d) => d.code === "unknown-security-scheme-type"
        );
        expect(diag).toBeDefined();
        expect(diag?.detail?.name).toBe("broken");
        expect(diag?.detail?.type).toBe("mutalTLS");
    });

    it("does not emit the diagnostic for valid types including mutualTLS", () => {
        const doc = {
            openapi: "3.1.0",
            info: { title: "Test", version: "1.0" },
            paths: {},
            components: {
                securitySchemes: {
                    mtls: { type: "mutualTLS" },
                    apikey: { type: "apiKey", name: "X-Key", in: "header" },
                },
            },
        };
        const diagnostics: Diagnostic[] = [];
        const sink: DiagnosticSink = (d) => diagnostics.push(d);
        getParsed(doc, { diagnostics: sink });
        expect(
            diagnostics.find((d) => d.code === "unknown-security-scheme-type")
        ).toBeUndefined();
    });

    it("renders unknown type with an explicit label in the UI", () => {
        const html = renderToString(
            createElement(ApiOperation, {
                schema: docWithBadSchemeType,
                path: "/items",
                method: "get",
            })
        );
        expect(html).toContain("(unknown type)");
        expect(html).toContain("data-security-type-unknown");
    });
});
