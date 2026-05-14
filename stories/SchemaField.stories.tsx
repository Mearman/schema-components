/**
 * Stories for SchemaField composition in hand-written layouts.
 */
import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { z } from "zod";
import { SchemaField } from "../src/react/SchemaComponent.tsx";

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
    title: "React/SchemaField",
    component: ProfileForm,
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: () => <ProfileForm />,
};
