/**
 * Stories for OpenAPI component rendering.
 */
import type { Meta, StoryObj } from "@storybook/react";
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
    title: "OpenAPI",
    component: SchemaComponent,
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
