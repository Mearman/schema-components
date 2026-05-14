import { defineConfig } from "vitest/config";

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
            exclude: ["src/react/**", "src/themes/**"],
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
        ],
    },
});
