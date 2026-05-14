/**
 * Schema defaults stories — demonstrates default values from
 * z.string().default() and JSON Schema "default" keyword.
 */
import type { Meta, StoryObj } from "@storybook/react";
import { z } from "zod";
import { SchemaComponent } from "../src/react/SchemaComponent.tsx";

const meta: Meta = {
    title: "Schema Defaults",
};
export default meta;

// ---------------------------------------------------------------------------
// Zod defaults
// ---------------------------------------------------------------------------

const userSchema = z.object({
    name: z.string().default("Anonymous"),
    role: z.enum(["admin", "editor", "viewer"]).default("viewer"),
    active: z.boolean().default(true),
    score: z.number().default(0),
});

export const NoValue: StoryObj = {
    name: "No value — defaults fill in",
    render: () => <SchemaComponent schema={userSchema} />,
};

export const PartialValue: StoryObj = {
    name: "Partial value — defaults fill gaps",
    render: () => (
        <SchemaComponent schema={userSchema} value={{ name: "Ada" }} />
    ),
};

export const FullValue: StoryObj = {
    name: "Full value — defaults not used",
    render: () => (
        <SchemaComponent
            schema={userSchema}
            value={{ name: "Grace", role: "admin", active: false, score: 100 }}
        />
    ),
};

export const ReadOnlyDefaults: StoryObj = {
    name: "Read-only with defaults",
    render: () => <SchemaComponent schema={userSchema} readOnly />,
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

export const NestedDefaults: StoryObj = {
    name: "Nested object defaults",
    render: () => <SchemaComponent schema={nestedSchema} />,
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

export const JsonSchemaDefaults: StoryObj = {
    name: "JSON Schema defaults",
    render: () => <SchemaComponent schema={jsonSchema} />,
};

// ---------------------------------------------------------------------------
// Array defaults
// ---------------------------------------------------------------------------

const arraySchema = z.object({
    tags: z.array(z.string()).default(["react", "typescript"]),
});

export const ArrayDefaults: StoryObj = {
    name: "Array with defaults",
    render: () => <SchemaComponent schema={arraySchema} readOnly />,
};
