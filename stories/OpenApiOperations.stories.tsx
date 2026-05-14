/**
 * Stories for OpenAPI operation components.
 */
import type { Meta, StoryObj } from "@storybook/react";
import {
    ApiOperation,
    ApiParameters,
    ApiRequestBody,
    ApiResponse,
} from "../src/openapi/components.tsx";

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
                    "201": {
                        description: "Created",
                        content: {
                            "application/json": {
                                schema: {
                                    type: "object",
                                    properties: {
                                        id: { type: "string", format: "uuid" },
                                        name: { type: "string" },
                                        status: { type: "string" },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
    },
} as const;

const meta: Meta = {
    title: "OpenAPI/Operations",
};

export default meta;
type Story = StoryObj<typeof meta>;

export const FullOperation: Story = {
    render: () => <ApiOperation schema={petStoreSpec} path="/pets" method="post" />,
};

export const ParametersOnly: Story = {
    render: () => <ApiParameters schema={petStoreSpec} path="/pets" method="get" />,
};

export const RequestBodyOnly: Story = {
    render: () => <ApiRequestBody schema={petStoreSpec} path="/pets" method="post" />,
};

export const ResponseOnly: Story = {
    render: () => <ApiResponse schema={petStoreSpec} path="/pets" method="post" status="201" />,
};
