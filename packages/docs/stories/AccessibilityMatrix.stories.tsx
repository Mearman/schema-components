import type { Meta, StoryObj } from "@storybook/react";
import { z } from "zod";
import { SchemaComponent } from "schema-components/react/SchemaComponent";
import {
    discriminatedUnionData,
    discriminatedUnionSchema,
} from "../src/demo-schemas.ts";
import {
    DemoCard,
    DemoGrid,
    StoryPage,
    StorySection,
} from "../src/story-layout.tsx";

const requiredSchema = z.object({
    name: z.string().min(1).meta({ description: "Full name" }),
    email: z.email().meta({ description: "Email address" }),
});

const editabilitySchema = z.object({
    id: z.string().meta({ description: "Identifier", readOnly: true }),
    password: z.string().meta({ description: "Password", writeOnly: true }),
    active: z.boolean().meta({ description: "Active" }),
});

function AccessibilityMatrix() {
    return (
        <StoryPage
            title="Accessibility matrix"
            description="Focused fixtures for labels, required fields, read-only/write-only semantics, and tabbed discriminated unions. Storybook a11y checks run against these stories."
        >
            <StorySection title="Labels and required fields">
                <DemoCard>
                    <SchemaComponent
                        schema={requiredSchema}
                        value={{ name: "Ada", email: "ada@example.com" }}
                    />
                </DemoCard>
            </StorySection>
            <StorySection title="Read-only and write-only fields">
                <DemoCard>
                    <SchemaComponent
                        schema={editabilitySchema}
                        value={{
                            id: "usr_123",
                            password: "secret",
                            active: true,
                        }}
                    />
                </DemoCard>
            </StorySection>
            <StorySection title="Discriminated union tabs">
                <DemoGrid>
                    <DemoCard title="Editable">
                        <SchemaComponent
                            schema={discriminatedUnionSchema}
                            value={discriminatedUnionData}
                        />
                    </DemoCard>
                    <DemoCard title="Read-only">
                        <SchemaComponent
                            schema={discriminatedUnionSchema}
                            value={discriminatedUnionData}
                            readOnly
                        />
                    </DemoCard>
                </DemoGrid>
            </StorySection>
        </StoryPage>
    );
}

const meta: Meta<typeof AccessibilityMatrix> = {
    title: "Accessibility/Matrix",
    component: AccessibilityMatrix,
};

export default meta;
type Story = StoryObj<typeof AccessibilityMatrix>;

export const Default: Story = {
    render: () => <AccessibilityMatrix />,
};
