import "./preview.css";
import type { Preview } from "@storybook/react";
import { withThemeByClassName } from "@storybook/addon-themes";

/**
 * Detect system colour-scheme preference so Storybook defaults to the
 * user's OS/browser setting on first load. Falls back to "light" when
 * `window` is unavailable (SSR / test environments).
 */
const prefersDark =
    typeof window !== "undefined" &&
    "matchMedia" in window &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
const systemTheme = prefersDark ? "dark" : "light";

/**
 * Theme-aware docs via @storybook/addon-themes.
 *
 * The `withThemeByClassName` decorator adds `light-theme` or `dark-theme`
 * to <html> inside the iframe when the user toggles the toolbar button.
 * `initialGlobals` seeds the toolbar with the detected system preference
 * so the correct class is set on first render.
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
            defaultTheme: systemTheme,
        }),
    ],
    initialGlobals: {
        theme: systemTheme,
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
                        "Quick Start",
                        "How it works",
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
                        "Overview",
                        "Setup",
                        "Comparison",
                        "Headless",
                        "MUI",
                        "Mantine",
                        "Radix",
                        "shadcn",
                    ],
                    "HTML Rendering",
                    [
                        "Overview",
                        "Parity",
                        "Static",
                        "Streaming",
                        "Custom Resolver",
                    ],
                    "OpenAPI",
                    [
                        "Walkthrough",
                        "Schema Documents",
                        "Operations",
                        "Completeness",
                    ],
                    "Server Rendering",
                    "Extensibility",
                    ["Widgets", "Unions"],
                ],
            },
        },
    },
};

export default preview;
