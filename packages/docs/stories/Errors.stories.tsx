/**
 * Stories for render-time errors and error boundaries.
 */
import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { expect, within } from "storybook/test";
import { linkTo } from "@storybook/addon-links";
import { z } from "zod";
import { SchemaComponent } from "schema-components/react/SchemaComponent";
import { SchemaErrorBoundary } from "schema-components/react/SchemaErrorBoundary";
import { SchemaProvider } from "schema-components/react/SchemaComponent";
import type { ComponentResolver } from "schema-components/core/renderer";

const userSchema = z.object({
    name: z.string().meta({ description: "Full name" }),
    email: z.email().meta({ description: "Email address" }),
});

const userData = {
    name: "Ada Lovelace",
    email: "ada@example.com",
};

const throwingResolver: ComponentResolver = {
    string: () => {
        throw new Error("Custom resolver failure");
    },
};

function ErrorBoundaryPreview() {
    return (
        <div style={{ display: "grid", gap: "0.75rem" }}>
            <SchemaErrorBoundary
                fallback={(error) => (
                    <div
                        data-testid="boundary-fallback"
                        style={{
                            border: "1px solid #fecaca",
                            borderRadius: "0.5rem",
                            padding: "1rem",
                            background: "#fef2f2",
                            color: "#991b1b",
                        }}
                    >
                        <strong>Boundary caught:</strong> {error.message}
                    </div>
                )}
            >
                <SchemaProvider resolver={throwingResolver}>
                    <SchemaComponent schema={userSchema} value={userData} />
                </SchemaProvider>
            </SchemaErrorBoundary>
            <button
                type="button"
                onClick={linkTo("Validation/Overview", "Default")}
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
                Back to validation overview
            </button>
        </div>
    );
}

function OnErrorPreview() {
    const [message, setMessage] = useState<string | undefined>(undefined);

    if (message !== undefined) {
        return (
            <div
                data-testid="on-error-message"
                style={{
                    border: "1px solid #fbbf24",
                    borderRadius: "0.5rem",
                    padding: "1rem",
                    background: "#fffbeb",
                    color: "#92400e",
                }}
            >
                <strong>onError:</strong> {message}
            </div>
        );
    }

    return (
        <SchemaProvider resolver={throwingResolver}>
            <SchemaComponent
                schema={userSchema}
                value={userData}
                onError={(error) => {
                    setMessage(error.message);
                }}
            />
        </SchemaProvider>
    );
}

const meta: Meta<typeof ErrorBoundaryPreview> = {
    title: "Validation/Errors",
    component: ErrorBoundaryPreview,
    // `errors` and `validation` taxonomy tags. The OnErrorCallback story
    // intentionally throws inside React's render cycle without a boundary
    // (React catches and rethrows), so it is excluded from the storybook
    // vitest runner via `!test`. The ErrorBoundary story includes its own
    // boundary and opts back into tests via story-level tags.
    tags: ["errors", "validation", "!test"],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const ErrorBoundary: Story = {
    render: () => <ErrorBoundaryPreview />,
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        const fallback = await canvas.findByTestId("boundary-fallback");
        await expect(fallback).toHaveTextContent(/boundary caught/i);
        await expect(fallback).toHaveTextContent(/custom resolver failure/i);
    },
};

export const OnErrorCallback: Story = {
    render: () => <OnErrorPreview />,
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        const message = await canvas.findByTestId("on-error-message");
        await expect(message).toHaveTextContent(/onError:/i);
        await expect(message).toHaveTextContent(/custom resolver failure/i);
    },
};
