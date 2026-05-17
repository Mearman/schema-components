/**
 * Schema defaults stories — demonstrates default values from
 * z.string().default() and JSON Schema "default" keyword.
 */
import type { Meta, StoryObj } from "@storybook/react";
import { z } from "zod";
import { SchemaComponent } from "schema-components/react/SchemaComponent";

const meta = {
    title: "Inputs/Defaults",
    component: SchemaComponent,
    tags: ["editable", "zod", "json-schema"],
} satisfies Meta<typeof SchemaComponent>;
export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// Zod defaults
// ---------------------------------------------------------------------------

const userSchema = z.object({
    name: z.string().default("Anonymous"),
    role: z.enum(["admin", "editor", "viewer"]).default("viewer"),
    active: z.boolean().default(true),
    score: z.number().default(0),
});

export const NoValue: Story = {
    name: "No value — defaults fill in",
    args: {
        schema: userSchema,
    },
};

export const PartialValue: Story = {
    name: "Partial value — defaults fill gaps",
    args: {
        schema: userSchema,
        value: { name: "Ada" },
    },
};

export const FullValue: Story = {
    name: "Full value — defaults not used",
    args: {
        schema: userSchema,
        value: { name: "Grace", role: "admin", active: false, score: 100 },
    },
};

export const ReadOnlyDefaults: Story = {
    name: "Read-only with defaults",
    args: {
        schema: userSchema,
        readOnly: true,
    },
};

// ---------------------------------------------------------------------------
// Nested defaults
// ---------------------------------------------------------------------------

const nestedSchema = z.object({
    user: z.object({
        name: z.string().default("Unknown"),
        email: z.string().default("none@example.com"),
    }),
    settings: z.object({
        theme: z.enum(["light", "dark"]).default("light"),
        notifications: z.boolean().default(true),
    }),
});

export const NestedDefaults: Story = {
    name: "Nested object defaults",
    args: {
        schema: nestedSchema,
    },
};

// ---------------------------------------------------------------------------
// JSON Schema defaults
// ---------------------------------------------------------------------------

const jsonSchema = {
    type: "object" as const,
    properties: {
        greeting: { type: "string" as const, default: "Hello, World!" },
        count: { type: "number" as const, default: 42 },
        enabled: { type: "boolean" as const, default: false },
    },
} as const;

export const JsonSchemaDefaults: Story = {
    name: "JSON Schema defaults",
    args: {
        schema: jsonSchema,
    },
};

// ---------------------------------------------------------------------------
// Array defaults
// ---------------------------------------------------------------------------

const arraySchema = z.object({
    tags: z.array(z.string()).default(["react", "typescript"]),
});

export const ArrayDefaults: Story = {
    name: "Array with defaults",
    args: {
        schema: arraySchema,
        readOnly: true,
    },
};
