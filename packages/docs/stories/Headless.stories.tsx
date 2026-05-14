/**
 * Stories for the headless React renderer — SchemaComponent with default resolver.
 */
import type { Meta, StoryObj } from "@storybook/react";
import { z } from "zod";
import { SchemaComponent } from "schema-components/react/SchemaComponent";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

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

const addressSchema = z.object({
    street: z.string().meta({ description: "Street" }),
    city: z.string().meta({ description: "City" }),
    postcode: z.string().meta({ description: "Postcode" }),
});

const nestedSchema = z.object({
    name: z.string().meta({ description: "Name" }),
    address: addressSchema.meta({ description: "Address" }),
});

const nestedData = {
    name: "Ada",
    address: {
        street: "17 Doubting Street",
        city: "London",
        postcode: "W1A 1AA",
    },
};

const arraySchema = z.object({
    tags: z.array(z.string()).meta({ description: "Tags" }),
});

const arrayData = { tags: ["mathematics", "computing", "analytical engine"] };

const recordSchema = z.object({
    metadata: z.record(z.string(), z.string()),
});

const recordData = {
    metadata: { foo: "bar", baz: "qux" },
};

const constrainedSchema = z.object({
    username: z.string().min(3).max(20).meta({ description: "Username" }),
    age: z.number().min(0).max(150).meta({ description: "Age" }),
    website: z.string().meta({ description: "Website", format: "uri" }),
    bio: z.string().max(280).optional().meta({ description: "Bio" }),
});

const constrainedData = {
    username: "ada",
    age: 36,
    website: "https://example.com",
    bio: undefined,
};

const mixedEditabilitySchema = z.object({
    id: z.string().meta({ readOnly: true, description: "ID" }),
    name: z.string().meta({ description: "Name" }),
    createdAt: z.string().meta({ readOnly: true, description: "Created at" }),
});

const mixedData = {
    id: "usr_abc123",
    name: "Ada Lovelace",
    createdAt: "2026-01-15T10:30:00Z",
};

// ---------------------------------------------------------------------------
// Story metadata
// ---------------------------------------------------------------------------

const meta: Meta<typeof SchemaComponent> = {
    title: "React/Headless",
    component: SchemaComponent,
    argTypes: {
        readOnly: { control: "boolean" },
        writeOnly: { control: "boolean" },
    },
};

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

export const Editable: Story = {
    args: {
        schema: userSchema,
        value: userData,
    },
};

export const ReadOnly: Story = {
    args: {
        schema: userSchema,
        value: userData,
        readOnly: true,
    },
};

export const WriteOnly: Story = {
    args: {
        schema: userSchema,
        writeOnly: true,
    },
};

export const NestedObject: Story = {
    args: {
        schema: nestedSchema,
        value: nestedData,
    },
};

export const NestedObjectReadOnly: Story = {
    args: {
        schema: nestedSchema,
        value: nestedData,
        readOnly: true,
    },
};

export const Array: Story = {
    args: {
        schema: arraySchema,
        value: arrayData,
    },
};

export const ArrayReadOnly: Story = {
    args: {
        schema: arraySchema,
        value: arrayData,
        readOnly: true,
    },
};

export const Record: Story = {
    args: {
        schema: recordSchema,
        value: recordData,
    },
};

export const RecordReadOnly: Story = {
    args: {
        schema: recordSchema,
        value: recordData,
        readOnly: true,
    },
};

export const ConstrainedFields: Story = {
    args: {
        schema: constrainedSchema,
        value: constrainedData,
    },
};

export const MixedEditability: Story = {
    args: {
        schema: mixedEditabilitySchema,
        value: mixedData,
    },
};

export const FieldOverrides: Story = {
    args: {
        schema: userSchema,
        value: userData,
        readOnly: true,
        fields: {
            name: { readOnly: false },
        },
    },
};
