import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, waitFor, within } from "storybook/test";
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

/**
 * Locate the `<DemoCard>` whose `<h3>` title matches the adapter name. Each
 * theme demo renders into its own card, so this gives us a panel-scoped
 * element to assert against without cross-contamination.
 */
function findAdapterPanel(root: HTMLElement, title: string): HTMLElement {
    const headings = Array.from(
        root.querySelectorAll<HTMLHeadingElement>("h3")
    );
    const heading = headings.find((h) => h.textContent.trim() === title);
    if (heading === undefined) {
        throw new Error(`Could not find h3 with title "${title}"`);
    }
    const panel = heading.parentElement;
    if (panel === null) {
        throw new Error(`Adapter panel for "${title}" has no parent element`);
    }
    return panel;
}

const adapterClassHooks: readonly {
    name: string;
    selector: string;
    description: string;
}[] = [
    {
        name: "mui",
        selector: ".MuiTextField-root",
        description: "MUI TextField root",
    },
    {
        name: "mantine",
        selector: ".mantine-TextInput-root",
        description: "Mantine TextInput root",
    },
    {
        name: "radix",
        selector: ".rt-TextFieldRoot",
        description: "Radix TextField root",
    },
    {
        name: "shadcn",
        selector: "input.border-input",
        description: "shadcn Tailwind input",
    },
];

export const Editable: Story = {
    args: { readOnly: false },
    play: async ({ canvasElement, step }) => {
        await step(
            "every styled adapter renders its own library hooks",
            async () => {
                for (const {
                    name,
                    selector,
                    description,
                } of adapterClassHooks) {
                    const panel = findAdapterPanel(canvasElement, name);
                    const match = panel.querySelector(selector);
                    if (match === null) {
                        throw new Error(
                            `Expected ${description} (${selector}) inside the "${name}" panel`
                        );
                    }
                    await expect(match).not.toBeNull();
                }
            }
        );

        await step(
            "headless panel renders plain inputs without adapter classes",
            async () => {
                const headlessPanel = findAdapterPanel(
                    canvasElement,
                    "headless"
                );
                for (const { selector } of adapterClassHooks) {
                    await expect(
                        headlessPanel.querySelector(selector)
                    ).toBeNull();
                }
            }
        );

        await step(
            "typing in one adapter does not affect another adapter's value",
            async () => {
                // Use the shadcn panel for input because its native <input>
                // is the simplest to drive with userEvent.
                const shadcnPanel = findAdapterPanel(canvasElement, "shadcn");
                const shadcnName = shadcnPanel.querySelector<HTMLInputElement>(
                    "input.border-input[type='text']"
                );
                if (shadcnName === null) {
                    throw new Error(
                        "Expected a shadcn name input in the shadcn panel"
                    );
                }
                await userEvent.clear(shadcnName);
                await userEvent.type(shadcnName, "Cross-Adapter Test");
                await waitFor(async () => {
                    await expect(shadcnName).toHaveValue("Cross-Adapter Test");
                });

                // Every adapter now pairs labels with inputs via htmlFor/id,
                // so the accessible name is computed for every control.
                // `getByRole("textbox", { name })` is preferred — it follows
                // the same lookup chain as a screen reader and avoids the
                // ambiguity of MUI's notched-outline `<legend>` which would
                // otherwise trip `getByLabelText`.
                const otherPanelNames = [
                    "mui",
                    "mantine",
                    "radix",
                    "headless",
                ] as const;

                for (const name of otherPanelNames) {
                    const panel = findAdapterPanel(canvasElement, name);
                    const utils = within(panel);
                    const input = utils.getByRole<HTMLInputElement>("textbox", {
                        name: /full name/i,
                    });
                    await expect(input).toHaveValue(profileData.name);
                }
            }
        );
    },
};

export const ReadOnly: Story = {
    args: { readOnly: true },
    play: async ({ canvasElement, step }) => {
        await step("every adapter panel shows the value as text", async () => {
            for (const { name } of adapterClassHooks) {
                const panel = findAdapterPanel(canvasElement, name);
                const utils = within(panel);
                await expect(
                    utils.getByText(profileData.name)
                ).toBeInTheDocument();
            }
            const headlessPanel = findAdapterPanel(canvasElement, "headless");
            await expect(
                within(headlessPanel).getByText(profileData.name)
            ).toBeInTheDocument();
        });

        await step(
            "no editable inputs exist anywhere in the comparison",
            async () => {
                const canvas = within(canvasElement);
                await expect(canvas.queryAllByRole("textbox")).toHaveLength(0);
                await expect(canvas.queryAllByRole("checkbox")).toHaveLength(0);
                await expect(canvas.queryAllByRole("combobox")).toHaveLength(0);
            }
        );
    },
};
