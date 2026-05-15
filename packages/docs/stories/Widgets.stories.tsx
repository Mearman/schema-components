/**
 * Scoped widget stories — demonstrates instance, context, and global
 * widget resolution with the WidgetMap type.
 */
import type { Meta, StoryObj } from "@storybook/react";
import { z } from "zod";
import {
    SchemaComponent,
    SchemaProvider,
    registerWidget,
    type WidgetMap,
} from "schema-components/react/SchemaComponent";

// Register a global widget
registerWidget("badge", ({ value }) => (
    <span
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

const value = {
    name: "Ada Lovelace",
    role: "admin",
    department: "Engineering",
};

const meta: Meta = {
    title: "Extensibility/Widgets",
};
export default meta;

// ---------------------------------------------------------------------------
// Global scope
// ---------------------------------------------------------------------------

export const GlobalWidget: StoryObj = {
    name: "Global widget (registerWidget)",
    render: () => <SchemaComponent schema={schema} value={value} readOnly />,
};

// ---------------------------------------------------------------------------
// Context scope
// ---------------------------------------------------------------------------

const contextWidgets: WidgetMap = new Map([
    [
        "badge",
        ({ value }) => (
            <span
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
    render: () => (
        <SchemaProvider resolver={{}} widgets={contextWidgets}>
            <SchemaComponent schema={schema} value={value} readOnly />
        </SchemaProvider>
    ),
};

// ---------------------------------------------------------------------------
// Instance scope
// ---------------------------------------------------------------------------

const instanceWidgets: WidgetMap = new Map([
    [
        "badge",
        ({ value }) => (
            <span
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
    render: () => (
        <SchemaComponent
            schema={schema}
            value={value}
            readOnly
            widgets={instanceWidgets}
        />
    ),
};

// ---------------------------------------------------------------------------
// Resolution order
// ---------------------------------------------------------------------------

export const InstanceOverridesContext: StoryObj = {
    name: "Instance overrides context",
    render: () => (
        <SchemaProvider resolver={{}} widgets={contextWidgets}>
            <SchemaComponent
                schema={schema}
                value={value}
                readOnly
                widgets={instanceWidgets}
            />
        </SchemaProvider>
    ),
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
        ({ value, onChange, readOnly: isReadOnly }) => {
            if (isReadOnly) {
                return (
                    <div
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
};

export const RichTextWidgetReadOnly: StoryObj = {
    name: "Rich text widget (read-only)",
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
};
