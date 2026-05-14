/**
 * Stories for the shadcn/ui theme adapter.
 */
import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { z } from "zod";
import { SchemaComponent } from "../src/react/SchemaComponent.tsx";
import { SchemaProvider } from "../src/react/SchemaComponent.tsx";
import { shadcnResolver } from "../src/themes/shadcn.tsx";

const profileSchema = z.object({
    name: z.string().min(1).meta({ description: "Full name" }),
    bio: z.string().max(280).meta({ description: "Bio" }),
    website: z.string().optional().meta({ description: "Website" }),
    notifications: z.boolean().meta({ description: "Email notifications" }),
    role: z.enum(["admin", "editor", "viewer"]).meta({ description: "Role" }),
});

const initialProfile = {
    name: "Ada Lovelace",
    bio: "Mathematician and first programmer.",
    website: "https://example.com",
    notifications: true,
    role: "admin" as const,
};

function ShadcnPreview({ readOnly }: { readOnly: boolean }) {
    const [profile, setProfile] = useState<unknown>(initialProfile);

    return (
        <SchemaProvider resolver={shadcnResolver}>
            <div className="max-w-xl space-y-4 rounded-lg border border-slate-200 p-4">
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

const meta: Meta<typeof ShadcnPreview> = {
    title: "React/Shadcn",
    component: ShadcnPreview,
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Editable: Story = {
    args: { readOnly: false },
};

export const ReadOnly: Story = {
    args: { readOnly: true },
};
