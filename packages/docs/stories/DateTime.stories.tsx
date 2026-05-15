/**
 * Stories for date/time input rendering.
 *
 * Zod's z.date() cannot be serialised to JSON Schema, so dates use
 * z.string().meta({ format: "date" }) which maps to the JSON Schema
 * "format" keyword. The walker extracts it as a constraint and the
 * headless renderer uses <input type="date">, <input type="time">,
 * or <input type="datetime-local"> accordingly.
 */
import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { z } from "zod";
import { SchemaComponent } from "schema-components/react/SchemaComponent";

const eventSchema = z.object({
    name: z.string().meta({ description: "Event name" }),
    date: z.string().min(1).meta({ description: "Date", format: "date" }),
    startTime: z.string().meta({ description: "Start time", format: "time" }),
    endTime: z.string().meta({ description: "End time", format: "time" }),
    createdAt: z
        .string()
        .meta({ description: "Created at", format: "date-time" }),
});

const eventData = {
    name: "Team standup",
    date: "2024-06-15",
    startTime: "09:00",
    endTime: "09:30",
    createdAt: "2024-06-01T12:00:00Z",
};

function EventForm({ readOnly }: { readOnly: boolean }) {
    const [value, setValue] = useState<unknown>(eventData);

    return (
        <SchemaComponent
            schema={eventSchema}
            value={value}
            onChange={(next) => {
                setValue(next);
            }}
            readOnly={readOnly}
        />
    );
}

const meta: Meta<typeof EventForm> = {
    title: "Inputs/Date & Time",
    component: EventForm,
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Editable: Story = {
    args: { readOnly: false },
};

export const ReadOnly: Story = {
    args: { readOnly: true },
};
