/**
 * Stories for file upload rendering.
 */
import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, waitFor, within } from "storybook/test";
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
    title: "Inputs/File Upload",
    component: UploadForm,
    tags: ["file", "editable"],
    argTypes: {
        readOnly: {
            control: "boolean",
            description:
                "Render every file field as a non-interactive placeholder.",
        },
    },
    args: { readOnly: false },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Editable: Story = {
    args: { readOnly: false },
    play: async ({ canvasElement, step }) => {
        const canvas = within(canvasElement);
        await step(
            'each file field is rendered as an <input type="file">',
            async () => {
                const avatarInput = await canvas.findByLabelText(/^avatar$/i);
                await expect(avatarInput).toHaveAttribute("type", "file");
                const resumeInput = await canvas.findByLabelText(/resume/i);
                await expect(resumeInput).toHaveAttribute("type", "file");
            }
        );
        await step(
            "uploading a file populates the input's files list",
            async () => {
                const avatarInput =
                    await canvas.findByLabelText<HTMLInputElement>(/^avatar$/i);
                const file = new File(["test-content"], "ada.png", {
                    type: "image/png",
                });
                await userEvent.upload(avatarInput, file);
                await waitFor(async () => {
                    const filesList = avatarInput.files;
                    await expect(filesList).not.toBeNull();
                    await expect(filesList?.length).toBe(1);
                    await expect(filesList?.item(0)?.name).toBe("ada.png");
                });
            }
        );
    },
};

export const ReadOnly: Story = {
    args: { readOnly: true },
    tags: ["file", "readonly"],
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        // Read-only file fields render a placeholder span, not an input.
        const fileInputs = canvasElement.querySelectorAll("input[type='file']");
        await expect(fileInputs.length).toBe(0);
        await expect(canvas.getAllByText(/file field/i).length).toBeGreaterThan(
            0
        );
    },
};
