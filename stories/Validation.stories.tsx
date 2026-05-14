/**
 * Stories for validation feedback.
 */
import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { z } from "zod";
import { SchemaComponent } from "../src/react/SchemaComponent.tsx";

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

function ValidationDemo() {
    const [settings, setSettings] = useState<unknown>(initialSettings);
    const [message, setMessage] = useState<string | undefined>(undefined);

    return (
        <div style={{ display: "grid", gap: "1rem", maxWidth: "32rem" }}>
            <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>
                Edit the fields below to see validation feedback.
            </p>
            {message !== undefined && (
                <div
                    style={{
                        border: "1px solid #fecaca",
                        borderRadius: "0.5rem",
                        padding: "0.75rem",
                        background: "#fef2f2",
                        color: "#991b1b",
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
        </div>
    );
}

const meta: Meta<typeof ValidationDemo> = {
    title: "React/Validation",
    component: ValidationDemo,
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: () => <ValidationDemo />,
};
