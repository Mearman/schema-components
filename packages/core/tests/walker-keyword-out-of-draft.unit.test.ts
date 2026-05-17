/**
 * Tests for the `keyword-out-of-draft` diagnostic emitted by the
 * walker when a keyword is used on a node whose root document
 * declared an earlier draft.
 *
 * Currently covers `contentSchema` (added in Draft 2019-09) appearing
 * on a Draft 04/06/07 document. The walker still descends into the
 * schema — schema-components accepts forward-compatible keywords on
 * older drafts to match mainstream validator behaviour — but the
 * diagnostic surfaces the cross-draft usage so consumers can audit.
 */
import { describe, it, expect } from "vitest";
import { walk } from "../src/core/walker.ts";
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

describe("keyword-out-of-draft: contentSchema", () => {
    it("emits when contentSchema appears on a Draft 07 document", () => {
        const schema = {
            $schema: "http://json-schema.org/draft-07/schema#",
            type: "string",
            contentMediaType: "application/json",
            contentSchema: {
                type: "object",
                properties: { x: { type: "string" } },
            },
        };
        const { diagnostics, sink } = collect();
        walk(schema, {
            rootDocument: schema,
            diagnostics: { diagnostics: sink },
        });
        const out = diagnostics.filter(
            (d) => d.code === "keyword-out-of-draft"
        );
        expect(out.length).toBe(1);
        const diag = out[0];
        if (diag === undefined) throw new Error("expected diagnostic");
        expect(diag.detail?.keyword).toBe("contentSchema");
        expect(diag.detail?.declaredDraft).toBe("draft-07");
    });

    it("emits when contentSchema appears on a Draft 04 document", () => {
        const schema = {
            $schema: "http://json-schema.org/draft-04/schema#",
            type: "string",
            contentSchema: { type: "string" },
        };
        const { diagnostics, sink } = collect();
        walk(schema, {
            rootDocument: schema,
            diagnostics: { diagnostics: sink },
        });
        expect(
            diagnostics.filter((d) => d.code === "keyword-out-of-draft").length
        ).toBe(1);
    });

    it("does NOT emit on Draft 2019-09 (contentSchema introduced)", () => {
        const schema = {
            $schema: "https://json-schema.org/draft/2019-09/schema",
            type: "string",
            contentMediaType: "application/json",
            contentSchema: { type: "object" },
        };
        const { diagnostics, sink } = collect();
        walk(schema, {
            rootDocument: schema,
            diagnostics: { diagnostics: sink },
        });
        expect(
            diagnostics.filter((d) => d.code === "keyword-out-of-draft").length
        ).toBe(0);
    });

    it("does NOT emit on Draft 2020-12", () => {
        const schema = {
            $schema: "https://json-schema.org/draft/2020-12/schema",
            type: "string",
            contentSchema: { type: "object" },
        };
        const { diagnostics, sink } = collect();
        walk(schema, {
            rootDocument: schema,
            diagnostics: { diagnostics: sink },
        });
        expect(
            diagnostics.filter((d) => d.code === "keyword-out-of-draft").length
        ).toBe(0);
    });

    it("does NOT emit when the root document has no $schema", () => {
        const schema = {
            type: "string",
            contentSchema: { type: "object" },
        };
        const { diagnostics, sink } = collect();
        walk(schema, {
            rootDocument: schema,
            diagnostics: { diagnostics: sink },
        });
        expect(
            diagnostics.filter((d) => d.code === "keyword-out-of-draft").length
        ).toBe(0);
    });
});
