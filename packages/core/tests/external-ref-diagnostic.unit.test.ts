/**
 * Tests for external $ref diagnostic emission.
 *
 * Verifies that external refs without a resolver emit an external-ref
 * diagnostic from the walker.
 */

import { describe, it, expect } from "vitest";
import { walk } from "../src/core/walker.ts";
import type { Diagnostic } from "../src/core/diagnostics.ts";
import { assertDefined } from "./helpers.ts";

describe("external ref diagnostics", () => {
    it("emits external-ref diagnostic when no resolver is provided", () => {
        const diags: Diagnostic[] = [];
        walk(
            { $ref: "https://example.com/schemas/Pet.json#" },
            {
                rootDocument: {},
                diagnostics: {
                    diagnostics: (d: Diagnostic) => {
                        diags.push(d);
                    },
                },
            }
        );

        const external = diags.filter((d) => d.code === "external-ref");
        expect(external.length).toBe(1);
        const ext = assertDefined(external[0], "expected external-ref");
        expect(ext.detail?.ref).toBe("https://example.com/schemas/Pet.json#");

        // Also emits unresolved-ref since the core can't resolve it
        const unresolved = diags.filter((d) => d.code === "unresolved-ref");
        expect(unresolved.length).toBe(1);
    });

    it("emits only unresolved-ref for non-external unresolvable refs", () => {
        const diags: Diagnostic[] = [];
        walk(
            { $ref: "#/components/schemas/Missing" },
            {
                rootDocument: {},
                diagnostics: {
                    diagnostics: (d: Diagnostic) => {
                        diags.push(d);
                    },
                },
            }
        );

        const external = diags.filter((d) => d.code === "external-ref");
        expect(external.length).toBe(0);

        const unresolved = diags.filter((d) => d.code === "unresolved-ref");
        expect(unresolved.length).toBe(1);
    });
});
