import { defineConfig } from "tsdown";

/**
 * Bundler configuration.
 *
 * The Svelte adapter source under `src/svelte/` is intentionally
 * excluded from the bundled output. `.svelte` files require a
 * dedicated compiler step (`@sveltejs/vite-plugin-svelte` /
 * `svelte-preprocess`) which is not currently wired into `tsdown`.
 * Consumers of the Svelte adapter import the source `.svelte` /
 * `.ts` files directly through their own Vite + Svelte toolchain —
 * the package's `./svelte/*` export path resolves to the source tree
 * under `src/svelte/` when the consumer is configured to handle
 * `.svelte` imports.
 *
 * A future build step that runs the Svelte compiler ahead of tsdown
 * would let us ship the adapter pre-compiled; until then, leaving
 * `src/svelte/**` out of `entry` keeps the React / HTML / OpenAPI
 * outputs identical to the historic shape and avoids the parser
 * exploding on `.svelte` HTML-comment headers.
 */
export default defineConfig({
    entry: [
        "src/core/**/*.ts",
        "src/react/**/*.ts",
        "src/react/**/*.tsx",
        "src/html/**/*.ts",
        "src/openapi/**/*.ts",
        "src/openapi/**/*.tsx",
        "src/themes/**/*.ts",
        "src/themes/**/*.tsx",
    ],
    format: "esm",
    dts: true,
});
