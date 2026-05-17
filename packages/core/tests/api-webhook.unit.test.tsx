/**
 * Tests for the <ApiWebhook> and <ApiWebhooks> components.
 *
 * Webhooks (OpenAPI 3.1) are structurally Path Item Objects under
 * `webhooks`. The parser already resolves webhook names through the
 * same code path as paths; these components surface them in React.
 */
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { ApiWebhook, ApiWebhooks } from "../src/openapi/components.tsx";

const webhookOnlyDoc = {
    openapi: "3.1.0",
    info: { title: "Webhooks API", version: "1.0.0" },
    webhooks: {
        petCreated: {
            post: {
                operationId: "petCreatedWebhook",
                summary: "Notify on pet creation",
                requestBody: {
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                properties: {
                                    id: { type: "string" },
                                    name: { type: "string" },
                                },
                            },
                        },
                    },
                },
                responses: {
                    "200": { description: "Acknowledged" },
                },
            },
        },
        petDeleted: {
            post: {
                operationId: "petDeletedWebhook",
                summary: "Notify on pet deletion",
                responses: {
                    "200": { description: "Acknowledged" },
                },
            },
        },
    },
};

describe("<ApiWebhook>", () => {
    it("renders a single webhook by name", () => {
        const html = renderToString(
            createElement(ApiWebhook, {
                schema: webhookOnlyDoc,
                name: "petCreated",
            })
        );
        expect(html).toContain("petCreated");
        expect(html).toContain("Notify on pet creation");
        expect(html).toContain('data-webhook="petCreated"');
        // Operation rendered with method tag POST and the synthetic path
        // matching the webhook name.
        expect(html).toContain("POST petCreated");
    });

    it("returns null when the named webhook is missing", () => {
        const html = renderToString(
            createElement(ApiWebhook, {
                schema: webhookOnlyDoc,
                name: "nonexistent",
            })
        );
        expect(html).toBe("");
    });
});

describe("<ApiWebhooks>", () => {
    it("renders every webhook declared on the document", () => {
        const html = renderToString(
            createElement(ApiWebhooks, {
                schema: webhookOnlyDoc,
            })
        );
        expect(html).toContain("petCreated");
        expect(html).toContain("petDeleted");
        expect(html).toContain("Notify on pet creation");
        expect(html).toContain("Notify on pet deletion");
    });

    it("returns null for a document without webhooks", () => {
        const html = renderToString(
            createElement(ApiWebhooks, {
                schema: {
                    openapi: "3.1.0",
                    info: { title: "No webhooks", version: "1.0.0" },
                    paths: {},
                },
            })
        );
        expect(html).toBe("");
    });
});
