/**
 * View template stories — demonstrating serialisable field overrides
 * for per-user view persistence.
 */
import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { z } from "zod";
import { SchemaComponent } from "schema-components/react/SchemaComponent";
import {
    DemoCard,
    DemoGrid,
    JsonPanel,
    StoryPage,
    StorySection,
} from "../src/story-layout.tsx";

// ---------------------------------------------------------------------------
// Schema & sample data
// ---------------------------------------------------------------------------

const userSchema = z.object({
    name: z.string().min(1).meta({ description: "Full name" }),
    email: z.email().meta({ description: "Email address" }),
    role: z.enum(["admin", "editor", "viewer"]).meta({ description: "Role" }),
    active: z.boolean().meta({ description: "Active" }),
    department: z.string().meta({ description: "Department" }),
    startDate: z.string().meta({ description: "Start date", format: "date" }),
    notes: z.string().optional().meta({ description: "Notes" }),
});

const userData = {
    name: "Ada Lovelace",
    email: "ada@example.com",
    role: "admin" as const,
    active: true,
    department: "Engineering",
    startDate: "2024-01-15",
    notes: "Team lead for the analytics project.",
};

// The field override keys for this schema, for the controls.
const fieldNames = Object.keys(
    userSchema.def.shape
) as (keyof (typeof userSchema)["def"]["shape"])[];

// ---------------------------------------------------------------------------
// View template editor
// ---------------------------------------------------------------------------

interface ViewTemplateEntry {
    visible?: boolean;
    readOnly?: boolean;
    order?: number;
    description?: string;
}

type ViewTemplate = Partial<
    Record<(typeof fieldNames)[number], ViewTemplateEntry>
>;

/** Simple checkbox + order control per field. */
function ViewTemplateEditor({
    template,
    onChange,
}: {
    template: ViewTemplate;
    onChange: (next: ViewTemplate) => void;
}) {
    return (
        <div
            style={{
                display: "grid",
                gap: "0.5rem",
                fontSize: "0.8125rem",
            }}
        >
            {fieldNames.map((name) => {
                const entry = template[name] ?? {};
                return (
                    <div
                        key={name}
                        style={{
                            display: "grid",
                            gridTemplateColumns: "8rem 1fr 1fr 4rem",
                            gap: "0.5rem",
                            alignItems: "center",
                        }}
                    >
                        <label style={{ fontWeight: 500 }}>{name}</label>
                        <label>
                            <input
                                type="checkbox"
                                checked={entry.visible !== false}
                                onChange={() => {
                                    onChange({
                                        ...template,
                                        [name]: {
                                            ...entry,
                                            visible: !(entry.visible !== false),
                                        },
                                    });
                                }}
                            />{" "}
                            visible
                        </label>
                        <label>
                            <input
                                type="checkbox"
                                checked={entry.readOnly === true}
                                onChange={() => {
                                    onChange({
                                        ...template,
                                        [name]: {
                                            ...entry,
                                            readOnly: !(
                                                entry.readOnly === true
                                            ),
                                        },
                                    });
                                }}
                            />{" "}
                            read-only
                        </label>
                        <label>
                            order{" "}
                            <input
                                type="number"
                                min={1}
                                max={fieldNames.length}
                                value={entry.order ?? ""}
                                style={{ width: "2.5rem" }}
                                onChange={(e) => {
                                    const raw = e.target.value;
                                    const order =
                                        raw === "" ? undefined : Number(raw);
                                    onChange({
                                        ...template,
                                        [name]: { ...entry, order },
                                    });
                                }}
                            />
                        </label>
                    </div>
                );
            })}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

const meta = {
    title: "Extensibility/View Templates",
    tags: ["editable", "interactive", "zod"],
    parameters: {
        apiSymbols: ["SchemaComponent"],
    },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

/** Interactive view template editor — shows how the `fields` prop acts as
 *  serialisable per-user view metadata. */
function InteractiveViewTemplateDemo() {
    const [value, setValue] = useState<unknown>(userData);
    const [template, setTemplate] = useState<ViewTemplate>({});

    return (
        <StoryPage
            title="View templates"
            description="The `fields` prop accepts a plain JSON object controlling visibility, ordering, and editability per field. This blob is fully serialisable — persist it per user as a 'view template' and apply it on render."
        >
            <DemoGrid>
                <DemoCard title="View template editor">
                    <ViewTemplateEditor
                        template={template}
                        onChange={setTemplate}
                    />
                </DemoCard>
                <DemoCard title="Rendered form">
                    <SchemaComponent
                        schema={userSchema}
                        value={value}
                        onChange={setValue}
                        fields={template}
                    />
                </DemoCard>
            </DemoGrid>
            <DemoGrid>
                <DemoCard title="Serialised template (persist this)">
                    <JsonPanel value={template} />
                </DemoCard>
                <DemoCard title="Form value">
                    <JsonPanel value={value} />
                </DemoCard>
            </DemoGrid>
        </StoryPage>
    );
}

export const Interactive: Story = {
    render: () => <InteractiveViewTemplateDemo />,
};

/** Pre-configured templates demonstrating common use cases. */

const managerTemplate: ViewTemplate = {
    name: { visible: true, order: 1, readOnly: true },
    email: { visible: true, order: 2 },
    role: { visible: false },
    active: { visible: true, order: 3, readOnly: true },
    department: { visible: true, order: 4 },
    startDate: { visible: true, order: 5 },
    notes: { visible: true, order: 6 },
};

const selfServiceTemplate: ViewTemplate = {
    name: { visible: true, order: 1, readOnly: true },
    email: { visible: true, order: 2 },
    role: { visible: false },
    active: { visible: false },
    department: { visible: true, order: 3, readOnly: true },
    startDate: { visible: false },
    notes: { visible: true, order: 4 },
};

const adminTemplate: ViewTemplate = {
    name: { visible: true, order: 1 },
    email: { visible: true, order: 2 },
    role: { visible: true, order: 3 },
    active: { visible: true, order: 4 },
    department: { visible: true, order: 5 },
    startDate: { visible: true, order: 6 },
    notes: { visible: true, order: 7 },
};

export const ManagerView: Story = {
    name: "Manager view template",
    args: {
        schema: userSchema,
        value: userData,
        fields: managerTemplate,
    },
};

export const SelfServiceView: Story = {
    name: "Self-service view template",
    args: {
        schema: userSchema,
        value: userData,
        fields: selfServiceTemplate,
    },
};

export const AdminView: Story = {
    name: "Admin view template (all fields)",
    args: {
        schema: userSchema,
        value: userData,
        fields: adminTemplate,
    },
};
