/**
 * Stories for OpenAPI advanced features: callbacks, links, external docs.
 */
import type { Meta, StoryObj } from "@storybook/react";
import {
    ApiOperation,
    ApiRequestBody,
} from "schema-components/openapi/components";
import { SchemaComponent } from "schema-components/react/SchemaComponent";

// ---------------------------------------------------------------------------
// OpenAPI 3.0 callback
// ---------------------------------------------------------------------------

const callbackSpec = {
    openapi: "3.0.3",
    info: { title: "Subscription API", version: "1.0" },
    paths: {
        "/subscribe": {
            post: {
                summary: "Subscribe to events",
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                properties: {
                                    callbackUrl: {
                                        type: "string",
                                        format: "uri",
                                    },
                                    events: {
                                        type: "array",
                                        items: {
                                            type: "string",
                                            enum: [
                                                "order.created",
                                                "order.updated",
                                                "order.cancelled",
                                            ],
                                        },
                                    },
                                },
                                required: ["callbackUrl"],
                            },
                        },
                    },
                },
                callbacks: {
                    onEvent: {
                        "{$request.body#/callbackUrl}": {
                            post: {
                                summary: "Event callback payload",
                                requestBody: {
                                    content: {
                                        "application/json": {
                                            schema: {
                                                type: "object",
                                                properties: {
                                                    eventType: {
                                                        type: "string",
                                                    },
                                                    timestamp: {
                                                        type: "string",
                                                        format: "date-time",
                                                    },
                                                    payload: {
                                                        type: "object",
                                                    },
                                                },
                                                required: ["eventType"],
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
                },
                responses: {
                    "201": { description: "Subscribed" },
                },
            },
        },
    },
} as const;

// ---------------------------------------------------------------------------
// OpenAPI 3.0 response links
// ---------------------------------------------------------------------------

const linksSpec = {
    openapi: "3.0.3",
    info: { title: "User API", version: "1.0" },
    paths: {
        "/users": {
            post: {
                summary: "Create user",
                operationId: "createUser",
                requestBody: {
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                properties: {
                                    name: { type: "string" },
                                    email: { type: "string", format: "email" },
                                },
                                required: ["name", "email"],
                            },
                        },
                    },
                },
                responses: {
                    "201": {
                        description: "User created",
                        links: {
                            GetUserById: {
                                operationId: "getUser",
                                parameters: {
                                    userId: "$response.body#/id",
                                },
                            },
                            DeleteUser: {
                                operationId: "deleteUser",
                                parameters: {
                                    userId: "$response.body#/id",
                                },
                            },
                        },
                    },
                },
            },
        },
        "/users/{userId}": {
            get: {
                summary: "Get user by ID",
                operationId: "getUser",
                parameters: [
                    {
                        name: "userId",
                        in: "path",
                        required: true,
                        schema: { type: "string", format: "uuid" },
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
                                        id: { type: "string" },
                                        name: { type: "string" },
                                        email: { type: "string" },
                                    },
                                },
                            },
                        },
                    },
                },
            },
            delete: {
                summary: "Delete user",
                operationId: "deleteUser",
                parameters: [
                    {
                        name: "userId",
                        in: "path",
                        required: true,
                        schema: { type: "string", format: "uuid" },
                    },
                ],
                responses: {
                    "204": { description: "Deleted" },
                },
            },
        },
    },
} as const;

// ---------------------------------------------------------------------------
// Schema with externalDocs and XML
// ---------------------------------------------------------------------------

const xmlDocsSpec = {
    openapi: "3.0.3",
    info: { title: "Pet API", version: "1.0" },
    paths: {},
    components: {
        schemas: {
            Pet: {
                type: "object",
                properties: {
                    id: { type: "integer" },
                    name: { type: "string" },
                    status: { type: "string", enum: ["available", "sold"] },
                },
                required: ["id", "name"],
                xml: { name: "Pet", namespace: "https://example.com/pet" },
                externalDocs: {
                    url: "https://example.com/docs/pet-schema",
                    description: "Pet schema documentation",
                },
            },
        },
    },
} as const;

// ---------------------------------------------------------------------------
// Story metadata
// ---------------------------------------------------------------------------

// ApiOperation is the most-common component (3 of 6 stories). The remaining
// three stories render either ApiRequestBody or SchemaComponent and keep
// their own `render`, typed against the component they render.
const meta: Meta<typeof ApiOperation> = {
    title: "OpenAPI/Callbacks & Links",
    component: ApiOperation,
    tags: ["openapi"],
};
export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// ApiOperation stories (args-only)
// ---------------------------------------------------------------------------

export const SubscriptionWithCallback: Story = {
    args: {
        schema: callbackSpec,
        path: "/subscribe",
        method: "post",
    },
};

export const CreateUserWithLinks: Story = {
    args: {
        schema: linksSpec,
        path: "/users",
        method: "post",
    },
};

export const GetUserWithParams: Story = {
    args: {
        schema: linksSpec,
        path: "/users/{userId}",
        method: "get",
    },
};

// ---------------------------------------------------------------------------
// ApiRequestBody / SchemaComponent stories — kept on `render` because they
// render a component other than the file's dominant `ApiOperation`.
// ---------------------------------------------------------------------------

/** Renders ApiRequestBody; kept on `render` because meta.component is ApiOperation. */
export const SubscriptionBody: StoryObj<typeof ApiRequestBody> = {
    render: () => (
        <ApiRequestBody schema={callbackSpec} path="/subscribe" method="post" />
    ),
};

/** Renders SchemaComponent; kept on `render` because meta.component is ApiOperation. */
export const SchemaWithXmlAndDocs: StoryObj<typeof SchemaComponent> = {
    render: () => (
        <SchemaComponent
            schema={xmlDocsSpec}
            ref="#/components/schemas/Pet"
            value={{ id: 1, name: "Fido", status: "available" }}
        />
    ),
};

/** Renders SchemaComponent; kept on `render` because meta.component is ApiOperation. */
export const SchemaWithXmlAndDocsReadOnly: StoryObj<typeof SchemaComponent> = {
    render: () => (
        <SchemaComponent
            schema={xmlDocsSpec}
            ref="#/components/schemas/Pet"
            value={{ id: 1, name: "Fido", status: "available" }}
            readOnly
        />
    ),
};
