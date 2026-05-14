/**
 * Stories for file upload rendering.
 */
import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { z } from "zod";
import { SchemaComponent } from "schema-components/react/SchemaComponent";

const uploadSchema = z.object({
    avatar: z.string().meta({ description: "Avatar", format: "binary" }),
    resume: z
        .string()
        .optional()
        .meta({ description: "Resume (PDF)", format: "binary" }),
});

const initialData = {
    avatar: undefined,
    resume: undefined,
};

function UploadForm({ readOnly }: { readOnly: boolean }) {
    const [value, setValue] = useState<unknown>(initialData);

    return (
        <SchemaComponent
            schema={uploadSchema}
            value={value}
            onChange={(next) => {
                setValue(next);
            }}
            readOnly={readOnly}
        />
    );
}

const meta: Meta<typeof UploadForm> = {
    title: "React/FileUpload",
    component: UploadForm,
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Editable: Story = {
    args: { readOnly: false },
};

export const ReadOnly: Story = {
    args: { readOnly: true },
};
