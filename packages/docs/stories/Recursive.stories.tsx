/**
 * Stories for recursive schemas.
 */
import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { z } from "zod";
import { SchemaComponent } from "schema-components/react/SchemaComponent";

const treeSchema: z.ZodType = z.object({
    label: z.string().meta({ description: "Label" }),
    children: z
        .array(z.lazy(() => treeSchema))
        .optional()
        .meta({ description: "Children" }),
});

const treeData = {
    label: "Root",
    children: [
        {
            label: "Branch A",
            children: [{ label: "Leaf A1" }, { label: "Leaf A2" }],
        },
        {
            label: "Branch B",
            children: [{ label: "Leaf B1" }],
        },
    ],
};

function TreeDemo({ readOnly }: { readOnly: boolean }) {
    const [value, setValue] = useState<unknown>(treeData);

    return (
        <SchemaComponent
            schema={treeSchema}
            value={value}
            onChange={(next) => {
                setValue(next);
            }}
            readOnly={readOnly}
        />
    );
}

const meta: Meta<typeof TreeDemo> = {
    title: "Objects & Layout/Recursive",
    component: TreeDemo,
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Editable: Story = {
    args: { readOnly: false },
};

export const ReadOnly: Story = {
    args: { readOnly: true },
};
