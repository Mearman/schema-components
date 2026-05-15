/**
 * Stories for render-time errors and error boundaries.
 */
import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
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
        <SchemaErrorBoundary
            fallback={(error) => (
                <div
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
    );
}

function OnErrorPreview() {
    const [message, setMessage] = useState<string | undefined>(undefined);

    if (message !== undefined) {
        return (
            <div
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
    tags: ["!test"],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const ErrorBoundary: Story = {
    render: () => <ErrorBoundaryPreview />,
};

export const OnErrorCallback: Story = {
    render: () => <OnErrorPreview />,
};
