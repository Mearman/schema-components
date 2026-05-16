/**
 * Stories for conditional (if/then/else), negation (not), and const/literal.
 */
import type { Meta, StoryObj } from "@storybook/react";
import { SchemaComponent } from "schema-components/react/SchemaComponent";

const meta: Meta<typeof SchemaComponent> = {
    title: "JSON Schema/Conditional & Negation",
    component: SchemaComponent,
};
export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// const / literal
// ---------------------------------------------------------------------------

const constSchema = {
    type: "object" as const,
    properties: {
        kind: { const: "user" },
        version: { const: 2 },
        active: { const: true },
    },
    description: "A user entity with fixed type fields",
} as const;

export const Const: Story = {
    args: {
        schema: constSchema,
        value: { kind: "user", version: 2, active: true },
    },
};

export const ConstReadOnly: Story = {
    args: {
        schema: constSchema,
        value: { kind: "user", version: 2, active: true },
        readOnly: true,
    },
};

// ---------------------------------------------------------------------------
// if/then/else conditional
// ---------------------------------------------------------------------------

const conditionalSchema = {
    type: "object" as const,
    properties: {
        country: {
            type: "string" as const,
            description: "Country code",
        },
        postalCode: {
            type: "string" as const,
            description: "Postal code",
        },
    },
    if: {
        properties: {
            country: { const: "US" },
        },
    },
    then: {
        properties: {
            postalCode: {
                type: "string" as const,
                pattern: "^[0-9]{5}(-[0-9]{4})?$",
                description: "US ZIP code",
            },
        },
    },
    else: {
        properties: {
            postalCode: {
                type: "string" as const,
                pattern: "^[A-Z0-9]{3,10}$",
                description: "Postal code (non-US)",
            },
        },
    },
} as const;

export const ConditionalUs: Story = {
    name: "Conditional (US)",
    args: {
        schema: conditionalSchema,
        value: { country: "US", postalCode: "90210" },
    },
};

export const ConditionalUk: Story = {
    name: "Conditional (UK)",
    args: {
        schema: conditionalSchema,
        value: { country: "GB", postalCode: "SW1A1AA" },
    },
};

// ---------------------------------------------------------------------------
// not (negation)
// ---------------------------------------------------------------------------

const notSchema = {
    not: { type: "string" },
    description: "Any value except a string",
} as const;

export const Negation: Story = {
    args: {
        schema: notSchema,
        value: 42,
    },
};

export const NegationObject: Story = {
    args: {
        schema: notSchema,
        value: { foo: "bar" },
    },
};
