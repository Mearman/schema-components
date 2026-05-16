/**
 * Stories for JSON Schema composition keywords: allOf, anyOf, oneOf.
 */
import type { Meta, StoryObj } from "@storybook/react";
import { SchemaComponent } from "schema-components/react/SchemaComponent";

const meta: Meta<typeof SchemaComponent> = {
    title: "JSON Schema/Composition",
    component: SchemaComponent,
    tags: ["json-schema", "composition"],
    argTypes: {
        readOnly: { control: "boolean" },
    },
};
export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// allOf — intersection
// ---------------------------------------------------------------------------

const allOfSchema = {
    allOf: [
        {
            type: "object" as const,
            properties: {
                firstName: {
                    type: "string" as const,
                    description: "First name",
                },
                lastName: { type: "string" as const, description: "Last name" },
            },
            required: ["firstName", "lastName"],
        },
        {
            type: "object" as const,
            properties: {
                email: {
                    type: "string" as const,
                    format: "email",
                    description: "Email",
                },
            },
            required: ["email"],
        },
    ],
} as const;

export const AllOf: Story = {
    args: {
        schema: allOfSchema,
        value: {
            firstName: "Ada",
            lastName: "Lovelace",
            email: "ada@example.com",
        },
    },
};

export const AllOfReadOnly: Story = {
    args: {
        schema: allOfSchema,
        value: {
            firstName: "Ada",
            lastName: "Lovelace",
            email: "ada@example.com",
        },
        readOnly: true,
    },
};

// ---------------------------------------------------------------------------
// anyOf — nullable + general union
// ---------------------------------------------------------------------------

const anyOfNullableSchema = {
    type: "object" as const,
    properties: {
        name: { type: "string" as const, description: "Name" },
        nickname: {
            anyOf: [{ type: "string" as const }, { type: "null" as const }],
            description: "Nickname (optional)",
        },
    },
    required: ["name"],
} as const;

export const AnyOfNullable: Story = {
    args: {
        schema: anyOfNullableSchema,
        value: { name: "Ada", nickname: "The Countess" },
    },
};

export const AnyOfNullValue: Story = {
    name: "AnyOf Nullable (null value)",
    args: {
        schema: anyOfNullableSchema,
        value: { name: "Ada", nickname: null },
    },
};

// ---------------------------------------------------------------------------
// oneOf — generic union
// ---------------------------------------------------------------------------

const oneOfSchema = {
    type: "object" as const,
    properties: {
        identifier: {
            oneOf: [
                {
                    type: "object" as const,
                    properties: {
                        type: { const: "email" },
                        value: { type: "string" as const, format: "email" },
                    },
                },
                {
                    type: "object" as const,
                    properties: {
                        type: { const: "phone" },
                        value: {
                            type: "string" as const,
                            pattern: "^\\+?[0-9]+",
                        },
                    },
                },
            ],
            description: "Contact method",
        },
    },
} as const;

export const OneOf: Story = {
    args: {
        schema: oneOfSchema,
        value: { identifier: { type: "email", value: "ada@example.com" } },
    },
};
