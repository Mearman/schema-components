import { defineConfig } from "tsdown";

/**
 * Bundler configuration.
 *
 * `tsdown` compiles plain TypeScript / TSX entries. The Vue
 * (`.vue`) and Svelte (`.svelte`) adapter sources require their own
 * compiler steps (`@vitejs/plugin-vue`, `@sveltejs/vite-plugin-svelte`)
 * which are not currently wired into `tsdown`, so those source trees
 * are intentionally excluded from `entry`. Consumers of the Vue and
 * Svelte adapters import the source files directly through their own
 * Vite-based toolchains — the `./vue/*` and `./svelte/*` export paths
 * resolve to the source tree (`src/svelte/**` ships in the tarball,
 * see `files` in `package.json`).
 *
 * The Preact, Solid, and Lit adapters are plain TypeScript / TSX and
 * are bundled normally into `dist/<adapter>/` so consumers receive
 * pre-compiled outputs through the conventional `./<adapter>/*`
 * subpath.
 */
export default defineConfig({
    entry: [
        "src/core/**/*.ts",
        "src/react/**/*.ts",
        "src/react/**/*.tsx",
        "src/preact/**/*.ts",
        "src/preact/**/*.tsx",
        "src/html/**/*.ts",
        "src/openapi/**/*.ts",
        "src/openapi/**/*.tsx",
        "src/themes/**/*.ts",
        "src/themes/**/*.tsx",
        "src/solid/**/*.ts",
        "src/solid/**/*.tsx",
        "src/lit/**/*.ts",
    ],
    format: "esm",
    dts: true,
});
