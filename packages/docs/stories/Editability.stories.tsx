/**
 * Editability stories — demonstrates readOnly/writeOnly override hierarchy
 * and the `readOnly: false` escape hatch via the `fields` prop.
 */
import type { Meta, StoryObj } from "@storybook/react";
import { z } from "zod";
import { SchemaComponent } from "schema-components/react/SchemaComponent";

const userSchema = z.object({
    name: z.string().meta({ description: "Full name" }),
    email: z.email().meta({ description: "Email" }),
    role: z.enum(["admin", "editor", "viewer"]).meta({ description: "Role" }),
    active: z.boolean().meta({ description: "Active" }),
    notes: z.string().meta({ description: "Notes" }),
});

const value = {
    name: "Ada Lovelace",
    email: "ada@example.com",
    role: "admin",
    active: true,
    notes: "Pioneer of computer science",
};

const meta: Meta = {
    title: "Editability",
};
export default meta;

// ---------------------------------------------------------------------------
// Editable (default)
// ---------------------------------------------------------------------------

export const Editable: StoryObj = {
    name: "Editable (default)",
    render: () => <SchemaComponent schema={userSchema} value={value} />,
};

// ---------------------------------------------------------------------------
// Read-only (component prop)
// ---------------------------------------------------------------------------

export const ReadOnly: StoryObj = {
    name: "Read-only (component prop)",
    render: () => (
        <SchemaComponent schema={userSchema} value={value} readOnly />
    ),
};

// ---------------------------------------------------------------------------
// Write-only (component prop)
// ---------------------------------------------------------------------------

export const WriteOnly: StoryObj = {
    name: "Write-only (component prop)",
    render: () => (
        <SchemaComponent schema={userSchema} value={value} writeOnly />
    ),
};

// ---------------------------------------------------------------------------
// Schema-level readOnly
// ---------------------------------------------------------------------------

const readOnlySchema = z.object({
    id: z.string().meta({ description: "ID", readOnly: true }),
    name: z.string().meta({ description: "Name" }),
    createdAt: z.string().meta({
        description: "Created at",
        readOnly: true,
        format: "date-time",
    }),
});

export const SchemaReadOnly: StoryObj = {
    name: "Schema-level readOnly fields",
    render: () => (
        <SchemaComponent
            schema={readOnlySchema}
            value={{
                id: "usr_123",
                name: "Ada",
                createdAt: "2024-01-15T10:30:00Z",
            }}
        />
    ),
};

// ---------------------------------------------------------------------------
// Override escape hatch: readOnly: false
// ---------------------------------------------------------------------------

export const ReadOnlyOverride: StoryObj = {
    name: "Read-only with editable escape hatch",
    render: () => (
        <SchemaComponent
            schema={userSchema}
            value={value}
            readOnly
            fields={{
                name: { readOnly: false },
                notes: { readOnly: false },
            }}
        />
    ),
};

// ---------------------------------------------------------------------------
// Mixed editability
// ---------------------------------------------------------------------------

export const MixedEditability: StoryObj = {
    name: "Mixed editability per field",
    render: () => (
        <SchemaComponent
            schema={userSchema}
            value={value}
            fields={{
                name: { readOnly: false },
                email: { readOnly: true },
                role: { readOnly: false },
                active: { readOnly: true },
                notes: { readOnly: false },
            }}
        />
    ),
};

// ---------------------------------------------------------------------------
// Write-only on specific fields
// ---------------------------------------------------------------------------

export const WriteOnlyFields: StoryObj = {
    name: "Write-only on sensitive fields",
    render: () => (
        <SchemaComponent
            schema={userSchema}
            value={value}
            fields={{
                email: { writeOnly: true },
                notes: { writeOnly: true },
            }}
        />
    ),
};
