import remarkGfm from "remark-gfm";
import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
    stories: ["../stories/**/*.mdx", "../stories/**/*.stories.tsx"],
    addons: [
        "@storybook/addon-vitest",
        "@storybook/addon-a11y",
        {
            name: "@storybook/addon-docs",
            options: {
                mdxPluginOptions: {
                    mdxCompileOptions: {
                        remarkPlugins: [remarkGfm],
                    },
                },
            },
        },
    ],
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
