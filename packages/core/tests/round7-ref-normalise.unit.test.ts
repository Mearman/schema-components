/**
 * Round-7 fixes — JSON Schema review findings spanning ref.ts,
 * normalise.ts, and merge.ts.
 *
 * Each block covers one finding from the round-7 brief:
 *   1. `$ref` to a boolean sub-schema resolves correctly.
 *   3. `findAnchor` respects `$id`-scoped resource boundaries.
 *   4. JSON Pointer percent-decoding per RFC 6901.
 *
 * Further blocks are appended as the matching fixes land in
 * normalise.ts and merge.ts.
 */

import { describe, it, expect } from "vitest";
import { dereference, findAnchor, resolveRef } from "../src/core/ref.ts";
import { isObject } from "../src/core/guards.ts";

// ---------------------------------------------------------------------------
// 1. $ref to boolean sub-schema (ref.ts)
// ---------------------------------------------------------------------------

describe("dereference returns boolean sub-schemas", () => {
    it("resolves a JSON Pointer ending at `true`", () => {
        const doc: Record<string, unknown> = {
            $defs: { Any: true },
        };
        const result = dereference("#/$defs/Any", doc);
        expect(result).toBe(true);
    });

    it("resolves a JSON Pointer ending at `false`", () => {
        const doc: Record<string, unknown> = {
            $defs: { Never: false },
        };
        const result = dereference("#/$defs/Never", doc);
        expect(result).toBe(false);
    });

    it("resolveRef translates boolean `true` target to the always-valid object schema", () => {
        const doc: Record<string, unknown> = {
            properties: { x: { $ref: "#/$defs/Any" } },
            $defs: { Any: true },
        };
        const properties = isObject(doc.properties)
            ? doc.properties
            : undefined;
        const inner = properties === undefined ? undefined : properties.x;
        if (!isObject(inner)) {
            expect.unreachable("expected inner $ref node");
            return;
        }
        const resolved = resolveRef(inner, doc, new Set());
        expect(resolved).toStrictEqual({});
    });

    it("resolveRef translates boolean `false` target to the never-valid object schema", () => {
        const doc: Record<string, unknown> = {
            properties: { x: { $ref: "#/$defs/Never" } },
            $defs: { Never: false },
        };
        const properties = isObject(doc.properties)
            ? doc.properties
            : undefined;
        const inner = properties === undefined ? undefined : properties.x;
        if (!isObject(inner)) {
            expect.unreachable("expected inner $ref node");
            return;
        }
        const resolved = resolveRef(inner, doc, new Set());
        expect(resolved).toStrictEqual({ not: {} });
    });
});

// ---------------------------------------------------------------------------
// 3. findAnchor respects $id-scoped resource boundaries (ref.ts)
// ---------------------------------------------------------------------------

describe("findAnchor honours $id resource scope", () => {
    it("resolves the anchor in the same resource, not the nested resource", () => {
        const doc: Record<string, unknown> = {
            $id: "https://example.test/root",
            $defs: {
                Local: { $anchor: "Target", type: "string" },
                Nested: {
                    $id: "https://example.test/nested",
                    properties: {
                        // Same anchor name inside a separate resource —
                        // must NOT be returned to a caller scoped to
                        // the root resource.
                        same: { $anchor: "Target", type: "number" },
                    },
                },
            },
        };
        const found = findAnchor(doc, "Target");
        if (!isObject(found)) {
            expect.unreachable("expected to find the root-scoped anchor");
            return;
        }
        expect(found.type).toBe("string");
    });

    it("does not cross into a nested resource even when the same anchor name exists", () => {
        const doc: Record<string, unknown> = {
            $id: "https://example.test/root",
            // No matching anchor at the root resource. The nested
            // resource declares one but `findAnchor` should NOT
            // surface it to the root caller.
            $defs: {
                Nested: {
                    $id: "https://example.test/nested",
                    $defs: {
                        inner: { $anchor: "X", type: "integer" },
                    },
                },
            },
        };
        const found = findAnchor(doc, "X");
        expect(found).toBe(undefined);
    });
});

// ---------------------------------------------------------------------------
// 4. JSON Pointer percent-decoding per RFC 6901 (ref.ts)
// ---------------------------------------------------------------------------

describe("dereference percent-decodes JSON Pointer segments", () => {
    it("resolves a key that contains a literal space when the pointer uses %20", () => {
        const doc: Record<string, unknown> = {
            paths: {
                "/pets store": { description: "with space" },
            },
        };
        const found = dereference("#/paths/~1pets%20store", doc);
        expect(found).toStrictEqual({ description: "with space" });
    });

    it("returns undefined for a malformed percent-escape", () => {
        const doc: Record<string, unknown> = { foo: { bar: 1 } };
        const found = dereference("#/foo/%ZZ", doc);
        expect(found).toBe(undefined);
    });
});
