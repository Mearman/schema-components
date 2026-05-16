/**
 * Stories for tuple types (prefixItems) and nullable fields.
 */
import type { Meta, StoryObj } from "@storybook/react";
import { SchemaComponent } from "schema-components/react/SchemaComponent";

const meta: Meta<typeof SchemaComponent> = {
    title: "JSON Schema/Tuples & Nullable",
    component: SchemaComponent,
    tags: ["json-schema", "editable"],
    argTypes: {
        readOnly: { control: "boolean" },
    },
};
export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// prefixItems — tuple types (Draft 2020-12)
// ---------------------------------------------------------------------------

const coordinateSchema = {
    type: "array" as const,
    prefixItems: [
        { type: "number" as const, description: "Latitude" },
        { type: "number" as const, description: "Longitude" },
    ],
    description: "GPS coordinate [lat, lng]",
} as const;

export const Coordinate: Story = {
    args: {
        schema: coordinateSchema,
        value: [51.5074, -0.1278],
    },
};

export const CoordinateReadOnly: Story = {
    args: {
        schema: coordinateSchema,
        value: [51.5074, -0.1278],
        readOnly: true,
    },
};

const rgbSchema = {
    type: "array" as const,
    prefixItems: [
        {
            type: "integer" as const,
            minimum: 0,
            maximum: 255,
            description: "Red",
        },
        {
            type: "integer" as const,
            minimum: 0,
            maximum: 255,
            description: "Green",
        },
        {
            type: "integer" as const,
            minimum: 0,
            maximum: 255,
            description: "Blue",
        },
    ],
    description: "RGB colour",
} as const;

export const RgbTuple: Story = {
    args: {
        schema: rgbSchema,
        value: [255, 127, 0],
    },
};

// Mixed-type tuple
const entrySchema = {
    type: "array" as const,
    prefixItems: [
        { type: "string" as const, description: "Key" },
        {
            oneOf: [
                { type: "string" as const },
                { type: "number" as const },
                { type: "boolean" as const },
            ],
            description: "Value",
        },
    ],
    description: "Key-value entry",
} as const;

export const MixedTuple: Story = {
    args: {
        schema: entrySchema,
        value: ["age", 36],
    },
};

// ---------------------------------------------------------------------------
// Nullable — type arrays
// ---------------------------------------------------------------------------

const nullableSchema = {
    type: "object" as const,
    properties: {
        name: { type: "string" as const, description: "Name" },
        title: {
            type: ["string", "null"] as const,
            description: "Job title (nullable)",
        },
        reportsTo: {
            type: ["string", "null"] as const,
            format: "uuid",
            description: "Manager ID (nullable)",
        },
    },
    required: ["name"],
} as const;

export const NullableFields: Story = {
    args: {
        schema: nullableSchema,
        value: { name: "Ada", title: "Mathematician", reportsTo: null },
    },
};

export const NullableAllPresent: Story = {
    name: "Nullable (all present)",
    args: {
        schema: nullableSchema,
        value: {
            name: "Charles",
            title: "Analyst",
            reportsTo: "abc-123-uuid",
        },
    },
};
