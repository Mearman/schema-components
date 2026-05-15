/**
 * Stories for raw JSON Schema input.
 */
import type { Meta, StoryObj } from "@storybook/react";
import { SchemaComponent } from "schema-components/react/SchemaComponent";

const profileSchema = {
    type: "object" as const,
    properties: {
        name: {
            type: "string" as const,
            description: "Full name",
            minLength: 1,
        },
        email: {
            type: "string" as const,
            format: "email",
            description: "Email address",
        },
        role: {
            type: "string" as const,
            enum: ["admin", "editor", "viewer"],
            description: "Role",
        },
        active: { type: "boolean" as const, description: "Active" },
        bio: { type: "string" as const, description: "Bio" },
    },
    required: ["name", "email", "role"] as const,
} as const;

const profileData = {
    name: "Ada Lovelace",
    email: "ada@example.com",
    role: "admin" as const,
    active: true,
    bio: "Mathematician and first programmer.",
};

const meta: Meta<typeof SchemaComponent> = {
    title: "Getting Started/JSON Schema",
    component: SchemaComponent,
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Editable: Story = {
    args: {
        schema: profileSchema,
        value: profileData,
    },
};

export const ReadOnly: Story = {
    args: {
        schema: profileSchema,
        value: profileData,
        readOnly: true,
    },
};

export const WriteOnly: Story = {
    args: {
        schema: profileSchema,
        writeOnly: true,
    },
};

export const WithFieldOverrides: Story = {
    args: {
        schema: profileSchema,
        value: profileData,
        fields: {
            bio: { description: "Biography", readOnly: false },
            role: { description: "User role" },
        },
    },
};
