/**
 * Tests for the `invalid-id-fragment` diagnostic.
 *
 * Per JSON Schema 2020-12 §8.2.1, `$id` MUST NOT contain a non-empty
 * fragment. The base-URI resolver silently strips the fragment when
 * deriving the document base — emit a diagnostic so the silent loss is
 * visible to the consumer, who almost certainly meant to declare an
 * `$anchor` instead.
 */
import { describe, it, expect } from "vitest";
import { normaliseJsonSchema } from "../src/core/normalise.ts";
import type { Diagnostic } from "../src/core/diagnostics.ts";

function collect(): {
    diagnostics: Diagnostic[];
    sink: (d: Diagnostic) => void;
} {
    const diagnostics: Diagnostic[] = [];
    return {
        diagnostics,
        sink: (d: Diagnostic) => {
            diagnostics.push(d);
        },
    };
}

describe("invalid-id-fragment diagnostic", () => {
    it("emits when the document-level $id carries a fragment", () => {
        const schema = {
            $schema: "https://json-schema.org/draft/2020-12/schema",
            $id: "https://example.com/root#meta",
            type: "string",
        };
        const { diagnostics, sink } = collect();
        normaliseJsonSchema(schema, "draft-2020-12", {
            diagnostics: sink,
        });
        const out = diagnostics.filter((d) => d.code === "invalid-id-fragment");
        expect(out.length).toBe(1);
        const diag = out[0];
        if (diag === undefined) throw new Error("expected diagnostic");
        expect(diag.detail?.id).toBe("https://example.com/root#meta");
        expect(diag.detail?.fragment).toBe("#meta");
        expect(diag.pointer).toBe("/$id");
    });

    it("emits when a nested $id carries a fragment", () => {
        const schema = {
            $schema: "https://json-schema.org/draft/2020-12/schema",
            $id: "https://example.com/root",
            type: "object",
            properties: {
                nested: {
                    $id: "child#anchor",
                    type: "string",
                },
            },
        };
        const { diagnostics, sink } = collect();
        normaliseJsonSchema(schema, "draft-2020-12", {
            diagnostics: sink,
        });
        const out = diagnostics.filter((d) => d.code === "invalid-id-fragment");
        expect(out.length).toBe(1);
        const diag = out[0];
        if (diag === undefined) throw new Error("expected diagnostic");
        expect(diag.detail?.fragment).toBe("#anchor");
        expect(diag.pointer).toBe("/properties/nested/$id");
    });

    it("does NOT emit when $id has no fragment", () => {
        const schema = {
            $schema: "https://json-schema.org/draft/2020-12/schema",
            $id: "https://example.com/root",
            type: "string",
        };
        const { diagnostics, sink } = collect();
        normaliseJsonSchema(schema, "draft-2020-12", {
            diagnostics: sink,
        });
        expect(
            diagnostics.filter((d) => d.code === "invalid-id-fragment").length
        ).toBe(0);
    });
});
