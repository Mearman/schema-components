import type { Meta, StoryObj } from "@storybook/react";
import { linkTo } from "@storybook/addon-links";
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
            <div
                style={{
                    display: "flex",
                    gap: "0.5rem",
                    marginTop: "1rem",
                    flexWrap: "wrap",
                }}
            >
                <button
                    type="button"
                    onClick={linkTo("Theme Adapters/Setup", "Default")}
                    style={{
                        border: "1px solid var(--sc-border-input)",
                        background: "var(--sc-bg-secondary)",
                        color: "var(--sc-text)",
                        borderRadius: "0.375rem",
                        padding: "0.5rem 0.875rem",
                        cursor: "pointer",
                        fontSize: "0.875rem",
                    }}
                >
                    Adapter setup snippets
                </button>
                <button
                    type="button"
                    onClick={linkTo("Theme Adapters/Headless", "Editable")}
                    style={{
                        border: "1px solid var(--sc-border-input)",
                        background: "var(--sc-bg-secondary)",
                        color: "var(--sc-text)",
                        borderRadius: "0.375rem",
                        padding: "0.5rem 0.875rem",
                        cursor: "pointer",
                        fontSize: "0.875rem",
                    }}
                >
                    Headless baseline
                </button>
            </div>
        </StoryPage>
    );
}

const meta: Meta<typeof ThemeComparison> = {
    title: "Theme Adapters/Comparison",
    component: ThemeComparison,
    tags: ["theme-adapter", "editable", "readonly"],
    argTypes: {
        readOnly: {
            control: "boolean",
            description: "Toggle every adapter into read-only output.",
        },
    },
};

export default meta;
type Story = StoryObj<typeof ThemeComparison>;

export const Editable: Story = {
    args: { readOnly: false },
};

export const ReadOnly: Story = {
    args: { readOnly: true },
};
