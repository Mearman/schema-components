import "./preview.css";
import type { Preview } from "@storybook/react";
import { withThemeByClassName } from "@storybook/addon-themes";

/**
 * Theme-aware docs via @storybook/addon-themes.
 *
 * The `withThemeByClassName` decorator adds `light-theme` or `dark-theme`
 * to <html> inside the iframe when the user toggles the toolbar button.
 * `initialGlobals` ensures the correct class is set on first render
 * (Storybook 10.3 doesn't always propagate globals to the iframe on load).
 *
 * CSS custom properties on :root / :root.dark-theme handle every colour
 * via var() — no element-level overrides needed.
 */
const preview: Preview = {
    tags: ["autodocs"],
    decorators: [
        withThemeByClassName({
            themes: {
                light: "light-theme",
                dark: "dark-theme",
            },
            defaultTheme: "light",
        }),
    ],
    initialGlobals: {
        theme: "light",
    },
    parameters: {
        controls: {
            matchers: {
                color: /(background|color)$/i,
                date: /Date$/i,
            },
        },
        options: {
            storySort: {
                order: [
                    "README",
                    "Getting Started",
                    [
                        "Introduction",
                        "JSON Schema",
                        "Kitchen Sink",
                        "Interactive State",
                    ],
                    "Inputs",
                    ["Date & Time", "File Upload", "Records", "Defaults"],
                    "Objects & Layout",
                    ["Recursive", "SchemaField", "Visibility & Ordering"],
                    "Editability",
                    "Validation",
                    ["Overview", "Errors"],
                    "Accessibility",
                    "Theme Adapters",
                    [
                        "Setup",
                        "Comparison",
                        "Headless",
                        "MUI",
                        "Mantine",
                        "Radix",
                        "shadcn",
                    ],
                    "HTML Rendering",
                    ["Parity", "Static", "Streaming", "Custom Resolver"],
                    "OpenAPI",
                    ["Schema Documents", "Operations", "Completeness"],
                    "Server Rendering",
                    "Extensibility",
                    ["Widgets", "Unions"],
                ],
            },
        },
    },
};

export default preview;
