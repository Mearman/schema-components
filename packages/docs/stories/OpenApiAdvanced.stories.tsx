/**
 * Stories for OpenAPI-specific features: nullable (3.0), discriminator,
 * Swagger 2.0, and webhooks.
 */
import type { Meta, StoryObj } from "@storybook/react";
import {
    ApiOperation,
    ApiRequestBody,
} from "schema-components/openapi/components";
import { SchemaComponent } from "schema-components/react/SchemaComponent";

const meta: Meta = {
    title: "OpenAPI/Advanced Features",
};
export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// OpenAPI 3.0.x nullable
// ---------------------------------------------------------------------------

const openApi30Spec = {
    openapi: "3.0.3",
    info: { title: "Nullable API", version: "1.0" },
    paths: {
        "/users/{id}": {
            get: {
                summary: "Get user",
                parameters: [
                    {
                        name: "id",
                        in: "path",
                        required: true,
                        schema: { type: "string" },
                    },
                ],
                responses: {
                    "200": {
                        description: "User",
                        content: {
                            "application/json": {
                                schema: {
                                    type: "object",
                                    properties: {
                                        name: { type: "string" },
                                        nickname: {
                                            type: "string",
                                            nullable: true,
                                            description: "Nullable nickname",
                                        },
                                        deletedAt: {
                                            type: "string",
                                            format: "date-time",
                                            nullable: true,
                                            description: "Deletion timestamp",
                                        },
                                    },
                                    required: ["name"],
                                },
                            },
                        },
                    },
                },
            },
        },
    },
} as const;

export const OpenApi30Nullable: Story = {
    name: "OpenAPI 3.0 nullable",
    render: () => (
        <SchemaComponent
            schema={openApi30Spec}
            ref="#/paths/~1users~1{id}/get/responses/200/content/application~1json/schema"
            value={{ name: "Ada", nickname: null, deletedAt: null }}
        />
    ),
};

export const OpenApi30NullablePresent: Story = {
    name: "OpenAPI 3.0 nullable (values present)",
    render: () => (
        <SchemaComponent
            schema={openApi30Spec}
            ref="#/paths/~1users~1{id}/get/responses/200/content/application~1json/schema"
            value={{
                name: "Grace",
                nickname: "Amazing Grace",
                deletedAt: "2024-01-15T10:30:00Z",
            }}
            readOnly
        />
    ),
};

// ---------------------------------------------------------------------------
// OpenAPI 3.0 discriminator
// ---------------------------------------------------------------------------

const discriminatorSpec = {
    openapi: "3.0.3",
    info: { title: "Pet Store", version: "1.0" },
    paths: {},
    components: {
        schemas: {
            Pet: {
                type: "object",
                properties: {
                    petType: { type: "string" },
                    name: { type: "string" },
                },
                required: ["petType", "name"],
                discriminator: {
                    propertyName: "petType",
                    mapping: {
                        dog: "#/components/schemas/Dog",
                        cat: "#/components/schemas/Cat",
                    },
                },
            },
            Dog: {
                allOf: [
                    { $ref: "#/components/schemas/Pet" },
                    {
                        type: "object",
                        properties: {
                            breed: {
                                type: "string",
                                enum: ["labrador", "poodle", "bulldog"],
                            },
                        },
                    },
                ],
            },
            Cat: {
                allOf: [
                    { $ref: "#/components/schemas/Pet" },
                    {
                        type: "object",
                        properties: {
                            indoor: { type: "boolean" },
                        },
                    },
                ],
            },
        },
    },
} as const;

export const DiscriminatorDog: Story = {
    render: () => (
        <SchemaComponent
            schema={discriminatorSpec}
            ref="#/components/schemas/Dog"
            value={{ petType: "dog", name: "Rex", breed: "labrador" }}
        />
    ),
};

export const DiscriminatorCat: Story = {
    render: () => (
        <SchemaComponent
            schema={discriminatorSpec}
            ref="#/components/schemas/Cat"
            value={{ petType: "cat", name: "Whiskers", indoor: true }}
            readOnly
        />
    ),
};

// ---------------------------------------------------------------------------
// Swagger 2.0 legacy document
// ---------------------------------------------------------------------------

const swaggerSpec = {
    swagger: "2.0",
    info: { title: "Legacy API", version: "1.0" },
    host: "api.example.com",
    basePath: "/v1",
    schemes: ["https"],
    paths: {
        "/items": {
            get: {
                summary: "List items",
                produces: ["application/json"],
                parameters: [
                    {
                        name: "limit",
                        in: "query",
                        type: "integer",
                        minimum: 1,
                        maximum: 100,
                    },
                    {
                        name: "sort",
                        in: "query",
                        type: "string",
                        enum: ["name", "date", "price"],
                    },
                ],
                responses: {
                    "200": {
                        description: "Items",
                        schema: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    id: { type: "string" },
                                    name: { type: "string" },
                                    price: { type: "number" },
                                },
                            },
                        },
                    },
                },
            },
            post: {
                summary: "Create item",
                consumes: ["application/json"],
                parameters: [
                    {
                        name: "body",
                        in: "body",
                        required: true,
                        schema: {
                            type: "object",
                            properties: {
                                name: { type: "string" },
                                price: { type: "number" },
                            },
                            required: ["name"],
                        },
                    },
                ],
                responses: {
                    "201": { description: "Created" },
                },
            },
        },
    },
    definitions: {
        Error: {
            type: "object",
            properties: {
                code: { type: "integer" },
                message: { type: "string" },
            },
            required: ["code", "message"],
        },
    },
} as const;

export const Swagger2ListItems: Story = {
    name: "Swagger 2.0 list items",
    render: () => (
        <ApiOperation schema={swaggerSpec} path="/items" method="get" />
    ),
};

export const Swagger2CreateItem: Story = {
    name: "Swagger 2.0 create item",
    render: () => (
        <ApiRequestBody schema={swaggerSpec} path="/items" method="post" />
    ),
};

export const Swagger2Definition: Story = {
    name: "Swagger 2.0 definition ref",
    render: () => (
        <SchemaComponent
            schema={swaggerSpec}
            ref="#/definitions/Error"
            value={{ code: 404, message: "Not found" }}
            readOnly
        />
    ),
};

// ---------------------------------------------------------------------------
// OpenAPI 3.1 webhook
// ---------------------------------------------------------------------------

const webhookSpec = {
    openapi: "3.1.0",
    info: { title: "Webhook API", version: "1.0" },
    paths: {},
    webhooks: {
        orderCreated: {
            post: {
                summary: "Order created event",
                requestBody: {
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                properties: {
                                    orderId: { type: "string", format: "uuid" },
                                    total: { type: "number" },
                                    currency: {
                                        type: "string",
                                        enum: ["GBP", "USD", "EUR"],
                                    },
                                },
                                required: ["orderId"],
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
} as const;

export const Webhook: Story = {
    name: "OpenAPI 3.1 webhook",
    render: () => (
        <ApiRequestBody
            schema={webhookSpec}
            path="orderCreated"
            method="post"
        />
    ),
};
