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
import { expect, userEvent, waitFor, within } from "storybook/test";
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
    tags: ["datetime", "editable"],
    argTypes: {
        readOnly: {
            control: "boolean",
            description: "Render date/time fields as formatted text only.",
        },
    },
    args: { readOnly: false },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Editable: Story = {
    args: { readOnly: false },
    play: async ({ canvasElement, step }) => {
        const canvas = within(canvasElement);
        await step('format: date renders as <input type="date">', async () => {
            const dateInputs =
                canvasElement.querySelectorAll<HTMLInputElement>(
                    "input[type='date']"
                );
            await expect(dateInputs.length).toBe(1);
        });
        await step('format: time renders as <input type="time">', async () => {
            const timeInputs =
                canvasElement.querySelectorAll<HTMLInputElement>(
                    "input[type='time']"
                );
            // Two time fields: startTime and endTime.
            await expect(timeInputs.length).toBe(2);
        });
        await step(
            'format: date-time renders as <input type="datetime-local">',
            async () => {
                const datetimeInputs =
                    canvasElement.querySelectorAll<HTMLInputElement>(
                        "input[type='datetime-local']"
                    );
                await expect(datetimeInputs.length).toBe(1);
            }
        );
        await step(
            "the event name remains an ordinary text input that accepts typing",
            async () => {
                const nameInput =
                    await canvas.findByPlaceholderText(/event name/i);
                await userEvent.clear(nameInput);
                await userEvent.type(nameInput, "Retro");
                await waitFor(async () => {
                    await expect(nameInput).toHaveValue("Retro");
                });
            }
        );
    },
};

export const ReadOnly: Story = {
    args: { readOnly: true },
    tags: ["datetime", "readonly"],
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await expect(canvas.getByText("Team standup")).toBeInTheDocument();
        // Read-only date/time fields render as text spans, not inputs.
        const dateInputs =
            canvasElement.querySelectorAll<HTMLInputElement>(
                "input[type=date]"
            );
        await expect(dateInputs.length).toBe(0);
    },
};
