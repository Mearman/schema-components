/**
 * Editability stories — demonstrates readOnly/writeOnly override hierarchy
 * and the `readOnly: false` escape hatch via the `fields` prop.
 */
import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { linkTo } from "@storybook/addon-links";
import { z } from "zod";
import { SchemaComponent } from "schema-components/react/SchemaComponent";

const userSchema = z.object({
    name: z.string().meta({ description: "Full name" }),
    email: z.email().meta({ description: "Email" }),
    role: z.enum(["admin", "editor", "viewer"]).meta({ description: "Role" }),
    active: z.boolean().meta({ description: "Active" }),
    notes: z.string().meta({ description: "Notes" }),
});

const baseValue = {
    name: "Ada Lovelace",
    email: "ada@example.com",
    role: "admin",
    active: true,
    notes: "Pioneer of computer science",
};

interface EditabilityArgs {
    readOnly: boolean;
    writeOnly: boolean;
}

function EditabilityDemo({ readOnly, writeOnly }: EditabilityArgs) {
    const [value, setValue] = useState<unknown>(baseValue);
    return (
        <SchemaComponent
            schema={userSchema}
            value={value}
            onChange={(next) => {
                setValue(next);
            }}
            readOnly={readOnly}
            writeOnly={writeOnly}
        />
    );
}

const meta: Meta<EditabilityArgs> = {
    title: "Editability/Overview",
    component: EditabilityDemo,
    tags: ["editable", "readonly", "writeonly"],
    argTypes: {
        readOnly: {
            control: "boolean",
            description: "Force every field to render as read-only output.",
        },
        writeOnly: {
            control: "boolean",
            description: "Force every field to render as an editable input.",
        },
    },
    args: {
        readOnly: false,
        writeOnly: false,
    },
};
export default meta;
type Story = StoryObj<EditabilityArgs>;
// Override-pattern stories drive SchemaComponent directly rather than the
// EditabilityDemo wrapper; type them against SchemaComponent's props so
// their args are checked correctly without splitting the meta (which would
// change the URL path and break bookmarks).
type OverrideStory = StoryObj<typeof SchemaComponent>;

// ---------------------------------------------------------------------------
// Editable (default)
// ---------------------------------------------------------------------------

export const Editable: Story = {
    name: "Editable (default)",
    args: { readOnly: false, writeOnly: false },
    play: async ({ canvasElement, step }) => {
        const canvas = within(canvasElement);
        await step(
            "name field is editable and reflects new value",
            async () => {
                const nameInput =
                    await canvas.findByPlaceholderText(/full name/i);
                await expect(nameInput).toBeEnabled();
                await userEvent.clear(nameInput);
                await userEvent.type(nameInput, "Grace Hopper");
                await waitFor(async () => {
                    await expect(nameInput).toHaveValue("Grace Hopper");
                });
            }
        );
        await step("boolean field toggles on click", async () => {
            const activeCheckbox = canvas.getByRole<HTMLInputElement>(
                "checkbox",
                { name: /active/i }
            );
            const initiallyChecked = activeCheckbox.checked;
            await userEvent.click(activeCheckbox);
            await waitFor(async () => {
                await expect(activeCheckbox.checked).toBe(!initiallyChecked);
            });
        });
    },
};

// ---------------------------------------------------------------------------
// Read-only (component prop)
// ---------------------------------------------------------------------------

export const ReadOnly: Story = {
    name: "Read-only (component prop)",
    tags: ["readonly"],
    args: { readOnly: true, writeOnly: false },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        // No editable inputs should be present.
        const textInputs = canvas.queryAllByRole("textbox");
        await expect(textInputs).toHaveLength(0);
        await expect(canvas.getByText("Ada Lovelace")).toBeInTheDocument();
    },
};

// ---------------------------------------------------------------------------
// Write-only (component prop)
// ---------------------------------------------------------------------------

export const WriteOnly: Story = {
    name: "Write-only (component prop)",
    tags: ["writeonly", "editable"],
    args: { readOnly: false, writeOnly: true },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        const textInputs = await canvas.findAllByRole("textbox");
        // Write-only forces every text field to render as an input.
        await expect(textInputs.length).toBeGreaterThan(0);
        for (const input of textInputs) {
            await expect(input).toBeEnabled();
        }
    },
};

// ---------------------------------------------------------------------------
// Schema-level readOnly
// ---------------------------------------------------------------------------

const readOnlySchema = z.object({
    id: z.string().meta({ description: "ID", readOnly: true }),
    name: z.string().meta({ description: "Name" }),
    createdAt: z.string().meta({
        description: "Created at",
        readOnly: true,
        format: "date-time",
    }),
});

export const SchemaReadOnly: OverrideStory = {
    name: "Schema-level readOnly fields",
    tags: ["readonly", "editable"],
    args: {
        schema: readOnlySchema,
        value: {
            id: "usr_123",
            name: "Ada",
            createdAt: "2024-01-15T10:30:00Z",
        },
    },
    // Per-story render — the file's meta drives an EditabilityDemo wrapper for
    // the readOnly/writeOnly demos, but these override-pattern stories render
    // SchemaComponent directly so args map straight onto its props.
    render: (args) => <SchemaComponent {...args} />,
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        // Only the editable `name` field renders as an input.
        const nameInput = await canvas.findByPlaceholderText(/^name$/i);
        await expect(nameInput).toBeEnabled();
        // The read-only `id` and `createdAt` values appear as text, not inputs.
        await expect(canvas.getByText("usr_123")).toBeInTheDocument();
    },
};

// ---------------------------------------------------------------------------
// Override escape hatch: readOnly: false
// ---------------------------------------------------------------------------

export const ReadOnlyOverride: OverrideStory = {
    name: "Read-only with editable escape hatch",
    tags: ["readonly", "editable"],
    args: {
        schema: userSchema,
        value: baseValue,
        readOnly: true,
        fields: {
            name: { readOnly: false },
            notes: { readOnly: false },
        },
    },
    render: (args) => <SchemaComponent {...args} />,
    play: async ({ canvasElement, step }) => {
        const canvas = within(canvasElement);
        await step(
            "name and notes remain editable despite component readOnly",
            async () => {
                const nameInput =
                    await canvas.findByPlaceholderText(/full name/i);
                await expect(nameInput).toBeEnabled();
                const notesInput = await canvas.findByPlaceholderText(/notes/i);
                await expect(notesInput).toBeEnabled();
            }
        );
    },
};

// ---------------------------------------------------------------------------
// Mixed editability
// ---------------------------------------------------------------------------

export const MixedEditability: OverrideStory = {
    name: "Mixed editability per field",
    tags: ["editable", "readonly"],
    args: {
        schema: userSchema,
        value: baseValue,
        fields: {
            name: { readOnly: false },
            email: { readOnly: true },
            role: { readOnly: false },
            active: { readOnly: true },
            notes: { readOnly: false },
        },
    },
    render: (args) => <SchemaComponent {...args} />,
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        const nameInput = await canvas.findByPlaceholderText(/full name/i);
        await expect(nameInput).toBeEnabled();
        // Email rendered as read-only text, so no textbox role for that label.
        await expect(canvas.getByText("ada@example.com")).toBeInTheDocument();
    },
};

// ---------------------------------------------------------------------------
// Write-only on specific fields
// ---------------------------------------------------------------------------

export const WriteOnlyFields: OverrideStory = {
    name: "Write-only on sensitive fields",
    tags: ["writeonly", "editable"],
    args: {
        schema: userSchema,
        value: baseValue,
        fields: {
            email: { writeOnly: true },
            notes: { writeOnly: true },
        },
    },
    render: (args) => <SchemaComponent {...args} />,
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        // Write-only forces these as inputs even though the rest defaults to editable.
        const emailInput = await canvas.findByPlaceholderText(/email/i);
        await expect(emailInput).toBeEnabled();
    },
};

// ---------------------------------------------------------------------------
// Cross-reference to validation behaviour
// ---------------------------------------------------------------------------

export const SeeAlsoValidation: StoryObj = {
    name: "See also: Validation",
    tags: ["editable", "validation"],
    parameters: {
        docs: {
            description: {
                story: "Editability controls which fields accept input. To see how those inputs are validated against the schema, jump to the Validation overview.",
            },
        },
    },
    render: () => (
        <div
            style={{
                display: "grid",
                gap: "0.75rem",
                maxWidth: "32rem",
                padding: "1rem",
                border: "1px solid var(--sc-border)",
                borderRadius: "0.5rem",
            }}
        >
            <p
                style={{
                    margin: 0,
                    color: "var(--sc-text-secondary)",
                    fontSize: "0.875rem",
                }}
            >
                Editable fields participate in schema validation. Open the
                Validation overview to see live constraint feedback.
            </p>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                <button
                    type="button"
                    onClick={linkTo("Validation/Overview", "Default")}
                    style={{
                        border: "1px solid #2563eb",
                        background: "#2563eb",
                        color: "#fff",
                        borderRadius: "0.375rem",
                        padding: "0.5rem 0.875rem",
                        cursor: "pointer",
                        fontSize: "0.875rem",
                    }}
                >
                    Validation overview
                </button>
                <button
                    type="button"
                    onClick={linkTo("Validation/Errors", "ErrorBoundary")}
                    style={{
                        border: "1px solid var(--sc-border-input)",
                        background: "var(--sc-bg-secondary)",
                        color: "var(--sc-text)",
                        borderRadius: "0.375rem",
                        padding: "0.5rem 0.875rem",
                        cursor: "pointer",
                        fontSize: "0.875rem",
                    }}
                >
                    Error boundary
                </button>
            </div>
        </div>
    ),
};
