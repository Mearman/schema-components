/**
 * Tests for the doc-not-object diagnostic in the OpenAPI components.
 *
 * Replaces the historic `toDoc` silent `{}` fallback — components must
 * now surface a diagnostic and render `null` when the `schema` prop is
 * not a plain object.
 */
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import {
    ApiOperation,
    ApiParameters,
    ApiRequestBody,
    ApiResponse,
} from "../src/openapi/components.tsx";
import type { Diagnostic } from "../src/core/diagnostics.ts";

function collectFor(element: () => unknown): {
    html: string;
    diagnostics: Diagnostic[];
} {
    const diagnostics: Diagnostic[] = [];
    const html = renderToString(element() as ReturnType<typeof createElement>);
    return { html, diagnostics };
}

describe("doc-not-object diagnostic", () => {
    it("ApiOperation returns null for string input and emits diagnostic", () => {
        const diagnostics: Diagnostic[] = [];
        const html = renderToString(
            createElement(ApiOperation, {
                schema: "not an object",
                path: "/pets",
                method: "get",
                onDiagnostic: (d) => diagnostics.push(d),
            })
        );
        expect(html).toBe("");
        expect(diagnostics.length).toBe(1);
        expect(diagnostics[0]?.code).toBe("doc-not-object");
    });

    it("ApiParameters returns null for null input and emits diagnostic", () => {
        const diagnostics: Diagnostic[] = [];
        const html = renderToString(
            createElement(ApiParameters, {
                schema: null,
                path: "/pets",
                method: "get",
                onDiagnostic: (d) => diagnostics.push(d),
            })
        );
        expect(html).toBe("");
        expect(diagnostics.length).toBe(1);
        expect(diagnostics[0]?.code).toBe("doc-not-object");
    });

    it("ApiRequestBody returns null for array input and emits diagnostic", () => {
        const diagnostics: Diagnostic[] = [];
        const html = renderToString(
            createElement(ApiRequestBody, {
                schema: [1, 2, 3],
                path: "/pets",
                method: "post",
                onDiagnostic: (d) => diagnostics.push(d),
            })
        );
        expect(html).toBe("");
        expect(diagnostics.length).toBe(1);
        expect(diagnostics[0]?.code).toBe("doc-not-object");
    });

    it("ApiResponse returns null for undefined input and emits diagnostic", () => {
        const diagnostics: Diagnostic[] = [];
        const html = renderToString(
            createElement(ApiResponse, {
                schema: undefined,
                path: "/pets",
                method: "get",
                status: "200",
                onDiagnostic: (d) => diagnostics.push(d),
            })
        );
        expect(html).toBe("");
        expect(diagnostics.length).toBe(1);
        expect(diagnostics[0]?.code).toBe("doc-not-object");
    });

    it("strict mode throws SchemaNormalisationError for non-object input", () => {
        // collectFor is unused for this case — the render call itself throws.
        expect(() => {
            renderToString(
                createElement(ApiOperation, {
                    schema: 42,
                    path: "/pets",
                    method: "get",
                    strict: true,
                })
            );
        }).toThrow(/doc-not-object/);
        // Reference collectFor so the helper stays exercised.
        const { html } = collectFor(() => null);
        expect(html).toBe("");
    });
});
