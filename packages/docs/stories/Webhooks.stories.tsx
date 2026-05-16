/**
 * Stories for OpenAPI 3.1 webhooks. Webhooks describe inbound calls the
 * API publisher makes *to* the consumer (the inverse of an operation),
 * declared under the top-level `webhooks` key in a 3.1 document.
 */
import type { Meta, StoryObj } from "@storybook/react";
import {
    parseOpenApiDocument,
    listWebhooks,
} from "schema-components/openapi/parser";
import { SchemaComponent } from "schema-components/react/SchemaComponent";
import { getProperty, isObject } from "schema-components/core/guards";

const meta: Meta = {
    title: "OpenAPI/Webhooks",
};
export default meta;
type Story = StoryObj<typeof meta>;

const webhookSpec: Record<string, unknown> = {
    openapi: "3.1.0",
    info: { title: "Pet store webhooks", version: "1.0" },
    paths: {},
    webhooks: {
        newPet: {
            post: {
                summary: "Notify subscribers of a new pet",
                description:
                    "Sent when a pet is registered. Respond 200 to acknowledge.",
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                properties: {
                                    id: { type: "integer", description: "ID" },
                                    name: {
                                        type: "string",
                                        description: "Pet name",
                                    },
                                    species: {
                                        type: "string",
                                        enum: ["dog", "cat", "rabbit"],
                                        description: "Species",
                                    },
                                },
                                required: ["id", "name", "species"],
                            },
                        },
                    },
                },
                responses: {
                    "200": { description: "Acknowledged" },
                    "410": { description: "Subscription cancelled" },
                },
            },
        },
        petUpdated: {
            put: {
                operationId: "petUpdated",
                summary: "Notify subscribers of a pet update",
                requestBody: {
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                properties: {
                                    id: { type: "integer", description: "ID" },
                                    changedFields: {
                                        type: "array",
                                        description: "Changed field names",
                                        items: { type: "string" },
                                    },
                                },
                                required: ["id"],
                            },
                        },
                    },
                },
                responses: {
                    "200": { description: "Acknowledged" },
                },
            },
        },
    },
};

function WebhookCatalogue() {
    const parsed = parseOpenApiDocument(webhookSpec);
    const webhooks = listWebhooks(parsed);

    return (
        <div>
            <h2>Webhooks</h2>
            {webhooks.map((webhook) => (
                <section
                    key={webhook.name}
                    data-webhook={webhook.name}
                    style={{
                        border: "1px solid #ddd",
                        padding: "1rem",
                        marginBottom: "1rem",
                        borderRadius: 4,
                    }}
                >
                    <h3>
                        <code>{webhook.name}</code>
                    </h3>
                    {webhook.operations.map((op) => {
                        const requestBody = getProperty(
                            op.operation,
                            "requestBody"
                        );
                        const content = getProperty(requestBody, "content");
                        const json = getProperty(content, "application/json");
                        const schema = getProperty(json, "schema");
                        const responses = getProperty(
                            op.operation,
                            "responses"
                        );
                        return (
                            <div
                                key={op.method}
                                data-method={op.method}
                                style={{ marginTop: "0.5rem" }}
                            >
                                <h4>
                                    <span
                                        style={{
                                            fontFamily: "monospace",
                                            background: "#eef",
                                            padding: "2px 6px",
                                            borderRadius: 3,
                                        }}
                                    >
                                        {op.method.toUpperCase()}
                                    </span>{" "}
                                    {op.summary}
                                </h4>
                                {op.description && <p>{op.description}</p>}
                                {isObject(schema) && (
                                    <>
                                        <h5>Payload</h5>
                                        <SchemaComponent
                                            schema={schema}
                                            readOnly
                                        />
                                    </>
                                )}
                                {isObject(responses) && (
                                    <>
                                        <h5>Expected responses</h5>
                                        <ul>
                                            {Object.entries(responses).map(
                                                ([code, value]) => (
                                                    <li key={code}>
                                                        <strong>{code}</strong>
                                                        {isObject(value) &&
                                                        typeof value.description ===
                                                            "string"
                                                            ? ` — ${value.description}`
                                                            : ""}
                                                    </li>
                                                )
                                            )}
                                        </ul>
                                    </>
                                )}
                            </div>
                        );
                    })}
                </section>
            ))}
        </div>
    );
}

export const PetStoreWebhooks: Story = {
    render: () => <WebhookCatalogue />,
};
