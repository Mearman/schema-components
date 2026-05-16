/**
 * Stories for advanced object/array constraints:
 * propertyNames, unevaluatedItems, examples rendering.
 */
import type { Meta, StoryObj } from "@storybook/react";
import { SchemaComponent } from "schema-components/react/SchemaComponent";

const meta: Meta<typeof SchemaComponent> = {
    title: "JSON Schema/Advanced Constraints",
    component: SchemaComponent,
};
export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// propertyNames — constraining property key names
// ---------------------------------------------------------------------------

const propertyNamesSchema = {
    type: "object" as const,
    properties: {
        name: { type: "string" as const, description: "Name" },
        age: { type: "integer" as const, description: "Age" },
    },
    required: ["name"] as const,
    propertyNames: {
        pattern: "^[a-zA-Z_][a-zA-Z0-9_]*$",
        description: "Valid identifier",
    },
    description: "Property keys must match ^[a-zA-Z_]",
} as const;

export const PropertyNames: Story = {
    args: {
        schema: propertyNamesSchema,
        value: { name: "Ada", age: 36 },
    },
};

// ---------------------------------------------------------------------------
// unevaluatedItems — array with unconstrained tail items
// ---------------------------------------------------------------------------

const unevaluatedItemsSchema = {
    type: "array" as const,
    prefixItems: [
        { type: "string" as const, description: "Command name" },
        { type: "integer" as const, description: "Exit code" },
    ],
    unevaluatedItems: { type: "string" as const },
    description: "Command with name, exit code, and arbitrary string args",
} as const;

export const UnevaluatedItems: Story = {
    args: {
        schema: unevaluatedItemsSchema,
        value: ["build", 0, "--verbose", "--target=release"],
    },
};

export const UnevaluatedItemsReadOnly: Story = {
    args: {
        schema: unevaluatedItemsSchema,
        value: ["build", 0, "--verbose", "--target=release"],
        readOnly: true,
    },
};

// ---------------------------------------------------------------------------
// examples — schema-provided example values
// ---------------------------------------------------------------------------

const examplesSchema = {
    type: "object" as const,
    properties: {
        username: {
            type: "string" as const,
            description: "Username",
            examples: ["ada_lovelace", "grace_hopper"],
        },
        email: {
            type: "string" as const,
            format: "email",
            description: "Email",
            examples: ["ada@example.com"],
        },
        role: {
            type: "string" as const,
            enum: ["admin", "editor", "viewer"],
            description: "Role",
            examples: ["admin"],
        },
    },
    required: ["username", "email"] as const,
} as const;

export const WithExamples: Story = {
    args: {
        schema: examplesSchema,
        value: {
            username: "ada_lovelace",
            email: "ada@example.com",
            role: "admin",
        },
    },
};

export const WithExamplesReadOnly: Story = {
    args: {
        schema: examplesSchema,
        value: {
            username: "ada_lovelace",
            email: "ada@example.com",
            role: "admin",
        },
        readOnly: true,
    },
};

// ---------------------------------------------------------------------------
// Deprecated field
// ---------------------------------------------------------------------------

const deprecatedSchema = {
    type: "object" as const,
    properties: {
        name: { type: "string" as const, description: "Name" },
        legacyId: {
            type: "string" as const,
            description: "Legacy ID (deprecated)",
            deprecated: true,
        },
        newId: {
            type: "string" as const,
            format: "uuid",
            description: "New UUID",
        },
    },
    required: ["name"] as const,
} as const;

export const DeprecatedField: Story = {
    args: {
        schema: deprecatedSchema,
        value: { name: "Ada", legacyId: "old-123", newId: "abc-def-ghi" },
    },
};

export const DeprecatedFieldReadOnly: Story = {
    args: {
        schema: deprecatedSchema,
        value: { name: "Ada", legacyId: "old-123", newId: "abc-def-ghi" },
        readOnly: true,
    },
};
