/**
 * Stories for the MUI theme adapter.
 */
import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { z } from "zod";
import { SchemaComponent } from "schema-components/react/SchemaComponent";
import { SchemaProvider } from "schema-components/react/SchemaComponent";
import { muiResolver } from "schema-components/themes/mui";

const profileSchema = z.object({
    name: z.string().min(1).meta({ description: "Full name" }),
    email: z.email().meta({ description: "Email address" }),
    role: z.enum(["admin", "editor", "viewer"]).meta({ description: "Role" }),
    active: z.boolean().meta({ description: "Active" }),
    bio: z.string().max(280).optional().meta({ description: "Bio" }),
});

const initialProfile = {
    name: "Grace Hopper",
    email: "grace@navy.mil",
    role: "admin" as const,
    active: true,
    bio: "Computer scientist and United States Navy rear admiral.",
};

function MuiPreview({ readOnly }: { readOnly: boolean }) {
    const [profile, setProfile] = useState<unknown>(initialProfile);

    return (
        <SchemaProvider resolver={muiResolver}>
            <div style={{ maxWidth: "32rem" }}>
                <SchemaComponent
                    schema={profileSchema}
                    value={profile}
                    onChange={(next) => {
                        setProfile(next);
                    }}
                    readOnly={readOnly}
                />
            </div>
        </SchemaProvider>
    );
}

const meta: Meta<typeof MuiPreview> = {
    title: "React/MUI",
    component: MuiPreview,
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Editable: Story = {
    args: { readOnly: false },
};

export const ReadOnly: Story = {
    args: { readOnly: true },
};
