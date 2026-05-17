/**
 * Stories for validation feedback.
 */
import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { linkTo } from "@storybook/addon-links";
import { z } from "zod";
import { SchemaComponent } from "schema-components/react/SchemaComponent";

const settingsSchema = z.object({
    username: z.string().min(3).max(20).meta({ description: "Username" }),
    age: z.number().min(18).max(130).meta({ description: "Age" }),
    email: z.email().meta({ description: "Email" }),
});

const initialSettings = {
    username: "",
    age: 17,
    email: "not-an-email",
};

interface ValidationArgs {
    initialUsername: string;
    initialAge: number;
    initialEmail: string;
}

function ValidationDemo({
    initialUsername,
    initialAge,
    initialEmail,
}: ValidationArgs) {
    const [settings, setSettings] = useState<unknown>({
        username: initialUsername,
        age: initialAge,
        email: initialEmail,
    });
    const [message, setMessage] = useState<string | undefined>(undefined);

    return (
        <div style={{ display: "grid", gap: "1rem", maxWidth: "32rem" }}>
            <p
                style={{
                    color: "var(--sc-text-secondary)",
                    fontSize: "0.875rem",
                }}
            >
                Edit the fields below to see validation feedback.
            </p>
            {message !== undefined && (
                <div
                    data-testid="validation-message"
                    style={{
                        border: "1px solid var(--sc-danger)",
                        borderRadius: "0.5rem",
                        padding: "0.75rem",
                        background: "transparent",
                        color: "var(--sc-danger)",
                        whiteSpace: "pre-wrap",
                        fontSize: "0.875rem",
                    }}
                >
                    {message}
                </div>
            )}
            <SchemaComponent
                schema={settingsSchema}
                value={settings}
                onChange={(next) => {
                    setSettings(next);
                    const result = settingsSchema.safeParse(next);
                    if (result.success) {
                        setMessage(undefined);
                    }
                }}
                validate
                onValidationError={(error) => {
                    if (error instanceof Error) {
                        setMessage(error.message);
                    } else {
                        setMessage(String(error));
                    }
                }}
            />
            <button
                type="button"
                onClick={linkTo("Validation/Errors", "ErrorBoundary")}
                style={{
                    alignSelf: "flex-start",
                    border: "1px solid #94a3b8",
                    background: "#fff",
                    color: "#0f172a",
                    borderRadius: "0.375rem",
                    padding: "0.5rem 0.875rem",
                    cursor: "pointer",
                    fontSize: "0.875rem",
                }}
            >
                See error boundary handling
            </button>
        </div>
    );
}

const meta: Meta<typeof ValidationDemo> = {
    title: "Validation/Overview",
    component: ValidationDemo,
    tags: ["validation", "editable", "zod"],
    argTypes: {
        initialUsername: {
            control: "text",
            description: "Seed value for the username field.",
        },
        initialAge: {
            control: { type: "number", min: 0, max: 200 },
            description: "Seed value for the age field.",
        },
        initialEmail: {
            control: "text",
            description: "Seed value for the email field.",
        },
    },
    args: {
        initialUsername: initialSettings.username,
        initialAge: initialSettings.age,
        initialEmail: initialSettings.email,
    },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    play: async ({ canvasElement, step }) => {
        const canvas = within(canvasElement);
        await step(
            "typing an invalid username shorter than min length surfaces a validation error",
            async () => {
                const username =
                    await canvas.findByPlaceholderText(/username/i);
                await userEvent.clear(username);
                await userEvent.type(username, "ab");
                await waitFor(async () => {
                    await expect(
                        canvas.getByTestId("validation-message")
                    ).toBeInTheDocument();
                });
            }
        );
        await step(
            "fixing every field clears the surfaced validation message",
            async () => {
                const username =
                    await canvas.findByPlaceholderText(/username/i);
                await userEvent.clear(username);
                await userEvent.type(username, "ada_lovelace");
                const age = canvas.getByRole("spinbutton");
                await userEvent.clear(age);
                await userEvent.type(age, "36");
                const email = await canvas.findByPlaceholderText(/email/i);
                await userEvent.clear(email);
                await userEvent.type(email, "ada@example.com");
                await waitFor(async () => {
                    await expect(
                        canvas.queryByTestId("validation-message")
                    ).not.toBeInTheDocument();
                });
            }
        );
    },
};
