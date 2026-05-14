/**
 * Record type stories — demonstrates schemas with additionalProperties
 * (dynamic key-value maps).
 */
import type { Meta, StoryObj } from "@storybook/react";
import { z } from "zod";
import { SchemaComponent } from "schema-components/react/SchemaComponent";

const meta: Meta = {
    title: "Records",
};
export default meta;

// ---------------------------------------------------------------------------
// JSON Schema record (additionalProperties)
// ---------------------------------------------------------------------------

const stringRecordSchema = {
    type: "object" as const,
    additionalProperties: { type: "string" as const },
} as const;

export const StringValues: StoryObj = {
    name: "String record (read-only)",
    render: () => (
        <SchemaComponent
            schema={stringRecordSchema}
            value={{ name: "Ada", city: "London", role: "Engineer" }}
            readOnly
        />
    ),
};

export const StringValuesEditable: StoryObj = {
    name: "String record (editable)",
    render: () => (
        <SchemaComponent
            schema={stringRecordSchema}
            value={{ name: "Ada", city: "London", role: "Engineer" }}
        />
    ),
};

// ---------------------------------------------------------------------------
// Number record
// ---------------------------------------------------------------------------

const numberRecordSchema = {
    type: "object" as const,
    additionalProperties: { type: "number" as const },
} as const;

export const NumberValues: StoryObj = {
    name: "Number record",
    render: () => (
        <SchemaComponent
            schema={numberRecordSchema}
            value={{ react: 92, typescript: 88, python: 75, rust: 60 }}
            readOnly
        />
    ),
};

// ---------------------------------------------------------------------------
// Empty record
// ---------------------------------------------------------------------------

export const EmptyRecord: StoryObj = {
    name: "Empty record",
    render: () => (
        <SchemaComponent schema={stringRecordSchema} value={{}} readOnly />
    ),
};

// ---------------------------------------------------------------------------
// No value
// ---------------------------------------------------------------------------

export const NoValue: StoryObj = {
    name: "No value",
    render: () => <SchemaComponent schema={stringRecordSchema} readOnly />,
};

// ---------------------------------------------------------------------------
// Record within object
// ---------------------------------------------------------------------------

const objectWithRecordSchema = {
    type: "object" as const,
    properties: {
        name: { type: "string" as const, description: "Name" },
        metadata: {
            type: "object" as const,
            description: "Metadata",
            additionalProperties: { type: "string" as const },
        },
    },
    required: ["name"],
} as const;

export const RecordWithinObject: StoryObj = {
    name: "Record field within object",
    render: () => (
        <SchemaComponent
            schema={objectWithRecordSchema}
            value={{
                name: "Ada",
                metadata: {
                    department: "Engineering",
                    level: "Senior",
                    location: "London",
                },
            }}
            readOnly
        />
    ),
};

// ---------------------------------------------------------------------------
// Zod record
// ---------------------------------------------------------------------------

const zodRecordSchema = z.object({
    scores: z.record(z.string(), z.number()),
});

export const ZodRecord: StoryObj = {
    name: "Zod record",
    render: () => (
        <SchemaComponent
            schema={zodRecordSchema}
            value={{ scores: { math: 95, science: 88, english: 72 } }}
            readOnly
        />
    ),
};
