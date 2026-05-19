/**
 * Ambient module declaration for `.svelte` imports inside the
 * Svelte adapter source tree.
 *
 * TypeScript does not natively understand `.svelte` files — the
 * `@sveltejs/vite-plugin-svelte` toolchain compiles them at build /
 * test time. This declaration tells TypeScript that any `.svelte`
 * import resolves to a default-exported
 * `Component<SvelteRenderProps>` constructor (or a
 * `Record<string, unknown>`-keyed superset for renderer-internal
 * components like `Mount.svelte` that accept their own shape).
 *
 * The declaration is intentionally broad — every `.svelte` module
 * is treated as a `Component<Record<string, unknown>>` constructor.
 * The Svelte 5 `Component<Props>` type is contravariant in `Props`,
 * so the broad declaration is assignable to any specific
 * `Component<…>` slot at the consumer site without casts.
 */

declare module "*.svelte" {
    import type { Component } from "svelte";

    const component: Component<Record<string, unknown>>;
    export default component;
}
