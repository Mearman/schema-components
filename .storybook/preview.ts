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
                    ["Errors", "Headless", "Recursive", "SchemaField", "Shadcn", "Unions", "Validation"],
                    "HTML",
                    ["Custom Resolver", "Static", "Streaming"],
                    "OpenAPI",
                    ["Operations"],
                ],
            },
        },
    },
};

export default preview;
