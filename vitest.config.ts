import { defineConfig } from "vitest/config";
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import { playwright } from "@vitest/browser-playwright";

import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    test: {
        coverage: {
            provider: "v8",
            include: [
                "src/core/**/*.ts",
                "src/html/**/*.ts",
                "src/openapi/**/*.ts",
                "src/openapi/**/*.tsx",
                "src/react/**/*.tsx",
                "src/themes/**/*.tsx",
            ],
            // Per-file thresholds enforce minimum coverage on every file.
            // Files tested via Storybook (react/, themes/) are excluded below.
            thresholds: {
                lines: 80,
                branches: 60,
                functions: 80,
                perFile: true,
            },
            exclude: [
                "src/react/**",
                "src/themes/**",
            ],
        },
        projects: [
            {
                test: {
                    name: "unit",
                    include: [
                        "tests/**/*.unit.test.ts",
                        "tests/**/*.unit.test.tsx",
                        "tests/**/*.integration.test.ts",
                    ],
                },
            },
            {
                test: {
                    name: "e2e",
                    include: ["tests/**/*.e2e.test.ts"],
                },
            },
            {
                extends: true,
                plugins: [storybookTest({
                    configDir: path.join(dirname, ".storybook"),
                    storybookScript: "pnpm storybook -- --no-open",
                })],
                test: {
                    name: "storybook",
                    browser: {
                        enabled: true,
                        provider: playwright(),
                        headless: true,
                        instances: [{ browser: "chromium" }],
                    },
                    setupFiles: ["./.storybook/vitest.setup.ts"],
                },
            },
        ],
    },
});
