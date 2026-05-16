/**
 * Record type stories — demonstrates schemas with additionalProperties
 * (dynamic key-value maps).
 */
import type { Meta, StoryObj } from "@storybook/react";
import { expect, within } from "storybook/test";
import { z } from "zod";
import { SchemaComponent } from "schema-components/react/SchemaComponent";

const meta: Meta = {
    title: "Inputs/Records",
    tags: ["record", "json-schema"],
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
    tags: ["record", "readonly"],
    render: () => (
        <SchemaComponent
            schema={stringRecordSchema}
            value={{ name: "Ada", city: "London", role: "Engineer" }}
            readOnly
        />
    ),
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await expect(canvas.getByText("Ada")).toBeInTheDocument();
        await expect(canvas.getByText("London")).toBeInTheDocument();
        await expect(canvas.getByText("Engineer")).toBeInTheDocument();
    },
};

export const StringValuesEditable: StoryObj = {
    name: "String record (editable)",
    tags: ["record", "editable"],
    render: () => (
        <SchemaComponent
            schema={stringRecordSchema}
            value={{ name: "Ada", city: "London", role: "Engineer" }}
        />
    ),
    play: async ({ canvasElement, step }) => {
        const canvas = within(canvasElement);
        await step(
            "every record entry renders as an editable text input",
            async () => {
                const inputs = await canvas.findAllByRole("textbox");
                await expect(inputs).toHaveLength(3);
                for (const input of inputs) {
                    await expect(input).toBeEnabled();
                }
            }
        );
        await step(
            "initial display values come from the record's keys and values",
            async () => {
                await expect(
                    canvas.getByDisplayValue("Ada")
                ).toBeInTheDocument();
                await expect(
                    canvas.getByDisplayValue("London")
                ).toBeInTheDocument();
                await expect(
                    canvas.getByDisplayValue("Engineer")
                ).toBeInTheDocument();
            }
        );
    },
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
    tags: ["record", "readonly"],
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
    tags: ["record", "readonly"],
    render: () => (
        <SchemaComponent schema={stringRecordSchema} value={{}} readOnly />
    ),
};

// ---------------------------------------------------------------------------
// No value
// ---------------------------------------------------------------------------

export const NoValue: StoryObj = {
    name: "No value",
    tags: ["record", "readonly"],
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
    tags: ["record", "readonly"],
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
    tags: ["record", "zod", "readonly"],
    render: () => (
        <SchemaComponent
            schema={zodRecordSchema}
            value={{ scores: { math: 95, science: 88, english: 72 } }}
            readOnly
        />
    ),
};
