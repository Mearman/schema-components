/**
 * Round-7 fixes — JSON Schema review findings spanning ref.ts,
 * normalise.ts, and merge.ts.
 *
 * Each block covers one finding from the round-7 brief:
 *   1. `$ref` to a boolean sub-schema resolves correctly.
 *   2. Draft 2019-09 `dependencies` emits a legacy-split diagnostic.
 *   3. `findAnchor` respects `$id`-scoped resource boundaries.
 *   4. JSON Pointer percent-decoding per RFC 6901.
 *   5. Overlapping `dependencies` / `dependentRequired` emits a
 *      `dependencies-conflict` diagnostic and preserves the new keyword.
 *   6. OpenAPI 3.1 Schema-Object-level `$schema` overrides pick the
 *      matching draft transform.
 *   7. Tuple-form `items: [...]` is translated to `prefixItems` on the
 *      defensive 2020-12 path (no `$schema`).
 *   9. User-supplied `$anchor: "__recursive__"` collides with the
 *      Draft 2019-09 rewrite sentinel and emits a diagnostic.
 *
 * Issue 8 (mergeAllOf incompatible types) is exercised in the
 * `mergeAllOf` block below once that fix lands.
 */

import { describe, it, expect } from "vitest";
import {
    RECURSIVE_ANCHOR_SENTINEL,
    dereference,
    findAnchor,
    resolveRef,
} from "../src/core/ref.ts";
import {
    normaliseJsonSchema,
    normaliseOpenApiSchemas,
} from "../src/core/normalise.ts";
import { mergeAllOf } from "../src/core/merge.ts";
import { detectOpenApiVersion } from "../src/core/version.ts";
import { isObject } from "../src/core/guards.ts";
import type { Diagnostic } from "../src/core/diagnostics.ts";

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

// ---------------------------------------------------------------------------
// 2. Draft 2019-09 legacy-dependencies-split diagnostic (normalise.ts)
// ---------------------------------------------------------------------------

describe("Draft 2019-09 dependencies emits legacy-split diagnostic", () => {
    it("emits the 2019-specific diagnostic when splitting `dependencies` on 2019-09", () => {
        const diagnostics: Diagnostic[] = [];
        const schema: Record<string, unknown> = {
            $schema: "https://json-schema.org/draft/2019-09/schema",
            type: "object",
            properties: {
                a: { type: "string" },
                b: { type: "string" },
            },
            dependencies: { a: ["b"] },
        };
        normaliseJsonSchema(schema, "draft-2019-09", {
            diagnostics: (d) => diagnostics.push(d),
        });
        const split = diagnostics.find(
            (d) => d.code === "legacy-dependencies-split-2019"
        );
        expect(split).toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// 5. dependencies overlapping dependentRequired (normalise.ts)
// ---------------------------------------------------------------------------

describe("splitDependencies emits dependencies-conflict on overlap", () => {
    it("preserves the new keyword and emits the diagnostic", () => {
        const diagnostics: Diagnostic[] = [];
        const schema: Record<string, unknown> = {
            $schema: "https://json-schema.org/draft/2019-09/schema",
            type: "object",
            properties: {
                a: { type: "string" },
                b: { type: "string" },
                c: { type: "string" },
            },
            dependentRequired: {
                a: ["b"],
            },
            // Legacy `dependencies` carrying the same key with a
            // different value — this is a conflict, not a benign merge.
            dependencies: {
                a: ["c"],
            },
        };
        const out = normaliseJsonSchema(schema, "draft-2019-09", {
            diagnostics: (d) => diagnostics.push(d),
        });
        const depReq = out.dependentRequired;
        if (!isObject(depReq)) {
            expect.unreachable("expected dependentRequired");
            return;
        }
        // The pre-existing modern keyword wins — the legacy value is
        // dropped rather than silently overwriting.
        expect(depReq.a).toStrictEqual(["b"]);
        const conflict = diagnostics.find(
            (d) => d.code === "dependencies-conflict"
        );
        expect(conflict).toBeDefined();
    });

    it("does not emit the conflict diagnostic when the legacy and modern values agree", () => {
        const diagnostics: Diagnostic[] = [];
        const schema: Record<string, unknown> = {
            $schema: "https://json-schema.org/draft/2019-09/schema",
            type: "object",
            properties: {
                a: { type: "string" },
                b: { type: "string" },
            },
            dependentRequired: {
                a: ["b"],
            },
            dependencies: {
                a: ["b"],
            },
        };
        normaliseJsonSchema(schema, "draft-2019-09", {
            diagnostics: (d) => diagnostics.push(d),
        });
        const conflict = diagnostics.find(
            (d) => d.code === "dependencies-conflict"
        );
        expect(conflict).toBe(undefined);
    });
});

// ---------------------------------------------------------------------------
// 6. OpenAPI 3.1 per-Schema $schema override (normalise.ts)
// ---------------------------------------------------------------------------

describe("OpenAPI 3.1 per-Schema $schema override routes through the matching draft", () => {
    it("applies Draft 04 tuple-items translation when the Schema Object declares Draft 04", () => {
        const doc: Record<string, unknown> = {
            openapi: "3.1.0",
            info: { title: "t", version: "0" },
            paths: {},
            components: {
                schemas: {
                    Pair: {
                        // Per-Schema $schema override per OpenAPI 3.1 §4.7.5
                        $schema: "http://json-schema.org/draft-04/schema#",
                        type: "array",
                        items: [{ type: "string" }, { type: "number" }],
                    },
                },
            },
        };
        const version = detectOpenApiVersion(doc);
        if (version === undefined) {
            expect.unreachable("expected OpenAPI version to be detected");
            return;
        }
        const normalised = normaliseOpenApiSchemas(doc, version);
        const components = normalised.components;
        if (!isObject(components)) {
            expect.unreachable("expected components");
            return;
        }
        const schemas = components.schemas;
        if (!isObject(schemas)) {
            expect.unreachable("expected schemas");
            return;
        }
        const pair = schemas.Pair;
        if (!isObject(pair)) {
            expect.unreachable("expected Pair schema");
            return;
        }
        // Draft 04's `items: [...]` should have been rewritten to
        // `prefixItems` by the Draft 04 transform; under the bare 3.1
        // pipeline it would have stayed as an `items` array.
        expect(Array.isArray(pair.prefixItems)).toBe(true);
        expect("items" in pair).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// 7. Tuple-form items on the no-$schema 2020-12 path (normalise.ts)
// ---------------------------------------------------------------------------

describe("no-$schema 2020-12 path translates tuple-form items defensively", () => {
    it("rewrites `items: [...]` to `prefixItems` even without a declared $schema", () => {
        const schema: Record<string, unknown> = {
            type: "array",
            items: [{ type: "string" }, { type: "number" }],
        };
        const out = normaliseJsonSchema(schema, "draft-2020-12");
        expect(Array.isArray(out.prefixItems)).toBe(true);
        expect("items" in out).toBe(false);
    });

    it("leaves a single-schema items value alone", () => {
        const schema: Record<string, unknown> = {
            type: "array",
            items: { type: "string" },
        };
        const out = normaliseJsonSchema(schema, "draft-2020-12");
        expect("prefixItems" in out).toBe(false);
        expect(isObject(out.items)).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// 8. allOf with incompatible types (merge.ts)
// ---------------------------------------------------------------------------

describe("mergeAllOf collapses incompatible type branches to never", () => {
    it("returns `false` and emits `schema-allof-incompatible` for string ∩ number", () => {
        const diagnostics: Diagnostic[] = [];
        const merged = mergeAllOf(
            [{ type: "string" }, { type: "number" }],
            { diagnostics: (d) => diagnostics.push(d) },
            ""
        );
        expect(merged).toBe(false);
        const incompat = diagnostics.find(
            (d) => d.code === "schema-allof-incompatible"
        );
        expect(incompat).toBeDefined();
    });

    it("treats `integer` ∩ `number` as compatible (integer wins as first write)", () => {
        const diagnostics: Diagnostic[] = [];
        const merged = mergeAllOf(
            [{ type: "integer" }, { type: "number" }],
            { diagnostics: (d) => diagnostics.push(d) },
            ""
        );
        if (typeof merged === "boolean") {
            expect.unreachable("integer ∩ number should not collapse");
            return;
        }
        expect(merged.type).toBe("integer");
        const incompat = diagnostics.find(
            (d) => d.code === "schema-allof-incompatible"
        );
        expect(incompat).toBe(undefined);
    });

    it("keeps identical `type` keywords without producing the diagnostic", () => {
        const diagnostics: Diagnostic[] = [];
        const merged = mergeAllOf(
            [
                { type: "string", minLength: 1 },
                { type: "string", maxLength: 10 },
            ],
            { diagnostics: (d) => diagnostics.push(d) },
            ""
        );
        if (typeof merged === "boolean") {
            expect.unreachable("merge should not collapse on matching types");
            return;
        }
        expect(merged.type).toBe("string");
        const incompat = diagnostics.find(
            (d) => d.code === "schema-allof-incompatible"
        );
        expect(incompat).toBe(undefined);
    });
});

// ---------------------------------------------------------------------------
// 9. Recursive anchor sentinel collision (normalise.ts)
// ---------------------------------------------------------------------------

describe("recursive-anchor sentinel collision", () => {
    it("emits `recursive-anchor-collision` when a Draft 2019-09 schema declares the sentinel", () => {
        const diagnostics: Diagnostic[] = [];
        const schema: Record<string, unknown> = {
            $schema: "https://json-schema.org/draft/2019-09/schema",
            $anchor: RECURSIVE_ANCHOR_SENTINEL,
            type: "object",
        };
        normaliseJsonSchema(schema, "draft-2019-09", {
            diagnostics: (d) => diagnostics.push(d),
        });
        const collision = diagnostics.find(
            (d) => d.code === "recursive-anchor-collision"
        );
        expect(collision).toBeDefined();
    });

    it("does not emit the collision diagnostic when the anchor is unrelated", () => {
        const diagnostics: Diagnostic[] = [];
        const schema: Record<string, unknown> = {
            $schema: "https://json-schema.org/draft/2019-09/schema",
            $anchor: "Something",
            type: "object",
        };
        normaliseJsonSchema(schema, "draft-2019-09", {
            diagnostics: (d) => diagnostics.push(d),
        });
        const collision = diagnostics.find(
            (d) => d.code === "recursive-anchor-collision"
        );
        expect(collision).toBe(undefined);
    });
});
