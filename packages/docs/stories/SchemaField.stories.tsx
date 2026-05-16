/**
 * Stories for SchemaField composition in hand-written layouts.
 */
import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { z } from "zod";
import { SchemaField } from "schema-components/react/SchemaComponent";

const profileSchema = z.object({
    name: z.string().meta({ description: "Full name" }),
    email: z.email().meta({ description: "Email address" }),
    role: z.enum(["admin", "editor", "viewer"]).meta({ description: "Role" }),
    active: z.boolean().meta({ description: "Active" }),
});

const initialProfile = {
    name: "Ada Lovelace",
    email: "ada@example.com",
    role: "admin" as const,
    active: true,
};

function ProfileForm() {
    const [profile, setProfile] = useState<unknown>(initialProfile);

    return (
        <div style={{ display: "grid", gap: "1rem", maxWidth: "32rem" }}>
            <SchemaField
                schema={profileSchema}
                path="name"
                value={profile}
                onChange={setProfile}
            />
            <SchemaField
                schema={profileSchema}
                path="email"
                value={profile}
                onChange={setProfile}
            />
            <SchemaField
                schema={profileSchema}
                path="role"
                value={profile}
                onChange={setProfile}
            />
            <SchemaField
                schema={profileSchema}
                path="active"
                value={profile}
                onChange={setProfile}
            />
        </div>
    );
}

const meta: Meta<typeof ProfileForm> = {
    title: "Objects & Layout/SchemaField",
    component: ProfileForm,
    tags: ["editable", "zod"],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: () => <ProfileForm />,
    play: async ({ canvasElement, step }) => {
        const canvas = within(canvasElement);
        await step(
            "editing the name SchemaField mutates only the name slice of state",
            async () => {
                const nameInput =
                    await canvas.findByPlaceholderText(/full name/i);
                await userEvent.clear(nameInput);
                await userEvent.type(nameInput, "Grace Hopper");
                await waitFor(async () => {
                    await expect(nameInput).toHaveValue("Grace Hopper");
                });
            }
        );
        await step(
            "the email SchemaField retains its existing value while a sibling is edited",
            async () => {
                const emailInput =
                    await canvas.findByPlaceholderText(/email address/i);
                await expect(emailInput).toHaveValue("ada@example.com");
            }
        );
        await step("the role select reflects schema enum values", async () => {
            const roleSelect = canvas.getByRole("combobox");
            await userEvent.selectOptions(roleSelect, "editor");
            await waitFor(async () => {
                await expect(roleSelect).toHaveValue("editor");
            });
        });
    },
};
