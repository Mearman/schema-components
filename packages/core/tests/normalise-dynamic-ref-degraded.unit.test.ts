/**
 * Tests for the `dynamic-ref-degraded` diagnostic emitted when a
 * `$recursiveRef` (Draft 2019-09) or `$dynamicRef` (Draft 2020-12) is
 * rewritten to a static `$ref` and dynamic-scope semantics are lost.
 */
import { describe, it, expect } from "vitest";
import { normaliseJsonSchema } from "../src/core/normalise.ts";
import type { Diagnostic } from "../src/core/diagnostics.ts";
import { isObject } from "../src/core/guards.ts";

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

describe("dynamic-ref-degraded: $recursiveRef (Draft 2019-09)", () => {
    it("emits when $recursiveRef points to a cross-document target", () => {
        const schema = {
            $schema: "https://json-schema.org/draft/2019-09/schema",
            type: "object",
            properties: {
                child: { $recursiveRef: "foo.json#/$defs/Tree" },
            },
        };
        const { diagnostics, sink } = collect();
        const out = normaliseJsonSchema(schema, "draft-2019-09", {
            diagnostics: sink,
        });
        const degraded = diagnostics.filter(
            (d) => d.code === "dynamic-ref-degraded"
        );
        expect(degraded.length).toBe(1);
        const diag = degraded[0];
        if (diag === undefined) throw new Error("expected diagnostic");
        expect(diag.detail?.keyword).toBe("$recursiveRef");
        expect(diag.detail?.ref).toBe("foo.json#/$defs/Tree");
        // The rewrite still happens — static $ref is the best fallback.
        const props = out.properties;
        if (!isObject(props)) throw new Error("expected properties");
        const child = props.child;
        if (!isObject(child)) throw new Error("expected child");
        expect(child.$ref).toBe("foo.json#/$defs/Tree");
        expect(child.$recursiveRef).toBe(undefined);
    });

    it("does NOT emit when $recursiveRef is in-document (fragment-only)", () => {
        const schema = {
            $schema: "https://json-schema.org/draft/2019-09/schema",
            $recursiveAnchor: true,
            type: "object",
            properties: {
                child: { $recursiveRef: "#" },
            },
        };
        const { diagnostics, sink } = collect();
        normaliseJsonSchema(schema, "draft-2019-09", {
            diagnostics: sink,
        });
        expect(
            diagnostics.filter((d) => d.code === "dynamic-ref-degraded").length
        ).toBe(0);
    });
});

describe("dynamic-ref-degraded: $dynamicRef (Draft 2020-12)", () => {
    it("emits when $dynamicRef points to a cross-document target", () => {
        const schema = {
            $schema: "https://json-schema.org/draft/2020-12/schema",
            type: "object",
            properties: {
                tree: { $dynamicRef: "tree.json#meta" },
            },
        };
        const { diagnostics, sink } = collect();
        const out = normaliseJsonSchema(schema, "draft-2020-12", {
            diagnostics: sink,
        });
        const degraded = diagnostics.filter(
            (d) => d.code === "dynamic-ref-degraded"
        );
        expect(degraded.length).toBe(1);
        const diag = degraded[0];
        if (diag === undefined) throw new Error("expected diagnostic");
        expect(diag.detail?.keyword).toBe("$dynamicRef");
        expect(diag.detail?.ref).toBe("tree.json#meta");
        const props = out.properties;
        if (!isObject(props)) throw new Error("expected properties");
        const tree = props.tree;
        if (!isObject(tree)) throw new Error("expected tree");
        expect(tree.$ref).toBe("tree.json#meta");
        expect(tree.$dynamicRef).toBe(undefined);
    });

    it("emits when $dynamicRef is in-document AND a $dynamicAnchor exists elsewhere", () => {
        const schema = {
            $schema: "https://json-schema.org/draft/2020-12/schema",
            $dynamicAnchor: "meta",
            type: "object",
            properties: {
                children: {
                    type: "array",
                    items: { $dynamicRef: "#meta" },
                },
            },
        };
        const { diagnostics, sink } = collect();
        normaliseJsonSchema(schema, "draft-2020-12", {
            diagnostics: sink,
        });
        const degraded = diagnostics.filter(
            (d) => d.code === "dynamic-ref-degraded"
        );
        expect(degraded.length).toBe(1);
        const diag = degraded[0];
        if (diag === undefined) throw new Error("expected diagnostic");
        expect(diag.detail?.keyword).toBe("$dynamicRef");
        expect(diag.detail?.ref).toBe("#meta");
    });

    it("does NOT emit when $dynamicRef is in-document and no $dynamicAnchor exists in the document", () => {
        // No dynamic anchors → nothing to lose; the static rewrite is
        // semantically equivalent to a plain `#name` resolution.
        const schema = {
            $schema: "https://json-schema.org/draft/2020-12/schema",
            type: "object",
            properties: {
                child: { $dynamicRef: "#anchor" },
            },
        };
        const { diagnostics, sink } = collect();
        normaliseJsonSchema(schema, "draft-2020-12", {
            diagnostics: sink,
        });
        expect(
            diagnostics.filter((d) => d.code === "dynamic-ref-degraded").length
        ).toBe(0);
    });
});
