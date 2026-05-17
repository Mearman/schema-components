/**
 * Tests for Draft 2019-09 `dependencies` keyword splitting.
 *
 * Draft 2019-09 added `dependentRequired` and `dependentSchemas` but
 * retained the legacy `dependencies` keyword for backwards compat.
 * `normaliseJsonSchema` for `draft-2019-09` must split `dependencies`
 * the same way the Draft 04/06/07 paths do, otherwise the constraint
 * is silently dropped before the walker sees it.
 */
import { describe, it, expect } from "vitest";
import { normaliseJsonSchema } from "../src/core/normalise.ts";
import { isObject } from "../src/core/guards.ts";

describe("Draft 2019-09 dependencies splitting", () => {
    it("splits string-array values into dependentRequired", () => {
        const schema = {
            $schema: "https://json-schema.org/draft/2019-09/schema",
            type: "object",
            properties: {
                name: { type: "string" },
                email: { type: "string" },
                phone: { type: "string" },
            },
            dependencies: {
                email: ["phone"],
            },
        };
        const out = normaliseJsonSchema(schema, "draft-2019-09");
        expect(out.dependencies).toBe(undefined);
        const depReq = out.dependentRequired;
        if (!isObject(depReq)) {
            expect.unreachable("expected dependentRequired");
            return;
        }
        expect(depReq.email).toStrictEqual(["phone"]);
    });

    it("splits schema-object values into dependentSchemas", () => {
        const schema = {
            $schema: "https://json-schema.org/draft/2019-09/schema",
            type: "object",
            properties: {
                name: { type: "string" },
                phone: { type: "string" },
            },
            dependencies: {
                phone: {
                    required: ["name"],
                },
            },
        };
        const out = normaliseJsonSchema(schema, "draft-2019-09");
        expect(out.dependencies).toBe(undefined);
        const depSchemas = out.dependentSchemas;
        if (!isObject(depSchemas)) {
            expect.unreachable("expected dependentSchemas");
            return;
        }
        expect(depSchemas.phone).toBeDefined();
    });

    it("splits mixed dependencies into both target keywords", () => {
        const schema = {
            $schema: "https://json-schema.org/draft/2019-09/schema",
            type: "object",
            properties: {
                a: { type: "string" },
                b: { type: "string" },
                c: { type: "string" },
            },
            dependencies: {
                a: ["b"],
                b: { required: ["c"] },
            },
        };
        const out = normaliseJsonSchema(schema, "draft-2019-09");
        expect(out.dependencies).toBe(undefined);
        const depReq = out.dependentRequired;
        const depSchemas = out.dependentSchemas;
        if (!isObject(depReq) || !isObject(depSchemas)) {
            expect.unreachable("expected both dependent maps");
            return;
        }
        expect(depReq.a).toStrictEqual(["b"]);
        expect(depSchemas.b).toBeDefined();
    });

    it("preserves an existing dependentRequired entry alongside split additions", () => {
        const schema = {
            $schema: "https://json-schema.org/draft/2019-09/schema",
            type: "object",
            properties: {
                a: { type: "string" },
                b: { type: "string" },
                c: { type: "string" },
                d: { type: "string" },
            },
            dependentRequired: {
                a: ["b"],
            },
            dependencies: {
                c: ["d"],
            },
        };
        const out = normaliseJsonSchema(schema, "draft-2019-09");
        const depReq = out.dependentRequired;
        if (!isObject(depReq)) {
            expect.unreachable("expected dependentRequired");
            return;
        }
        expect(depReq.a).toStrictEqual(["b"]);
        expect(depReq.c).toStrictEqual(["d"]);
    });
});
