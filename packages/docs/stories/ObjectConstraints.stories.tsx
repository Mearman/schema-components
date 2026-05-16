/**
 * Stories for object constraints: patternProperties, dependentSchemas,
 * dependentRequired, additionalProperties: false, unevaluatedProperties.
 */
import type { Meta, StoryObj } from "@storybook/react";
import { SchemaComponent } from "schema-components/react/SchemaComponent";

const meta: Meta<typeof SchemaComponent> = {
    title: "JSON Schema/Object Constraints",
    component: SchemaComponent,
};
export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// additionalProperties: false (closed object)
// ---------------------------------------------------------------------------

const closedSchema = {
    type: "object" as const,
    properties: {
        id: { type: "string" as const, description: "ID" },
        name: { type: "string" as const, description: "Name" },
    },
    required: ["id", "name"],
    additionalProperties: false,
    description: "Closed object — no extra properties allowed",
} as const;

export const ClosedObject: Story = {
    args: {
        schema: closedSchema,
        value: { id: "abc-123", name: "Ada" },
    },
};

// ---------------------------------------------------------------------------
// additionalProperties: schema (open with value constraint)
// ---------------------------------------------------------------------------

const openWithSchema = {
    type: "object" as const,
    properties: {
        name: { type: "string" as const, description: "Name" },
    },
    required: ["name"],
    additionalProperties: { type: "number" as const },
    description: "Object with named + numeric extra properties",
} as const;

export const OpenWithSchema: Story = {
    args: {
        schema: openWithSchema,
        value: { name: "Ada", score: 95, rank: 3 },
    },
};

// ---------------------------------------------------------------------------
// patternProperties
// ---------------------------------------------------------------------------

const patternSchema = {
    type: "object" as const,
    properties: {
        name: { type: "string" as const, description: "Name" },
    },
    patternProperties: {
        "^S_": { type: "string" as const, description: "String metadata" },
        "^I_": { type: "integer" as const, description: "Integer metadata" },
    },
    description: "Properties starting S_ are strings, I_ are integers",
} as const;

export const PatternProperties: Story = {
    args: {
        schema: patternSchema,
        value: {
            name: "Ada",
            S_role: "engineer",
            S_team: "platform",
            I_level: 5,
            I_tenure: 3,
        },
    },
};

export const PatternPropertiesReadOnly: Story = {
    args: {
        schema: patternSchema,
        value: {
            name: "Ada",
            S_role: "engineer",
            S_team: "platform",
            I_level: 5,
            I_tenure: 3,
        },
        readOnly: true,
    },
};

// ---------------------------------------------------------------------------
// dependentRequired
// ---------------------------------------------------------------------------

const dependentRequiredSchema = {
    type: "object" as const,
    properties: {
        name: { type: "string" as const, description: "Name" },
        creditCard: { type: "string" as const, description: "Credit card" },
        billingAddress: {
            type: "string" as const,
            description: "Billing address",
        },
    },
    dependentRequired: {
        creditCard: ["billingAddress"],
    },
    description: "If creditCard is provided, billingAddress is required",
} as const;

export const DependentRequired: Story = {
    args: {
        schema: dependentRequiredSchema,
        value: {
            name: "Ada",
            creditCard: "4111111111111111",
            billingAddress: "123 Main St, London",
        },
    },
};

export const DependentRequiredMinimal: Story = {
    name: "Dependent Required (minimal — no card)",
    args: {
        schema: dependentRequiredSchema,
        value: { name: "Ada" },
    },
};

// ---------------------------------------------------------------------------
// dependentSchemas
// ---------------------------------------------------------------------------

const dependentSchemasSchema = {
    type: "object" as const,
    properties: {
        kind: { type: "string" as const, description: "Kind" },
        value: { type: "number" as const, description: "Value" },
    },
    dependentSchemas: {
        kind: {
            properties: {
                label: { type: "string" as const, description: "Label" },
            },
            required: ["label"],
        },
    },
    description: "When 'kind' is present, 'label' becomes required",
} as const;

export const DependentSchemas: Story = {
    args: {
        schema: dependentSchemasSchema,
        value: { kind: "metric", value: 42, label: "Temperature" },
    },
};
