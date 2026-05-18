/**
 * Round-7 regression tests for `openapi/resolve.ts`.
 *
 * Covers the four fixes landed in the round-7 cycle:
 *
 *  1. ApiWebhooks-style fan-out — multiple `getParsed(doc, sink)` calls
 *     against the same document must emit each doc-level diagnostic at
 *     cardinality 1 (not N).
 *  2. `lookupPathItemNode` path / webhook name collision — the same
 *     identifier under both `paths` and `webhooks` surfaces the
 *     `path-webhook-name-collision` diagnostic and resolves
 *     deterministically against `paths`.
 *  3. Cyclic Path Item `$ref` chain — `cyclic-path-item-ref` fires once
 *     per real cycle, not once per cached replay.
 *  4. `documentContainsKeyword` cycle safety — the dropped-XML scan
 *     terminates on documents with structural cycles.
 *
 * Every test constructs a fresh document literal so the module-level
 * `WeakMap` cache cannot leak state between tests.
 */

import { describe, it, expect } from "vitest";
import { getParsed, resolveOperation } from "../src/openapi/resolve.ts";
import { documentContainsKeyword } from "../src/core/normalise.ts";
import type { Diagnostic, DiagnosticSink } from "../src/core/diagnostics.ts";

function makeSink(): {
    sink: DiagnosticSink;
    diagnostics: Diagnostic[];
} {
    const diagnostics: Diagnostic[] = [];
    const sink: DiagnosticSink = (d) => diagnostics.push(d);
    return { sink, diagnostics };
}

describe("getParsed diagnostic replay caching", () => {
    it("emits each captured diagnostic at cardinality 1 across N sink-bearing calls", () => {
        // The fan-out cardinality test from the task brief:
        // render N webhooks, single sink, count diagnostic invocations
        // — must be cardinality 1 per real diagnostic.
        const doc: Record<string, unknown> = {
            openapi: "3.1.0",
            info: { title: "Test", version: "1.0" },
            paths: {},
            components: {
                schemas: {
                    Pet: {
                        type: "object",
                        xml: { name: "pet" },
                        properties: { name: { type: "string" } },
                    },
                },
            },
        };
        const { sink, diagnostics } = makeSink();
        const opts = { diagnostics: sink };
        // Six "components" all reusing the same sink — analogous to
        // `ApiWebhooks` fanning out into six `ApiWebhook` renders.
        for (let i = 0; i < 6; i++) {
            getParsed(doc, opts);
        }
        const xmlDiagnostics = diagnostics.filter(
            (d) =>
                d.code === "dropped-swagger-feature" &&
                d.detail?.feature === "xml"
        );
        expect(xmlDiagnostics.length).toBe(1);
    });

    it("emits independently for distinct sinks against the same document", () => {
        // Two different sinks must each receive every captured
        // diagnostic exactly once — the de-duplication is per-sink, not
        // per-document.
        const doc: Record<string, unknown> = {
            openapi: "3.0.0",
            info: { title: "Test", version: "1.0" },
            paths: {},
            components: {
                schemas: {
                    Pet: { type: "object", xml: { name: "pet" } },
                },
            },
        };
        const { sink: sinkA, diagnostics: diagsA } = makeSink();
        const { sink: sinkB, diagnostics: diagsB } = makeSink();
        getParsed(doc, { diagnostics: sinkA });
        getParsed(doc, { diagnostics: sinkA });
        getParsed(doc, { diagnostics: sinkB });
        getParsed(doc, { diagnostics: sinkB });
        const xmlOnlyA = diagsA.filter(
            (d) =>
                d.code === "dropped-swagger-feature" &&
                d.detail?.feature === "xml"
        );
        const xmlOnlyB = diagsB.filter(
            (d) =>
                d.code === "dropped-swagger-feature" &&
                d.detail?.feature === "xml"
        );
        expect(xmlOnlyA.length).toBe(1);
        expect(xmlOnlyB.length).toBe(1);
    });

    it("does not emit doc-level diagnostics when the caller supplies no sink", () => {
        const doc: Record<string, unknown> = {
            openapi: "3.0.0",
            info: { title: "Test", version: "1.0" },
            paths: {},
            components: {
                schemas: {
                    Pet: {
                        type: "object",
                        xml: { name: "pet" },
                    },
                },
            },
        };
        // First call without a sink populates the cache.
        expect(() => getParsed(doc)).not.toThrow();
        // Second call with a sink replays the captured diagnostic.
        const { sink, diagnostics } = makeSink();
        getParsed(doc, { diagnostics: sink });
        const xmlDiag = diagnostics.find(
            (d) =>
                d.code === "dropped-swagger-feature" &&
                d.detail?.feature === "xml"
        );
        expect(xmlDiag).toBeDefined();
    });

    it("throws once on the first replayed diagnostic when strict is set", () => {
        const doc: Record<string, unknown> = {
            openapi: "3.1.0",
            info: { title: "Test", version: "1.0" },
            paths: {},
            components: {
                schemas: {
                    Pet: {
                        type: "object",
                        xml: { name: "pet" },
                    },
                },
            },
        };
        const { sink } = makeSink();
        expect(() =>
            getParsed(doc, { diagnostics: sink, strict: true })
        ).toThrow();
    });

    it("returns the same parsed reference on cache hit", () => {
        const doc: Record<string, unknown> = {
            openapi: "3.1.0",
            info: { title: "Test", version: "1.0" },
            paths: {},
        };
        const first = getParsed(doc);
        const second = getParsed(doc);
        expect(second).toBe(first);
        // Cache must also hit when the caller supplies a sink — the
        // pre-fix implementation bypassed the cache in that branch.
        const { sink } = makeSink();
        const third = getParsed(doc, { diagnostics: sink });
        expect(third).toBe(first);
    });
});

describe("lookupPathItemNode path/webhook name collision", () => {
    it("emits path-webhook-name-collision and resolves against `paths`", () => {
        const doc: Record<string, unknown> = {
            openapi: "3.1.0",
            info: { title: "Test", version: "1.0" },
            paths: {
                foo: {
                    get: {
                        operationId: "fromPaths",
                        responses: { "200": { description: "ok" } },
                    },
                },
            },
            webhooks: {
                foo: {
                    post: {
                        operationId: "fromWebhooks",
                        responses: { "200": { description: "ok" } },
                    },
                },
            },
        };
        const { sink, diagnostics } = makeSink();
        const resolved = resolveOperation(doc, "foo", "get", {
            diagnostics: sink,
        });
        expect(resolved.operation.operationId).toBe("fromPaths");
        const collision = diagnostics.find(
            (d) => d.code === "path-webhook-name-collision"
        );
        expect(collision).toBeDefined();
        expect(collision?.detail?.name).toBe("foo");
    });

    it("does not emit the collision diagnostic when only one map has the name", () => {
        const doc: Record<string, unknown> = {
            openapi: "3.1.0",
            info: { title: "Test", version: "1.0" },
            paths: {
                "/items": {
                    get: {
                        operationId: "list",
                        responses: { "200": { description: "ok" } },
                    },
                },
            },
            webhooks: {
                petCreated: {
                    post: {
                        operationId: "notify",
                        responses: { "200": { description: "ok" } },
                    },
                },
            },
        };
        const { sink, diagnostics } = makeSink();
        resolveOperation(doc, "/items", "get", { diagnostics: sink });
        const collision = diagnostics.find(
            (d) => d.code === "path-webhook-name-collision"
        );
        expect(collision).toBeUndefined();
    });
});

describe("cyclic Path Item $ref cardinality", () => {
    it("emits cyclic-path-item-ref once per `resolveOperation` call, never multiplied via cache replay", () => {
        // `cyclic-path-item-ref` is emitted from `resolvePathItemNode`,
        // not from doc-level normalisation, so it is not part of the
        // captured-and-replayed set. Each `resolveOperation` call walks
        // the chain fresh and emits exactly one cycle diagnostic. The
        // important assertion is that replay does not multiply this
        // diagnostic the way it multiplied doc-level ones pre-fix.
        const doc: Record<string, unknown> = {
            openapi: "3.1.0",
            info: { title: "Test", version: "1.0" },
            paths: {
                "/loop": { $ref: "#/components/pathItems/Loop" },
            },
            components: {
                pathItems: {
                    Loop: { $ref: "#/components/pathItems/Loop" },
                },
            },
        };
        const { sink, diagnostics } = makeSink();
        for (let i = 0; i < 3; i++) {
            expect(() =>
                resolveOperation(doc, "/loop", "get", { diagnostics: sink })
            ).toThrow();
        }
        const cycleDiags = diagnostics.filter(
            (d) => d.code === "cyclic-path-item-ref"
        );
        // One per call: the chain walker still runs per resolution.
        // The fix guarantees no extra multiplication via cached replay.
        expect(cycleDiags.length).toBe(3);
    });
});

describe("documentContainsKeyword cycle safety", () => {
    it("terminates on structurally cyclic input (replaces unsafe local walker)", () => {
        // The dropped-XML scan in `getParsed` previously used a local
        // walker with no visited-set; this exercises the canonical
        // helper's WeakSet protection in isolation, the only thing the
        // resolve.ts call site relies on. Wider pipeline cycle safety
        // is the responsibility of `normaliseOpenApiSchemas` and the
        // parser, both of which are out of scope here.
        const cyclic: Record<string, unknown> = { type: "object" };
        cyclic.self = cyclic;
        expect(() => documentContainsKeyword(cyclic, "xml")).not.toThrow();
        // The cyclic node has no `xml` keyword anywhere, so the result
        // is false; the assertion is that the call terminates at all.
        expect(documentContainsKeyword(cyclic, "xml")).toBe(false);
        // Still finds keywords on the same node, having walked into a
        // back-reference: confirms early termination is correct, not
        // an over-eager prune.
        const cyclicXml: Record<string, unknown> = {
            type: "object",
            xml: { name: "test" },
        };
        cyclicXml.self = cyclicXml;
        expect(documentContainsKeyword(cyclicXml, "xml")).toBe(true);
    });
});
