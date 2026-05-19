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
            {
                // Runs the same unit suite as the `unit` project, but
                // aliases `react` to `preact/compat` so the React adapter
                // code paths execute against the Preact runtime. This is
                // the only safety net keeping the Preact entry point in
                // `src/preact/` honest about its "thin re-export"
                // contract.
                resolve: {
                    // Order matters: Vite's alias matcher tries entries in
                    // declaration order and accepts the first prefix that
                    // matches. The longer / more-specific path entries must
                    // come BEFORE the bare `react` and `react-dom` entries so
                    // they get a chance to claim the request first.
                    alias: {
                        "react-dom/test-utils": "preact/test-utils",
                        "react-dom/client": "preact/compat/client",
                        "react-dom/server": "preact/compat/server",
                        "react-dom": "preact/compat",
                        "react/jsx-runtime": "preact/jsx-runtime",
                        "react/jsx-dev-runtime": "preact/jsx-dev-runtime",
                        react: "preact/compat",
                    },
                    // Prefer the `module` / ESM entry of dual-format packages.
                    // `@testing-library/react` ships both a CJS `main` and an
                    // ESM `module`; without this, Vite picks the CJS bundle
                    // whose internal `require("react-dom/client")` bypasses
                    // the alias above and pulls in the real React DOM.
                    mainFields: ["module", "jsnext:main", "jsnext", "main"],
                },
                test: {
                    name: "unit-preact",
                    include: [
                        "tests/**/*.unit.test.ts",
                        "tests/**/*.unit.test.tsx",
                        "tests/**/*.integration.test.ts",
                    ],
                    // `@testing-library/react` and `react-dom` ship as CJS
                    // and resolve their React peer via `require("react")`,
                    // which bypasses Vitest's ESM resolve.alias. Force them
                    // to be transformed by Vite so the alias rewrites the
                    // require calls into ESM imports against `preact/compat`.
                    server: {
                        deps: {
                            inline: [
                                "@testing-library/react",
                                "@testing-library/dom",
                                "@testing-library/user-event",
                                "react",
                                "react-dom",
                            ],
                        },
                    },
                },
            },
        ],
    },
});
