import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { svelteTesting } from "@testing-library/svelte/vite";
import solid from "vite-plugin-solid";

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
                "src/svelte/**",
                "src/solid/**",
                "src/lit/**",
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
                    // Keep the existing React/HTML/OpenAPI suite running on
                    // the same default environment. Vue/Svelte/Solid/Lit tests
                    // run in their sibling projects so each framework's compile
                    // step only fires when actually needed.
                    exclude: [
                        "tests/**/*.vue.unit.test.ts",
                        "tests/svelte/**",
                        "tests/**/*.solid.unit.test.ts",
                        "tests/**/*.solid.unit.test.tsx",
                        "tests/**/*.lit.unit.test.ts",
                        "node_modules/**",
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
                    exclude: [
                        "tests/**/*.vue.unit.test.ts",
                        "tests/svelte/**",
                        "tests/**/*.solid.unit.test.ts",
                        "tests/**/*.solid.unit.test.tsx",
                        "tests/**/*.lit.unit.test.ts",
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
            {
                // Vue-specific unit tests. Compiles `.vue` SFCs via
                // `@vitejs/plugin-vue` so `<script setup lang="ts">` and
                // `<template>` blocks resolve at test-time. Globbed
                // narrowly to `*.vue.unit.test.ts` so the suite stays
                // visibly scoped from the file system alone.
                plugins: [vue()],
                test: {
                    name: "unit-vue",
                    environment: "happy-dom",
                    include: ["tests/**/*.vue.unit.test.ts"],
                },
            },
            {
                // `svelte()` compiles `.svelte` files in test mode.
                // `svelteTesting()` switches the Svelte package's
                // `exports` to the `browser` condition so Svelte 5's
                // `mount()` (which is browser-only —
                // `index-server.js` throws `lifecycle_function_unavailable`)
                // resolves to the client implementation, and registers
                // an auto-cleanup hook that runs after each test.
                plugins: [svelte(), svelteTesting()],
                test: {
                    name: "unit-svelte",
                    environment: "happy-dom",
                    include: [
                        "tests/svelte/**/*.svelte.unit.test.ts",
                        "tests/svelte/**/*.svelte.unit.test.tsx",
                    ],
                    setupFiles: [],
                },
            },
            {
                // Solid-flavoured unit tests need vite-plugin-solid to
                // compile the Solid JSX pragma plus the renderers' fine-
                // grained reactivity scopes. Solid's tests run against
                // a separate project so the React JSX setup never sees
                // a Solid-pragma file.
                plugins: [solid()],
                test: {
                    name: "unit-solid",
                    environment: "happy-dom",
                    include: [
                        "tests/**/*.solid.unit.test.ts",
                        "tests/**/*.solid.unit.test.tsx",
                    ],
                    // Resolve `solid-js` to its ESM browser build so
                    // `vite-plugin-solid` reaches the correct entry.
                    server: {
                        deps: {
                            inline: [/solid-js/, /@solidjs\/testing-library/],
                        },
                    },
                },
                resolve: {
                    conditions: ["development", "browser"],
                },
            },
            {
                test: {
                    name: "unit-lit",
                    include: ["tests/**/*.lit.unit.test.ts"],
                    // happy-dom has substantially better Custom Element
                    // support than jsdom, including correctly invoking
                    // connectedCallback/disconnectedCallback during element
                    // upgrade — required for Lit's reactive update cycle.
                    environment: "happy-dom",
                },
            },
        ],
    },
});
