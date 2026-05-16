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

const meta: Meta = {
    title: "Extensibility/Widgets",
    tags: ["widget", "editable"],
};
export default meta;

// ---------------------------------------------------------------------------
// Global scope
// ---------------------------------------------------------------------------

export const GlobalWidget: StoryObj = {
    name: "Global widget (registerWidget)",
    tags: ["widget", "readonly"],
    render: () => (
        <SchemaComponent schema={schema} value={widgetValue} readOnly />
    ),
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

export const ContextScoped: StoryObj = {
    name: "Context-scoped widget (SchemaProvider)",
    tags: ["widget", "readonly"],
    render: () => (
        <SchemaProvider resolver={{}} widgets={contextWidgets}>
            <SchemaComponent schema={schema} value={widgetValue} readOnly />
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

export const InstanceScoped: StoryObj = {
    name: "Instance-scoped widget (widgets prop)",
    tags: ["widget", "readonly"],
    render: () => (
        <SchemaComponent
            schema={schema}
            value={widgetValue}
            readOnly
            widgets={instanceWidgets}
        />
    ),
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        const badges = await canvas.findAllByTestId("instance-badge");
        await expect(badges).toHaveLength(2);
    },
};

// ---------------------------------------------------------------------------
// Resolution order
// ---------------------------------------------------------------------------

export const InstanceOverridesContext: StoryObj = {
    name: "Instance overrides context",
    tags: ["widget", "readonly"],
    render: () => (
        <SchemaProvider resolver={{}} widgets={contextWidgets}>
            <SchemaComponent
                schema={schema}
                value={widgetValue}
                readOnly
                widgets={instanceWidgets}
            />
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

export const RichTextWidget: StoryObj = {
    name: "Rich text widget (editable)",
    tags: ["widget", "editable"],
    render: () => (
        <SchemaComponent
            schema={richtextSchema}
            value={{
                title: "Hello",
                body: "This is some **markdown** content.",
            }}
            widgets={richtextWidgets}
        />
    ),
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

export const RichTextWidgetReadOnly: StoryObj = {
    name: "Rich text widget (read-only)",
    tags: ["widget", "readonly"],
    render: () => (
        <SchemaComponent
            schema={richtextSchema}
            value={{
                title: "Hello",
                body: "This is some **markdown** content.",
            }}
            readOnly
            widgets={richtextWidgets}
        />
    ),
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        const readonlyBody = await canvas.findByTestId("richtext-readonly");
        await expect(readonlyBody).toHaveTextContent(
            "This is some **markdown** content."
        );
    },
};
