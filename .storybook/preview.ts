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
                    "React",
                    ["Headless", "Shadcn"],
                    "HTML",
                    ["Static", "Streaming"],
                    "OpenAPI",
                ],
            },
        },
    },
};

export default preview;
