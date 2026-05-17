/**
 * Swagger 2.0 parameter and header constraint normalisation.
 *
 * Swagger 2.0 places `pattern`, `minLength`, `maxLength`, `minItems`,
 * `maxItems`, `uniqueItems`, `multipleOf`, `exclusiveMinimum`,
 * `exclusiveMaximum`, and `items` (array element type) at the
 * parameter or header root. OpenAPI 3.x expects these inside the
 * synthesised `schema`. The historic normaliser silently dropped them.
 */

import { describe, it, expect } from "vitest";
import { normaliseOpenApiSchemas } from "../src/core/normalise.ts";
import { detectOpenApiVersion } from "../src/core/version.ts";
import { assertDefined } from "./helpers.ts";

function normalise(doc: Record<string, unknown>): Record<string, unknown> {
    const version = detectOpenApiVersion(doc);
    return normaliseOpenApiSchemas(doc, assertDefined(version, "version"));
}

function operationParameterSchema(
    doc: Record<string, unknown>,
    path: string,
    method: string,
    index: number
): Record<string, unknown> {
    const normalised = normalise(doc);
    const paths = normalised.paths as Record<string, unknown>;
    const pathItem = paths[path] as Record<string, unknown>;
    const operation = pathItem[method] as Record<string, unknown>;
    const params = operation.parameters as unknown[];
    const param = params[index] as Record<string, unknown>;
    return param.schema as Record<string, unknown>;
}

function buildParamDoc(
    extra: Record<string, unknown>
): Record<string, unknown> {
    return {
        swagger: "2.0",
        info: { title: "Test", version: "1.0.0" },
        paths: {
            "/items": {
                get: {
                    operationId: "list",
                    parameters: [
                        {
                            name: "value",
                            in: "query",
                            type: "string",
                            ...extra,
                        },
                    ],
                    responses: {
                        "200": { description: "ok" },
                    },
                },
            },
        },
    };
}

describe("Swagger 2.0 parameter constraint normalisation", () => {
    it("copies pattern into schema", () => {
        const schema = operationParameterSchema(
            buildParamDoc({ pattern: "^[A-Z]+$" }),
            "/items",
            "get",
            0
        );
        expect(schema.pattern).toBe("^[A-Z]+$");
        // The Parameter Object root must NOT also carry pattern after
        // normalisation — the keyword belongs in `schema`.
        const normalised = normalise(buildParamDoc({ pattern: "^[A-Z]+$" }));
        const paths = normalised.paths as Record<string, unknown>;
        const pathItem = paths["/items"] as Record<string, unknown>;
        const operation = pathItem.get as Record<string, unknown>;
        const params = operation.parameters as Record<string, unknown>[];
        const param = assertDefined(params[0], "first parameter");
        expect(param.pattern).toBeUndefined();
    });

    it("copies minLength and maxLength into schema", () => {
        const schema = operationParameterSchema(
            buildParamDoc({ minLength: 1, maxLength: 5 }),
            "/items",
            "get",
            0
        );
        expect(schema.minLength).toBe(1);
        expect(schema.maxLength).toBe(5);
    });

    it("copies minItems, maxItems, uniqueItems into schema for arrays", () => {
        const schema = operationParameterSchema(
            buildParamDoc({
                type: "array",
                items: { type: "string" },
                minItems: 1,
                maxItems: 10,
                uniqueItems: true,
            }),
            "/items",
            "get",
            0
        );
        expect(schema.minItems).toBe(1);
        expect(schema.maxItems).toBe(10);
        expect(schema.uniqueItems).toBe(true);
    });

    it("copies multipleOf into schema", () => {
        const schema = operationParameterSchema(
            buildParamDoc({ type: "number", multipleOf: 0.5 }),
            "/items",
            "get",
            0
        );
        expect(schema.multipleOf).toBe(0.5);
    });

    it("copies exclusiveMinimum and exclusiveMaximum into schema", () => {
        const schema = operationParameterSchema(
            buildParamDoc({
                type: "integer",
                minimum: 0,
                maximum: 100,
                exclusiveMinimum: true,
                exclusiveMaximum: true,
            }),
            "/items",
            "get",
            0
        );
        expect(schema.minimum).toBe(0);
        expect(schema.maximum).toBe(100);
        // exclusiveMinimum/exclusiveMaximum from Draft 04 are booleans;
        // the normalised schema preserves them under Draft 04 semantics
        // and the later Draft 04 normaliser converts them to numeric
        // bounds. The presence of `minimum`/`maximum` confirms the
        // constraint survived normalisation.
        // Either Draft 04 or Draft 2020-12 shape is acceptable here.
        expect(
            schema.exclusiveMinimum === true ||
                typeof schema.exclusiveMinimum === "number"
        ).toBe(true);
        expect(
            schema.exclusiveMaximum === true ||
                typeof schema.exclusiveMaximum === "number"
        ).toBe(true);
    });

    it("synthesises nested items schema with constraints", () => {
        const schema = operationParameterSchema(
            buildParamDoc({
                type: "array",
                items: {
                    type: "string",
                    pattern: "^[a-z]+$",
                    minLength: 3,
                },
            }),
            "/items",
            "get",
            0
        );
        expect(schema.type).toBe("array");
        const items = schema.items as Record<string, unknown>;
        expect(items.type).toBe("string");
        expect(items.pattern).toBe("^[a-z]+$");
        expect(items.minLength).toBe(3);
    });

    it("preserves allowEmptyValue at the parameter root", () => {
        const normalised = normalise(buildParamDoc({ allowEmptyValue: true }));
        const paths = normalised.paths as Record<string, unknown>;
        const pathItem = paths["/items"] as Record<string, unknown>;
        const operation = pathItem.get as Record<string, unknown>;
        const params = operation.parameters as Record<string, unknown>[];
        const param = assertDefined(params[0], "first parameter");
        expect(param.allowEmptyValue).toBe(true);
    });
});

describe("Swagger 2.0 response header constraint normalisation", () => {
    it("copies pattern and minLength into the synthesised header schema", () => {
        const doc: Record<string, unknown> = {
            swagger: "2.0",
            info: { title: "Test", version: "1.0.0" },
            paths: {
                "/items": {
                    get: {
                        operationId: "list",
                        responses: {
                            "200": {
                                description: "ok",
                                headers: {
                                    "X-Trace-Id": {
                                        type: "string",
                                        pattern: "^[0-9a-f]{32}$",
                                        minLength: 32,
                                        maxLength: 32,
                                    },
                                },
                            },
                        },
                    },
                },
            },
        };
        const normalised = normalise(doc);
        const paths = normalised.paths as Record<string, unknown>;
        const pathItem = paths["/items"] as Record<string, unknown>;
        const operation = pathItem.get as Record<string, unknown>;
        const responses = operation.responses as Record<string, unknown>;
        const response = responses["200"] as Record<string, unknown>;
        const headers = response.headers as Record<string, unknown>;
        const header = headers["X-Trace-Id"] as Record<string, unknown>;
        const schema = header.schema as Record<string, unknown>;
        expect(schema.pattern).toBe("^[0-9a-f]{32}$");
        expect(schema.minLength).toBe(32);
        expect(schema.maxLength).toBe(32);
    });

    it("copies array items constraints into header schema", () => {
        const doc: Record<string, unknown> = {
            swagger: "2.0",
            info: { title: "Test", version: "1.0.0" },
            paths: {
                "/items": {
                    get: {
                        operationId: "list",
                        responses: {
                            "200": {
                                description: "ok",
                                headers: {
                                    "X-Tags": {
                                        type: "array",
                                        items: {
                                            type: "string",
                                            minLength: 1,
                                        },
                                        minItems: 1,
                                        maxItems: 5,
                                        uniqueItems: true,
                                    },
                                },
                            },
                        },
                    },
                },
            },
        };
        const normalised = normalise(doc);
        const paths = normalised.paths as Record<string, unknown>;
        const pathItem = paths["/items"] as Record<string, unknown>;
        const operation = pathItem.get as Record<string, unknown>;
        const responses = operation.responses as Record<string, unknown>;
        const response = responses["200"] as Record<string, unknown>;
        const headers = response.headers as Record<string, unknown>;
        const header = headers["X-Tags"] as Record<string, unknown>;
        const schema = header.schema as Record<string, unknown>;
        expect(schema.minItems).toBe(1);
        expect(schema.maxItems).toBe(5);
        expect(schema.uniqueItems).toBe(true);
        const items = schema.items as Record<string, unknown>;
        expect(items.type).toBe("string");
        expect(items.minLength).toBe(1);
    });
});
