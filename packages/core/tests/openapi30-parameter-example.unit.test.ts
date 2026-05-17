/**
 * OpenAPI 3.0/3.1 Parameter Object and Header Object `example` to
 * `examples` rewrite.
 *
 * The spec defines `examples` as
 * `Map[string, Example Object | Reference Object]`. Each Example Object
 * carries `summary`/`description`/`value`/`externalValue`. The historic
 * transform emitted `[example]` (an array of bare values) — invalid.
 */

import { describe, it, expect } from "vitest";
import { deepNormaliseOpenApi30Doc } from "../src/core/openapi30.ts";
import { deepNormalise } from "../src/core/normalise.ts";

function prop(
    value: unknown,
    key: string
): Record<string, unknown> | undefined {
    if (typeof value !== "object" || value === null) return undefined;
    const result = (value as Record<string, unknown>)[key];
    if (typeof result !== "object" || result === null) return undefined;
    if (Array.isArray(result)) return undefined;
    return result as Record<string, unknown>;
}

function propArr(value: unknown, key: string): readonly unknown[] | undefined {
    if (typeof value !== "object" || value === null) return undefined;
    const result = (value as Record<string, unknown>)[key];
    if (!Array.isArray(result)) return undefined;
    return result as readonly unknown[];
}

describe("Parameter Object example → examples map", () => {
    it("wraps a singular Parameter-level example under default.value", () => {
        const doc = {
            openapi: "3.0.3",
            info: { title: "Test", version: "1.0" },
            paths: {
                "/items/{id}": {
                    parameters: [
                        {
                            name: "id",
                            in: "path",
                            required: true,
                            schema: { type: "string" },
                            example: "abc",
                        },
                    ],
                    get: { responses: {} },
                },
            },
        };

        const result = deepNormaliseOpenApi30Doc(doc, deepNormalise);
        const paths = prop(result, "paths");
        const items = prop(paths, "/items/{id}");
        const params = propArr(items, "parameters");
        expect(params).toBeDefined();
        if (params === undefined) return;

        const param = params[0];
        expect(prop(param, "example")).toBeUndefined();
        const examples = prop(param, "examples");
        expect(examples).toBeDefined();
        if (examples === undefined) return;
        // The map itself must not be an Example Object — no `value` at the
        // top level.
        expect(examples.value).toBeUndefined();
        const def = examples.default as Record<string, unknown>;
        expect(def.value).toBe("abc");
    });

    it("preserves existing Parameter examples map and drops example", () => {
        const doc = {
            openapi: "3.0.3",
            info: { title: "Test", version: "1.0" },
            paths: {
                "/items": {
                    get: {
                        parameters: [
                            {
                                name: "filter",
                                in: "query",
                                schema: { type: "string" },
                                example: "ignored",
                                examples: {
                                    first: { value: "x" },
                                    second: { value: "y" },
                                },
                            },
                        ],
                        responses: {},
                    },
                },
            },
        };

        const result = deepNormaliseOpenApi30Doc(doc, deepNormalise);
        const paths = prop(result, "paths");
        const items = prop(paths, "/items");
        const get = prop(items, "get");
        const params = propArr(get, "parameters");
        expect(params).toBeDefined();
        if (params === undefined) return;
        const param = params[0] as Record<string, unknown>;
        expect(param.example).toBeUndefined();
        const examples = param.examples as Record<string, unknown>;
        expect(examples.first).toEqual({ value: "x" });
        expect(examples.second).toEqual({ value: "y" });
        expect(examples.default).toBeUndefined();
    });
});

describe("Header Object example → examples map", () => {
    it("wraps a singular Header-level example under default.value", () => {
        const doc = {
            openapi: "3.0.3",
            info: { title: "Test", version: "1.0" },
            paths: {
                "/items": {
                    get: {
                        responses: {
                            "200": {
                                description: "ok",
                                headers: {
                                    "X-Trace-Id": {
                                        schema: { type: "string" },
                                        example: "trace-123",
                                    },
                                },
                            },
                        },
                    },
                },
            },
        };

        const result = deepNormaliseOpenApi30Doc(doc, deepNormalise);
        const paths = prop(result, "paths");
        const items = prop(paths, "/items");
        const get = prop(items, "get");
        const responses = prop(get, "responses");
        const response = prop(responses, "200");
        const headers = prop(response, "headers");
        const header = prop(headers, "X-Trace-Id");
        expect(header).toBeDefined();
        if (header === undefined) return;
        expect(header.example).toBeUndefined();
        const examples = header.examples as Record<string, unknown>;
        expect(examples.value).toBeUndefined();
        const def = examples.default as Record<string, unknown>;
        expect(def.value).toBe("trace-123");
    });
});
