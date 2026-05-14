import type { Preview } from "@storybook/react";

const preview: Preview = {
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
                    "Introduction",
                    "JSON Schema",
                    "React",
                    ["Headless", "SchemaField", "Unions"],
                    "HTML",
                    ["Static", "Streaming", "Custom Resolver"],
                    "OpenAPI",
                ],
            },
        },
    },
};

export default preview;
