import type { Meta, StoryObj } from "@storybook/react";
import { profileData, profileSchema } from "../src/demo-schemas.ts";
import { DemoCard, DemoGrid, StoryPage } from "../src/story-layout.tsx";
import { ThemeSchemaDemo, themeNames } from "../src/theme-renderers.tsx";

function ThemeComparison({ readOnly }: { readOnly: boolean }) {
    return (
        <StoryPage
            title="Theme comparison"
            description="The same schema and value rendered through each available React resolver. This is the quickest way to compare styling, layout, read-only rendering, and editable controls across adapters."
        >
            <DemoGrid>
                {themeNames.map((theme) => (
                    <DemoCard key={theme} title={theme}>
                        <ThemeSchemaDemo
                            schema={profileSchema}
                            value={profileData}
                            theme={theme}
                            readOnly={readOnly}
                        />
                    </DemoCard>
                ))}
            </DemoGrid>
        </StoryPage>
    );
}

const meta: Meta<typeof ThemeComparison> = {
    title: "Theme Adapters/Comparison",
    component: ThemeComparison,
};

export default meta;
type Story = StoryObj<typeof ThemeComparison>;

export const Editable: Story = {
    args: { readOnly: false },
};

export const ReadOnly: Story = {
    args: { readOnly: true },
};
