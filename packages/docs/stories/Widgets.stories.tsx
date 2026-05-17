/**
 * Scoped widget stories — demonstrates instance, context, and global
 * widget resolution with the WidgetMap type.
 */
import type { Meta, StoryObj } from "@storybook/react";
import { expect, within } from "storybook/test";
import { z } from "zod";
import {
    SchemaComponent,
    SchemaProvider,
    registerWidget,
    type WidgetMap,
} from "schema-components/react/SchemaComponent";
import type { RenderProps } from "schema-components/core/renderer";

// Register a global widget
registerWidget("badge", ({ value }: RenderProps) => (
    <span
        data-testid="global-badge"
        style={{
            display: "inline-block",
            padding: "0.125rem 0.5rem",
            borderRadius: "9999px",
            fontSize: "0.75rem",
            fontWeight: 600,
            background: "#dbeafe",
            color: "#1d4ed8",
        }}
    >
        {String(value)}
    </span>
));

const schema = z.object({
    name: z.string().meta({ description: "Name" }),
    role: z.string().meta({ component: "badge", description: "Role" }),
    department: z
        .string()
        .meta({ component: "badge", description: "Department" }),
});

const widgetValue = {
    name: "Ada Lovelace",
    role: "admin",
    department: "Engineering",
};

const meta = {
    title: "Extensibility/Widgets",
    component: SchemaComponent,
    tags: ["widget", "editable"],
} satisfies Meta<typeof SchemaComponent>;
export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// Global scope
// ---------------------------------------------------------------------------

export const GlobalWidget: Story = {
    name: "Global widget (registerWidget)",
    tags: ["widget", "readonly"],
    args: {
        schema: schema,
        value: widgetValue,
        readOnly: true,
    },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        const badges = await canvas.findAllByTestId("global-badge");
        // Two fields wear the badge widget; the plain `name` field does not.
        await expect(badges).toHaveLength(2);
        await expect(badges[0]).toHaveTextContent("admin");
        await expect(badges[1]).toHaveTextContent("Engineering");
    },
};

// ---------------------------------------------------------------------------
// Context scope
// ---------------------------------------------------------------------------

const contextWidgets: WidgetMap = new Map([
    [
        "badge",
        ({ value }: RenderProps) => (
            <span
                data-testid="context-badge"
                style={{
                    display: "inline-block",
                    padding: "0.25rem 0.75rem",
                    borderRadius: "0.25rem",
                    fontSize: "0.875rem",
                    background: "#dcfce7",
                    color: "#166534",
                    border: "1px solid #bbf7d0",
                }}
            >
                {String(value)}
            </span>
        ),
    ],
]);

export const ContextScoped: Story = {
    name: "Context-scoped widget (SchemaProvider)",
    tags: ["widget", "readonly"],
    args: {
        schema: schema,
        value: widgetValue,
        readOnly: true,
    },
    // Wrapped in SchemaProvider so the widget map is supplied via context —
    // this story genuinely needs `render` rather than pure args-only. Args
    // mirror what the render function passes so the controls panel still
    // reflects the rendered component.
    render: (args) => (
        <SchemaProvider resolver={{}} widgets={contextWidgets}>
            <SchemaComponent {...args} />
        </SchemaProvider>
    ),
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        const badges = await canvas.findAllByTestId("context-badge");
        await expect(badges).toHaveLength(2);
    },
};

// ---------------------------------------------------------------------------
// Instance scope
// ---------------------------------------------------------------------------

const instanceWidgets: WidgetMap = new Map([
    [
        "badge",
        ({ value }: RenderProps) => (
            <span
                data-testid="instance-badge"
                style={{
                    display: "inline-block",
                    padding: "0.25rem 0.75rem",
                    borderRadius: "0.375rem",
                    fontSize: "0.875rem",
                    background: "#fef3c7",
                    color: "#92400e",
                    border: "1px solid #fde68a",
                    fontFamily: "monospace",
                }}
            >
                {String(value)}
            </span>
        ),
    ],
]);

export const InstanceScoped: Story = {
    name: "Instance-scoped widget (widgets prop)",
    tags: ["widget", "readonly"],
    args: {
        schema: schema,
        value: widgetValue,
        readOnly: true,
        widgets: instanceWidgets,
    },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        const badges = await canvas.findAllByTestId("instance-badge");
        await expect(badges).toHaveLength(2);
    },
};

// ---------------------------------------------------------------------------
// Resolution order
// ---------------------------------------------------------------------------

export const InstanceOverridesContext: Story = {
    name: "Instance overrides context",
    tags: ["widget", "readonly"],
    args: {
        schema: schema,
        value: widgetValue,
        readOnly: true,
        widgets: instanceWidgets,
    },
    // Composed with SchemaProvider so the instance-scoped widgets prop can be
    // shown winning over the context-supplied map — args drive SchemaComponent
    // and the provider stays in render.
    render: (args) => (
        <SchemaProvider resolver={{}} widgets={contextWidgets}>
            <SchemaComponent {...args} />
        </SchemaProvider>
    ),
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        // Instance-scoped wins over context-scoped of the same name.
        await expect(canvas.queryAllByTestId("context-badge")).toHaveLength(0);
        const instanceBadges = await canvas.findAllByTestId("instance-badge");
        await expect(instanceBadges).toHaveLength(2);
    },
};

// ---------------------------------------------------------------------------
// Rich widget example
// ---------------------------------------------------------------------------

const richtextSchema = z.object({
    title: z.string().meta({ description: "Title" }),
    body: z.string().meta({ component: "richtext", description: "Body" }),
});

const richtextWidgets: WidgetMap = new Map([
    [
        "richtext",
        ({ value, onChange, readOnly: isReadOnly }: RenderProps) => {
            if (isReadOnly) {
                return (
                    <div
                        data-testid="richtext-readonly"
                        style={{
                            border: "1px solid #e5e7eb",
                            borderRadius: "0.375rem",
                            padding: "0.75rem",
                            background: "#f9fafb",
                            whiteSpace: "pre-wrap",
                            minHeight: "4rem",
                        }}
                    >
                        {typeof value === "string" ? value : "—"}
                    </div>
                );
            }
            return (
                <textarea
                    data-testid="richtext-editor"
                    value={typeof value === "string" ? value : ""}
                    onChange={(e) => {
                        onChange(e.target.value);
                    }}
                    rows={4}
                    style={{
                        width: "100%",
                        border: "1px solid #d1d5db",
                        borderRadius: "0.375rem",
                        padding: "0.5rem",
                        fontFamily: "monospace",
                        fontSize: "0.875rem",
                    }}
                />
            );
        },
    ],
]);

export const RichTextWidget: Story = {
    name: "Rich text widget (editable)",
    tags: ["widget", "editable"],
    args: {
        schema: richtextSchema,
        value: {
            title: "Hello",
            body: "This is some **markdown** content.",
        },
        widgets: richtextWidgets,
    },
    play: async ({ canvasElement, step }) => {
        const canvas = within(canvasElement);
        await step(
            "the richtext widget renders an editable textarea with the schema value",
            async () => {
                const editor = await canvas.findByTestId("richtext-editor");
                await expect(editor).toBeEnabled();
                await expect(editor).toHaveValue(
                    "This is some **markdown** content."
                );
            }
        );
    },
};

export const RichTextWidgetReadOnly: Story = {
    name: "Rich text widget (read-only)",
    tags: ["widget", "readonly"],
    args: {
        schema: richtextSchema,
        value: {
            title: "Hello",
            body: "This is some **markdown** content.",
        },
        readOnly: true,
        widgets: richtextWidgets,
    },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        const readonlyBody = await canvas.findByTestId("richtext-readonly");
        await expect(readonlyBody).toHaveTextContent(
            "This is some **markdown** content."
        );
    },
};
