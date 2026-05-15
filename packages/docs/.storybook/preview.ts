import "./preview.css";
import type { Preview } from "@storybook/react";
import { withThemeByClassName } from "@storybook/addon-themes";

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
