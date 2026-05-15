import "./preview.css";
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
                    [
                        "DateTime",
                        "Errors",
                        "FileUpload",
                        "Headless",
                        "MUI",
                        "Mantine",
                        "Recursive",
                        "SchemaField",
                        "Shadcn",
                        "Unions",
                        "Validation",
                    ],
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
