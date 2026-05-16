/**
 * Stories for OpenAPI component rendering.
 */
import type { Meta, StoryObj } from "@storybook/react";
import { linkTo } from "@storybook/addon-links";
import { SchemaComponent } from "schema-components/react/SchemaComponent";

// ---------------------------------------------------------------------------
// OpenAPI spec
// ---------------------------------------------------------------------------

const petStoreSpec = {
    openapi: "3.1.0",
    info: { title: "Pet Store", version: "1.0.0" },
    paths: {
        "/pets": {
            get: {
                summary: "List pets",
                parameters: [
                    {
                        name: "limit",
                        in: "query",
                        required: false,
                        schema: { type: "integer", minimum: 1, maximum: 100 },
                    },
                    {
                        name: "status",
                        in: "query",
                        required: false,
                        schema: {
                            type: "string",
                            enum: ["available", "pending", "sold"],
                        },
                    },
                ],
                responses: {
                    "200": {
                        description: "A list of pets",
                        content: {
                            "application/json": {
                                schema: {
                                    type: "object",
                                    properties: {
                                        pets: {
                                            type: "array",
                                            items: {
                                                type: "object",
                                                properties: {
                                                    id: {
                                                        type: "string",
                                                        format: "uuid",
                                                    },
                                                    name: { type: "string" },
                                                    status: { type: "string" },
                                                },
                                            },
                                        },
                                        total: { type: "integer" },
                                    },
                                },
                            },
                        },
                    },
                },
            },
            post: {
                summary: "Create a pet",
                requestBody: {
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                properties: {
                                    name: { type: "string", minLength: 1 },
                                    status: {
                                        type: "string",
                                        enum: ["available", "pending"],
                                    },
                                    tag: { type: "string" },
                                },
                                required: ["name"],
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
    components: {
        schemas: {
            Pet: {
                type: "object",
                properties: {
                    id: { type: "string", format: "uuid" },
                    name: { type: "string" },
                    status: {
                        type: "string",
                        enum: ["available", "pending", "sold"],
                    },
                },
                required: ["id", "name"],
            },
        },
    },
} as const;

// ---------------------------------------------------------------------------
// Story metadata
// ---------------------------------------------------------------------------

const meta: Meta<typeof SchemaComponent> = {
    title: "OpenAPI/Schema Documents",
    component: SchemaComponent,
    tags: ["openapi", "editable", "readonly"],
    argTypes: {
        readOnly: { control: "boolean" },
    },
};

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

export const ComponentSchema: Story = {
    args: {
        schema: petStoreSpec,
        ref: "#/components/schemas/Pet",
        value: {
            id: "pet_abc123",
            name: "Fido",
            status: "available",
        },
    },
};

export const ComponentSchemaReadOnly: Story = {
    args: {
        schema: petStoreSpec,
        ref: "#/components/schemas/Pet",
        value: {
            id: "pet_abc123",
            name: "Fido",
            status: "available",
        },
        readOnly: true,
    },
};

export const SeeAlsoOperations: StoryObj = {
    name: "See also: Operations",
    tags: ["openapi"],
    parameters: {
        docs: {
            description: {
                story: "Component schemas are the building blocks. The Operations stories show how the same OpenAPI document renders request bodies, parameters, and responses end-to-end.",
            },
        },
    },
    render: () => (
        <div
            style={{
                display: "grid",
                gap: "0.75rem",
                maxWidth: "32rem",
                padding: "1rem",
                border: "1px solid #e5e7eb",
                borderRadius: "0.5rem",
            }}
        >
            <p style={{ margin: 0, color: "#475569", fontSize: "0.875rem" }}>
                Move from rendering the underlying Pet schema to rendering a
                full operation, or focused parameter or webhook stories.
            </p>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                <button
                    type="button"
                    onClick={linkTo("OpenAPI/Operations", "FullOperation")}
                    style={{
                        border: "1px solid #2563eb",
                        background: "#2563eb",
                        color: "#fff",
                        borderRadius: "0.375rem",
                        padding: "0.5rem 0.875rem",
                        cursor: "pointer",
                        fontSize: "0.875rem",
                    }}
                >
                    POST /pets operation
                </button>
                <button
                    type="button"
                    onClick={linkTo("OpenAPI/Operations", "ParametersOnly")}
                    style={{
                        border: "1px solid #94a3b8",
                        background: "#fff",
                        color: "#0f172a",
                        borderRadius: "0.375rem",
                        padding: "0.5rem 0.875rem",
                        cursor: "pointer",
                        fontSize: "0.875rem",
                    }}
                >
                    Parameters only
                </button>
                <button
                    type="button"
                    onClick={linkTo("OpenAPI/Webhooks", "PetStoreWebhooks")}
                    style={{
                        border: "1px solid #94a3b8",
                        background: "#fff",
                        color: "#0f172a",
                        borderRadius: "0.375rem",
                        padding: "0.5rem 0.875rem",
                        cursor: "pointer",
                        fontSize: "0.875rem",
                    }}
                >
                    Webhooks
                </button>
            </div>
        </div>
    ),
};
