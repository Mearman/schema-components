/**
 * Tests for ExternalResolver wiring through the walker.
 *
 * Verifies that a sync external resolver can resolve external $ref URIs
 * inline, and that missing resolvers still produce the existing
 * external-ref diagnostic.
 */

import { describe, it, expect } from "vitest";
import { walk } from "../src/core/walker.ts";
import type { Diagnostic } from "../src/core/diagnostics.ts";

// ---------------------------------------------------------------------------
// Sync external resolver
// ---------------------------------------------------------------------------

describe("sync external resolver", () => {
    it("resolves external $ref via sync resolver", () => {
        const externalDoc = {
            $defs: {
                Address: {
                    type: "object",
                    properties: {
                        city: { type: "string" },
                    },
                },
            },
        };

        const schema = {
            type: "object",
            properties: {
                address: {
                    $ref: "https://example.com/schemas/common.json#/$defs/Address",
                },
            },
        };

        const tree = walk(schema, {
            rootDocument: schema,
            externalResolver: (uri: string) => {
                if (uri === "https://example.com/schemas/common.json") {
                    return externalDoc;
                }
                return undefined;
            },
        });

        expect(tree.type).toBe("object");
        if (tree.type !== "object") return;

        const address = tree.fields.address;
        expect(address).toBeDefined();
        if (address === undefined) return;
        expect(address.type).toBe("object");
        if (address.type !== "object") return;
        expect(address.fields.city).toBeDefined();
        if (address.fields.city === undefined) return;
        expect(address.fields.city.type).toBe("string");
    });

    it("emits external-ref diagnostic when resolver returns undefined", () => {
        const diags: Diagnostic[] = [];
        const schema = {
            type: "object",
            properties: {
                foo: { $ref: "https://example.com/missing.json#" },
            },
        };

        walk(schema, {
            rootDocument: schema,
            diagnostics: {
                diagnostics: (d: Diagnostic) => {
                    diags.push(d);
                },
            },
            externalResolver: () => undefined,
        });

        const external = diags.filter((d) => d.code === "external-ref");
        expect(external.length).toBeGreaterThan(0);
    });

    it("handles cross-file cycles gracefully (no infinite loop)", () => {
        const schemaA = {
            type: "object",
            properties: {
                b: { $ref: "file:///b.json#" },
            },
        };
        const schemaB = {
            type: "object",
            properties: {
                a: { $ref: "file:///a.json#" },
            },
        };

        const docs: Record<string, unknown> = {
            "file:///a.json": schemaA,
            "file:///b.json": schemaB,
        };

        // The walk should complete without infinite recursion.
        // The $ref cache handles cycles by returning placeholders.
        const tree = walk(schemaA, {
            rootDocument: schemaA,
            externalResolver: (uri: string) => {
                return docs[uri];
            },
        });

        expect(tree.type).toBe("object");
    });

    it("resolves without external resolver for internal refs", () => {
        const schema = {
            type: "object",
            properties: {
                name: { $ref: "#/$defs/Name" },
            },
            $defs: {
                Name: { type: "string" },
            },
        };

        const tree = walk(schema, { rootDocument: schema });
        expect(tree.type).toBe("object");
        if (tree.type !== "object") return;
        const name = tree.fields.name;
        expect(name).toBeDefined();
        if (name === undefined) return;
        expect(name.type).toBe("string");
    });
});
