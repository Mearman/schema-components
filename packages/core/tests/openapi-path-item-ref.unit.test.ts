/**
 * Multi-hop Path Item `$ref` resolution.
 *
 * The historic resolver only followed a single `$ref` hop into
 * `components/pathItems`. Chains of refs silently rendered nothing.
 * The fix follows up to MAX_PATH_ITEM_REF_HOPS hops with cycle and
 * depth-cap diagnostics.
 */

import { describe, it, expect } from "vitest";
import { resolveOperation } from "../src/openapi/resolve.ts";
import type { Diagnostic, DiagnosticSink } from "../src/core/diagnostics.ts";

describe("Path Item $ref resolution", () => {
    it("follows a two-hop chain through components/pathItems", () => {
        const doc: Record<string, unknown> = {
            openapi: "3.1.0",
            info: { title: "Test", version: "1.0" },
            paths: {
                "/items": { $ref: "#/components/pathItems/First" },
            },
            components: {
                pathItems: {
                    First: { $ref: "#/components/pathItems/Second" },
                    Second: {
                        get: {
                            operationId: "list",
                            responses: { "200": { description: "ok" } },
                        },
                    },
                },
            },
        };
        const resolved = resolveOperation(doc, "/items", "get");
        expect(resolved.operation.operationId).toBe("list");
    });

    it("emits cyclic-path-item-ref for a self-cycling Path Item ref", () => {
        const doc: Record<string, unknown> = {
            openapi: "3.1.0",
            info: { title: "Test", version: "1.0" },
            paths: {
                "/items": { $ref: "#/components/pathItems/Loop" },
            },
            components: {
                pathItems: {
                    Loop: { $ref: "#/components/pathItems/Loop" },
                },
            },
        };
        const diagnostics: Diagnostic[] = [];
        const sink: DiagnosticSink = (d) => diagnostics.push(d);
        // The operation throws because the path item never resolves;
        // catch and verify the diagnostic separately.
        expect(() => {
            resolveOperation(doc, "/items", "get", { diagnostics: sink });
        }).toThrow();
        const cycleDiag = diagnostics.find(
            (d) => d.code === "cyclic-path-item-ref"
        );
        expect(cycleDiag).toBeDefined();
    });

    it("emits path-item-ref-too-deep for a chain exceeding the hop cap", () => {
        const pathItems: Record<string, unknown> = {};
        // Build a chain of 10 refs P0 → P1 → ... → P9 → /target
        for (let i = 0; i < 10; i++) {
            pathItems[`P${String(i)}`] = {
                $ref: `#/components/pathItems/P${String(i + 1)}`,
            };
        }
        pathItems.P10 = {
            get: {
                operationId: "deep",
                responses: { "200": { description: "ok" } },
            },
        };
        const doc: Record<string, unknown> = {
            openapi: "3.1.0",
            info: { title: "Test", version: "1.0" },
            paths: {
                "/items": { $ref: "#/components/pathItems/P0" },
            },
            components: { pathItems },
        };
        const diagnostics: Diagnostic[] = [];
        const sink: DiagnosticSink = (d) => diagnostics.push(d);
        expect(() => {
            resolveOperation(doc, "/items", "get", { diagnostics: sink });
        }).toThrow();
        const tooDeepDiag = diagnostics.find(
            (d) => d.code === "path-item-ref-too-deep"
        );
        expect(tooDeepDiag).toBeDefined();
    });
});
