import type { Meta, StoryObj } from "@storybook/react";
import { z } from "zod";
import { SchemaComponent } from "schema-components/react/SchemaComponent";

const userSchema = z.object({
    name: z.string().min(1).meta({ description: "Full name" }),
    email: z.email().meta({ description: "Email address" }),
    role: z.enum(["admin", "editor", "viewer"]).meta({ description: "Role" }),
    active: z.boolean().meta({ description: "Active" }),
});

const userData = {
    name: "Ada Lovelace",
    email: "ada@example.com",
    role: "admin" as const,
    active: true,
};

const meta: Meta<typeof SchemaComponent> = {
    title: "Getting Started/Introduction",
    component: SchemaComponent,
    tags: ["autodocs", "editable", "readonly", "zod"],
    argTypes: {
        readOnly: {
            control: "boolean",
            description: "Render the form as read-only formatted output.",
        },
        writeOnly: {
            control: "boolean",
            description: "Force every field to render as an editable input.",
        },
    },
};

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Default editable form — every field rendered as an input.
 */
export const Default: Story = {
    args: {
        schema: userSchema,
        value: userData,
    },
};

/**
 * Read-only display — formatted text, links, and badges.
 */
export const ReadOnly: Story = {
    args: {
        schema: userSchema,
        value: userData,
        readOnly: true,
    },
};
