/**
 * Stories for OpenAPI operation components.
 */
import type { Meta, StoryObj } from "@storybook/react";
import { expect, within } from "storybook/test";
import { linkTo } from "@storybook/addon-links";
import {
    ApiOperation,
    ApiParameters,
    ApiRequestBody,
    ApiResponse,
} from "schema-components/openapi/components";

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
    tags: ["openapi", "editable"],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const FullOperation: Story = {
    tags: ["openapi", "editable"],
    render: () => (
        <div style={{ display: "grid", gap: "1rem" }}>
            <ApiOperation schema={petStoreSpec} path="/pets" method="post" />
            <div>
                <button
                    type="button"
                    onClick={linkTo(
                        "OpenAPI/Schema Documents",
                        "ComponentSchema"
                    )}
                    style={{
                        border: "1px solid var(--sc-border-input)",
                        background: "var(--sc-bg-secondary)",
                        color: "var(--sc-text)",
                        borderRadius: "0.375rem",
                        padding: "0.5rem 0.875rem",
                        cursor: "pointer",
                        fontSize: "0.875rem",
                        marginRight: "0.5rem",
                    }}
                >
                    Open the underlying Pet schema
                </button>
                <button
                    type="button"
                    onClick={linkTo("OpenAPI/Completeness", "Default")}
                    style={{
                        border: "1px solid var(--sc-border-input)",
                        background: "var(--sc-bg-secondary)",
                        color: "var(--sc-text)",
                        borderRadius: "0.375rem",
                        padding: "0.5rem 0.875rem",
                        cursor: "pointer",
                        fontSize: "0.875rem",
                    }}
                >
                    See completeness coverage
                </button>
            </div>
        </div>
    ),
    play: async ({ canvasElement, step }) => {
        const canvas = within(canvasElement);
        await step(
            "the operation lays out request body and response sections",
            async () => {
                const operation = canvasElement.querySelector(
                    "[data-operation='POST /pets']"
                );
                await expect(operation).not.toBeNull();
                const requestBody = canvasElement.querySelector(
                    "[data-request-body]"
                );
                await expect(requestBody).not.toBeNull();
                const responses =
                    canvasElement.querySelector("[data-responses]");
                await expect(responses).not.toBeNull();
            }
        );
        await step(
            "request body schema is rendered into editable form controls",
            async () => {
                const textInputs = await canvas.findAllByRole("textbox");
                await expect(textInputs.length).toBeGreaterThanOrEqual(1);
                const select = canvas.getByRole("combobox");
                await expect(select).toBeInTheDocument();
            }
        );
    },
};

export const ParametersOnly: Story = {
    tags: ["openapi", "editable"],
    render: () => (
        <ApiParameters schema={petStoreSpec} path="/pets" method="get" />
    ),
    play: async ({ canvasElement }) => {
        const parameters = canvasElement.querySelector("[data-parameters]");
        await expect(parameters).not.toBeNull();
        const limit = canvasElement.querySelector("[data-parameter='limit']");
        await expect(limit).not.toBeNull();
        const status = canvasElement.querySelector("[data-parameter='status']");
        await expect(status).not.toBeNull();
    },
};

export const RequestBodyOnly: Story = {
    tags: ["openapi", "editable"],
    render: () => (
        <ApiRequestBody schema={petStoreSpec} path="/pets" method="post" />
    ),
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        const textInputs = await canvas.findAllByRole("textbox");
        await expect(textInputs.length).toBeGreaterThanOrEqual(1);
        for (const input of textInputs) {
            await expect(input).toBeEnabled();
        }
    },
};

export const ResponseOnly: Story = {
    tags: ["openapi", "readonly"],
    render: () => (
        <ApiResponse
            schema={petStoreSpec}
            path="/pets"
            method="post"
            status="201"
        />
    ),
    play: async ({ canvasElement }) => {
        const responseSection = canvasElement.querySelector("[data-status]");
        await expect(responseSection).not.toBeNull();
        await expect(responseSection).toHaveAttribute("data-status", "201");
    },
};
