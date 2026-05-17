/**
 * <ApiOperation> / <ApiRequestBody> surface OpenAPI externalDocs and
 * schema-level xml metadata. Without this rendering, useful author
 * intent (documentation links, XML namespaces) is silently dropped.
 */
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { ApiOperation, ApiRequestBody } from "../src/openapi/components.tsx";

const docWithExternalDocsAndXml = {
    openapi: "3.0.3",
    info: { title: "Test", version: "1.0" },
    paths: {
        "/pets": {
            post: {
                operationId: "createPet",
                externalDocs: {
                    url: "https://docs.example.com/pets/create",
                    description: "How to create a pet",
                },
                requestBody: {
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                xml: {
                                    name: "Pet",
                                    namespace: "https://example.com/pets",
                                },
                                properties: {
                                    id: { type: "string" },
                                    name: { type: "string" },
                                },
                            },
                        },
                    },
                },
                responses: {
                    "201": { description: "Created" },
                },
            },
        },
    },
};

describe("ApiOperation rendering of externalDocs and xml", () => {
    it("renders an externalDocs link", () => {
        const html = renderToString(
            createElement(ApiOperation, {
                schema: docWithExternalDocsAndXml,
                path: "/pets",
                method: "post",
            })
        );
        expect(html).toContain('href="https://docs.example.com/pets/create"');
        expect(html).toContain("How to create a pet");
    });

    it("renders a schema-level xml footnote on the request body", () => {
        const html = renderToString(
            createElement(ApiOperation, {
                schema: docWithExternalDocsAndXml,
                path: "/pets",
                method: "post",
            })
        );
        expect(html).toContain("data-schema-xml");
        expect(html).toContain("name: Pet");
        expect(html).toContain("namespace: https://example.com/pets");
    });
});

describe("ApiRequestBody rendering of xml", () => {
    it("renders an xml footnote on the request body schema", () => {
        const html = renderToString(
            createElement(ApiRequestBody, {
                schema: docWithExternalDocsAndXml,
                path: "/pets",
                method: "post",
            })
        );
        expect(html).toContain("data-schema-xml");
        expect(html).toContain("name: Pet");
    });
});
