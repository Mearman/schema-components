import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
    stories: ["../stories/**/*.stories.tsx"],
    addons: ["@storybook/addon-vitest", "@storybook/addon-a11y"],
    framework: {
        name: "@storybook/react-vite",
        options: {},
    },
    docs: {
        autodocs: true,
    },
    staticDirs: [{ from: "../../core/dist", to: "/" }],
};

export default config;
