/**
 * Record type stories — demonstrates schemas with additionalProperties
 * (dynamic key-value maps).
 */
import type { Meta, StoryObj } from "@storybook/react";
import { expect, within } from "storybook/test";
import { z } from "zod";
import { SchemaComponent } from "schema-components/react/SchemaComponent";

const meta = {
    title: "Inputs/Records",
    component: SchemaComponent,
    tags: ["record", "json-schema"],
} satisfies Meta<typeof SchemaComponent>;
export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// JSON Schema record (additionalProperties)
// ---------------------------------------------------------------------------

const stringRecordSchema = {
    type: "object" as const,
    additionalProperties: { type: "string" as const },
} as const;

export const StringValues: Story = {
    name: "String record (read-only)",
    tags: ["record", "readonly"],
    args: {
        schema: stringRecordSchema,
        value: { name: "Ada", city: "London", role: "Engineer" },
        readOnly: true,
    },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await expect(canvas.getByText("Ada")).toBeInTheDocument();
        await expect(canvas.getByText("London")).toBeInTheDocument();
        await expect(canvas.getByText("Engineer")).toBeInTheDocument();
    },
};

export const StringValuesEditable: Story = {
    name: "String record (editable)",
    tags: ["record", "editable"],
    args: {
        schema: stringRecordSchema,
        value: { name: "Ada", city: "London", role: "Engineer" },
    },
    play: async ({ canvasElement, step }) => {
        const canvas = within(canvasElement);
        await step(
            "every record entry renders key and value as editable inputs",
            async () => {
                // renderRecord emits a key input + a value input per entry,
                // so three entries produce six textboxes.
                const inputs = await canvas.findAllByRole("textbox");
                await expect(inputs).toHaveLength(6);
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

export const NumberValues: Story = {
    name: "Number record",
    tags: ["record", "readonly"],
    args: {
        schema: numberRecordSchema,
        value: { react: 92, typescript: 88, python: 75, rust: 60 },
        readOnly: true,
    },
};

// ---------------------------------------------------------------------------
// Empty record
// ---------------------------------------------------------------------------

export const EmptyRecord: Story = {
    name: "Empty record",
    tags: ["record", "readonly"],
    args: {
        schema: stringRecordSchema,
        value: {},
        readOnly: true,
    },
};

// ---------------------------------------------------------------------------
// No value
// ---------------------------------------------------------------------------

export const NoValue: Story = {
    name: "No value",
    tags: ["record", "readonly"],
    args: {
        schema: stringRecordSchema,
        readOnly: true,
    },
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

export const RecordWithinObject: Story = {
    name: "Record field within object",
    tags: ["record", "readonly"],
    args: {
        schema: objectWithRecordSchema,
        value: {
            name: "Ada",
            metadata: {
                department: "Engineering",
                level: "Senior",
                location: "London",
            },
        },
        readOnly: true,
    },
};

// ---------------------------------------------------------------------------
// Zod record
// ---------------------------------------------------------------------------

const zodRecordSchema = z.object({
    scores: z.record(z.string(), z.number()),
});

export const ZodRecord: Story = {
    name: "Zod record",
    tags: ["record", "zod", "readonly"],
    args: {
        schema: zodRecordSchema,
        value: { scores: { math: 95, science: 88, english: 72 } },
        readOnly: true,
    },
};
