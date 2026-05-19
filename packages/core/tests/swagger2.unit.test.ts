/**
 * Swagger 2.0 → OpenAPI 3.x normalisation fixes.
 *
 * Captures the behaviours introduced by the fix cycle:
 *
 * 1. `collectionFormat: "tsv"` is dropped (no invalid `tabDelimited`
 *    style synthesised) and emits `swagger-collection-format-dropped`.
 * 2. `collectionFormat: "csv"` lands on `style: "form"` for
 *    query/cookie parameters and `style: "simple"` for path/header
 *    parameters — matching the OAS 3.x per-location defaults.
 * 3. An operation-level `consumes: []` is preserved as an empty
 *    content map (no silent `application/json` substitution) and
 *    surfaces `swagger-missing-consumes` with
 *    `detail.reason: "explicitly-cleared"`.
 * 4. An `oauth2` security scheme missing the `flow` field surfaces
 *    `swagger-malformed-oauth-flow` so the renderer's failure to
 *    produce a useful surface becomes visible to consumers.
 * 5. The refactored `resolveRefChain`-backed parameter resolver
 *    still emits `swagger-cyclic-parameter-ref` for cyclic refs.
 */

import { describe, it, expect } from "vitest";
import { normaliseOpenApiSchemas } from "../src/core/normalise.ts";
import { detectOpenApiVersion } from "../src/core/version.ts";
import { assertDefined } from "./helpers.ts";
import type { Diagnostic, DiagnosticSink } from "../src/core/diagnostics.ts";

function collect(doc: Record<string, unknown>): {
    result: Record<string, unknown>;
    diagnostics: Diagnostic[];
} {
    const version = detectOpenApiVersion(doc);
    const diagnostics: Diagnostic[] = [];
    const sink: DiagnosticSink = (d) => diagnostics.push(d);
    const result = normaliseOpenApiSchemas(
        doc,
        assertDefined(version, "version"),
        {
            diagnostics: sink,
        }
    );
    return { result, diagnostics };
}

describe("Swagger 2.0 collectionFormat:tsv handling", () => {
    it("drops tsv on a parameter and emits a diagnostic with location: parameter", () => {
        const doc: Record<string, unknown> = {
            swagger: "2.0",
            info: { title: "Test", version: "1.0.0" },
            paths: {
                "/items": {
                    get: {
                        operationId: "list",
                        parameters: [
                            {
                                name: "fields",
                                in: "query",
                                type: "array",
                                items: { type: "string" },
                                collectionFormat: "tsv",
                            },
                        ],
                        responses: { "200": { description: "ok" } },
                    },
                },
            },
        };

        const { result, diagnostics } = collect(doc);

        const diag = diagnostics.find(
            (d) => d.code === "swagger-collection-format-dropped"
        );
        expect(diag).toBeDefined();
        expect(diag?.detail?.feature).toBe("collectionFormat:tsv");
        expect(diag?.detail?.location).toBe("parameter");

        const paths = result.paths as Record<string, unknown>;
        const items = paths["/items"] as Record<string, unknown>;
        const get = items.get as Record<string, unknown>;
        const params = get.parameters as Record<string, unknown>[];
        const fields = assertDefined(params[0], "fields param");
        // `tabDelimited` is not a valid OAS 3.x style keyword — neither
        // it nor any other style should land on the normalised output.
        expect(fields.style).toBeUndefined();
        expect(fields.explode).toBeUndefined();
        // `collectionFormat` is the Swagger 2.0 keyword; it must not
        // survive into the OAS 3.x parameter shape.
        expect("collectionFormat" in fields).toBe(false);
    });

    it("drops tsv on a response header and emits a diagnostic with location: header", () => {
        const doc: Record<string, unknown> = {
            swagger: "2.0",
            info: { title: "Test", version: "1.0.0" },
            produces: ["application/json"],
            paths: {
                "/items": {
                    get: {
                        operationId: "list",
                        responses: {
                            "200": {
                                description: "ok",
                                schema: { type: "array" },
                                headers: {
                                    "X-Fields": {
                                        type: "array",
                                        items: { type: "string" },
                                        collectionFormat: "tsv",
                                    },
                                },
                            },
                        },
                    },
                },
            },
        };

        const { result, diagnostics } = collect(doc);

        const diag = diagnostics.find(
            (d) =>
                d.code === "swagger-collection-format-dropped" &&
                d.detail?.location === "header"
        );
        expect(diag).toBeDefined();
        expect(diag?.detail?.feature).toBe("collectionFormat:tsv");

        const paths = result.paths as Record<string, unknown>;
        const items = paths["/items"] as Record<string, unknown>;
        const get = items.get as Record<string, unknown>;
        const responses = get.responses as Record<string, unknown>;
        const ok = responses["200"] as Record<string, unknown>;
        const headers = ok.headers as Record<string, unknown>;
        const header = headers["X-Fields"] as Record<string, unknown>;
        expect(header.style).toBeUndefined();
        expect(header.explode).toBeUndefined();
        expect("collectionFormat" in header).toBe(false);
    });
});

describe("Swagger 2.0 collectionFormat:csv per-location mapping", () => {
    it("maps csv on a query parameter to style: form", () => {
        const doc: Record<string, unknown> = {
            swagger: "2.0",
            info: { title: "Test", version: "1.0.0" },
            paths: {
                "/items": {
                    get: {
                        operationId: "list",
                        parameters: [
                            {
                                name: "ids",
                                in: "query",
                                type: "array",
                                items: { type: "string" },
                                collectionFormat: "csv",
                            },
                        ],
                        responses: { "200": { description: "ok" } },
                    },
                },
            },
        };

        const { result } = collect(doc);
        const paths = result.paths as Record<string, unknown>;
        const items = paths["/items"] as Record<string, unknown>;
        const get = items.get as Record<string, unknown>;
        const params = get.parameters as Record<string, unknown>[];
        const ids = assertDefined(params[0], "ids param");

        expect(ids.style).toBe("form");
        expect(ids.explode).toBe(false);
    });

    it("maps csv on a path parameter to style: simple", () => {
        const doc: Record<string, unknown> = {
            swagger: "2.0",
            info: { title: "Test", version: "1.0.0" },
            paths: {
                "/items/{ids}": {
                    get: {
                        operationId: "getMany",
                        parameters: [
                            {
                                name: "ids",
                                in: "path",
                                required: true,
                                type: "array",
                                items: { type: "string" },
                                collectionFormat: "csv",
                            },
                        ],
                        responses: { "200": { description: "ok" } },
                    },
                },
            },
        };

        const { result } = collect(doc);
        const paths = result.paths as Record<string, unknown>;
        const items = paths["/items/{ids}"] as Record<string, unknown>;
        const get = items.get as Record<string, unknown>;
        const params = get.parameters as Record<string, unknown>[];
        const ids = assertDefined(params[0], "ids param");

        expect(ids.style).toBe("simple");
        expect(ids.explode).toBe(false);
    });

    it("maps csv on a header parameter to style: simple", () => {
        const doc: Record<string, unknown> = {
            swagger: "2.0",
            info: { title: "Test", version: "1.0.0" },
            paths: {
                "/items": {
                    get: {
                        operationId: "list",
                        parameters: [
                            {
                                name: "X-Tags",
                                in: "header",
                                type: "array",
                                items: { type: "string" },
                                collectionFormat: "csv",
                            },
                        ],
                        responses: { "200": { description: "ok" } },
                    },
                },
            },
        };

        const { result } = collect(doc);
        const paths = result.paths as Record<string, unknown>;
        const items = paths["/items"] as Record<string, unknown>;
        const get = items.get as Record<string, unknown>;
        const params = get.parameters as Record<string, unknown>[];
        const tags = assertDefined(params[0], "X-Tags param");

        expect(tags.style).toBe("simple");
        expect(tags.explode).toBe(false);
    });
});

describe("Swagger 2.0 explicit empty consumes preservation", () => {
    it("preserves an empty content map and emits the explicitly-cleared diagnostic", () => {
        const doc: Record<string, unknown> = {
            swagger: "2.0",
            info: { title: "Test", version: "1.0.0" },
            paths: {
                "/pets": {
                    post: {
                        operationId: "createPet",
                        consumes: [],
                        parameters: [
                            {
                                name: "pet",
                                in: "body",
                                schema: { type: "object" },
                            },
                        ],
                        responses: { "201": { description: "Created" } },
                    },
                },
            },
        };

        const { result, diagnostics } = collect(doc);

        const diag = diagnostics.find(
            (d) =>
                d.code === "swagger-missing-consumes" &&
                d.detail?.reason === "explicitly-cleared"
        );
        expect(diag).toBeDefined();
        expect(diag?.detail?.level).toBe("operation");
        expect(diag?.detail?.source).toBe("operation");

        const paths = result.paths as Record<string, unknown>;
        const pets = paths["/pets"] as Record<string, unknown>;
        const post = pets.post as Record<string, unknown>;
        const requestBody = post.requestBody as Record<string, unknown>;
        const content = requestBody.content as Record<string, unknown>;
        // No `application/json` invented — the empty content map is
        // preserved so consumers can see the intentional clear.
        expect(Object.keys(content)).toEqual([]);
    });

    it("does NOT emit the explicitly-cleared diagnostic when consumes carries entries", () => {
        const doc: Record<string, unknown> = {
            swagger: "2.0",
            info: { title: "Test", version: "1.0.0" },
            paths: {
                "/pets": {
                    post: {
                        operationId: "createPet",
                        consumes: ["application/xml"],
                        parameters: [
                            {
                                name: "pet",
                                in: "body",
                                schema: { type: "object" },
                            },
                        ],
                        responses: { "201": { description: "Created" } },
                    },
                },
            },
        };

        const { diagnostics } = collect(doc);

        expect(
            diagnostics.find(
                (d) =>
                    d.code === "swagger-missing-consumes" &&
                    d.detail?.reason === "explicitly-cleared"
            )
        ).toBeUndefined();
    });
});

describe("Swagger 2.0 oauth2 missing flow", () => {
    it("emits swagger-malformed-oauth-flow when oauth2.flow is absent", () => {
        const doc: Record<string, unknown> = {
            swagger: "2.0",
            info: { title: "Test", version: "1.0.0" },
            paths: {},
            securityDefinitions: {
                petsAuth: {
                    type: "oauth2",
                    // `flow` is missing — malformed per the Swagger 2.0 spec
                    authorizationUrl: "https://auth.example.com/authorize",
                    scopes: { "read:pets": "read your pets" },
                },
            },
        };

        const { result, diagnostics } = collect(doc);

        const diag = diagnostics.find(
            (d) => d.code === "swagger-malformed-oauth-flow"
        );
        expect(diag).toBeDefined();
        expect(diag?.detail?.name).toBe("petsAuth");

        // The broken shape is preserved verbatim so any partial
        // information remains visible to downstream consumers.
        const components = assertDefined(
            result.components,
            "components present"
        ) as Record<string, unknown>;
        const securitySchemes = components.securitySchemes as Record<
            string,
            unknown
        >;
        const petsAuth = securitySchemes.petsAuth as Record<string, unknown>;
        expect(petsAuth.type).toBe("oauth2");
        expect(petsAuth.authorizationUrl).toBe(
            "https://auth.example.com/authorize"
        );
    });
});

describe("Swagger 2.0 path-level parameters", () => {
    // Common idiom in Swagger 2.0: declare the `{id}` path placeholder
    // on the Path Item Object so every operation under that path
    // inherits it. The OpenAPI 3.x normaliser must preserve those
    // parameters under `paths["/x"].parameters` and lift their type /
    // format keywords into the OAS 3.x `schema` shape just like it
    // does for operation-level parameters.
    it("normalises a shared path-level {id} parameter into OAS 3.x form", () => {
        const doc: Record<string, unknown> = {
            swagger: "2.0",
            info: { title: "Test", version: "1.0.0" },
            paths: {
                "/items/{id}": {
                    parameters: [
                        {
                            name: "id",
                            in: "path",
                            required: true,
                            type: "string",
                            format: "uuid",
                        },
                    ],
                    get: {
                        operationId: "get",
                        responses: { "200": { description: "ok" } },
                    },
                    delete: {
                        operationId: "del",
                        responses: { "204": { description: "ok" } },
                    },
                },
            },
        };

        const { result } = collect(doc);
        const paths = result.paths as Record<string, unknown>;
        const item = paths["/items/{id}"] as Record<string, unknown>;
        const params = item.parameters as Record<string, unknown>[];
        expect(params).toHaveLength(1);
        const idParam = assertDefined(params[0], "id param survives");
        expect(idParam.name).toBe("id");
        expect(idParam.in).toBe("path");
        expect(idParam.required).toBe(true);
        // Swagger 2.0 keywords have been hoisted into `schema`; the
        // shorthand `type` / `format` keys must not survive on the
        // OAS 3.x parameter root.
        expect("type" in idParam).toBe(false);
        expect("format" in idParam).toBe(false);
        const schema = idParam.schema as Record<string, unknown>;
        expect(schema.type).toBe("string");
        expect(schema.format).toBe("uuid");
        // Operations are still preserved alongside the shared params.
        expect(item.get).toBeDefined();
        expect(item.delete).toBeDefined();
    });

    it("resolves a $ref in the path-level parameters array", () => {
        const doc: Record<string, unknown> = {
            swagger: "2.0",
            info: { title: "Test", version: "1.0.0" },
            paths: {
                "/items/{id}": {
                    parameters: [{ $ref: "#/parameters/IdParam" }],
                    get: {
                        operationId: "get",
                        responses: { "200": { description: "ok" } },
                    },
                },
            },
            parameters: {
                IdParam: {
                    name: "id",
                    in: "path",
                    required: true,
                    type: "integer",
                    minimum: 1,
                },
            },
        };

        const { result } = collect(doc);
        const paths = result.paths as Record<string, unknown>;
        const item = paths["/items/{id}"] as Record<string, unknown>;
        const params = item.parameters as Record<string, unknown>[];
        expect(params).toHaveLength(1);
        const idParam = assertDefined(params[0], "resolved $ref param");
        expect(idParam.name).toBe("id");
        expect(idParam.in).toBe("path");
        const schema = idParam.schema as Record<string, unknown>;
        expect(schema.type).toBe("integer");
        expect(schema.minimum).toBe(1);
    });

    it("emits swagger-cyclic-parameter-ref for a cyclic path-level $ref and skips the entry", () => {
        const doc: Record<string, unknown> = {
            swagger: "2.0",
            info: { title: "Test", version: "1.0.0" },
            paths: {
                "/items/{id}": {
                    parameters: [{ $ref: "#/parameters/Recursive" }],
                    get: {
                        operationId: "get",
                        responses: { "200": { description: "ok" } },
                    },
                },
            },
            parameters: {
                Recursive: { $ref: "#/parameters/Recursive" },
            },
        };

        const { result, diagnostics } = collect(doc);
        const diag = diagnostics.find(
            (d) => d.code === "swagger-cyclic-parameter-ref"
        );
        expect(diag).toBeDefined();
        expect(diag?.detail?.ref).toBe("#/parameters/Recursive");

        const paths = result.paths as Record<string, unknown>;
        const item = paths["/items/{id}"] as Record<string, unknown>;
        const params = item.parameters as unknown[];
        // The cyclic entry is dropped — empty array remains so the
        // shape is canonical (always an array, never `undefined`).
        expect(params).toEqual([]);
    });

    it("preserves non-object entries in the path-level parameters array verbatim", () => {
        // Defensive: a Swagger 2.0 document may carry a malformed
        // non-object entry. The normaliser passes it through
        // unchanged so downstream validators still see the original
        // shape and can flag it.
        const doc: Record<string, unknown> = {
            swagger: "2.0",
            info: { title: "Test", version: "1.0.0" },
            paths: {
                "/items": {
                    parameters: ["not-an-object", 42],
                    get: {
                        operationId: "get",
                        responses: { "200": { description: "ok" } },
                    },
                },
            },
        };

        const { result } = collect(doc);
        const paths = result.paths as Record<string, unknown>;
        const item = paths["/items"] as Record<string, unknown>;
        const params = item.parameters as unknown[];
        expect(params).toEqual(["not-an-object", 42]);
    });
});

describe("Swagger 2.0 cyclic parameter ref via shared resolveRefChain", () => {
    it("still emits swagger-cyclic-parameter-ref on a self-cycle", () => {
        const doc: Record<string, unknown> = {
            swagger: "2.0",
            info: { title: "Test", version: "1.0.0" },
            paths: {
                "/items": {
                    get: {
                        operationId: "list",
                        parameters: [{ $ref: "#/parameters/Recursive" }],
                        responses: { "200": { description: "ok" } },
                    },
                },
            },
            parameters: {
                Recursive: { $ref: "#/parameters/Recursive" },
            },
        };

        const { result, diagnostics } = collect(doc);

        const diag = diagnostics.find(
            (d) => d.code === "swagger-cyclic-parameter-ref"
        );
        expect(diag).toBeDefined();
        expect(diag?.detail?.ref).toBe("#/parameters/Recursive");

        const paths = result.paths as Record<string, unknown>;
        const items = paths["/items"] as Record<string, unknown>;
        const get = items.get as Record<string, unknown>;
        // Parameter is skipped — no junk `{ $ref }` envelope survives.
        expect(get.parameters).toBeUndefined();
    });
});
