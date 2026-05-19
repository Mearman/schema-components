/**
 * Global widget registry for the Svelte adapter.
 *
 * Mirrors the React adapter's `registerWidget()` / `globalWidgets`
 * pair in `react/SchemaComponent.tsx`. Each registered entry is a
 * Svelte component constructor (`Component<SvelteRenderProps>`)
 * matched against `.meta({ component })` hints on a walked field.
 *
 * Resolution order (from {@link "./SchemaComponent.svelte" |
 * SchemaComponent}'s dispatch wiring): instance widgets → context
 * widgets → global widgets → resolver render fn → headless fallback.
 *
 * The global registry is module-level mutable state; tests should
 * clear it with {@link __clearGlobalWidgets} to avoid leaking
 * registrations across cases.
 *
 * @group Framework Adapters
 */

import type { SvelteRenderFunction } from "./types.ts";

const globalWidgets = new Map<string, SvelteRenderFunction>();

/**
 * Register a Svelte widget globally. The widget is resolved when a
 * schema field has `.meta({ component: name })` and no per-instance
 * or context-scoped widget map provides a matching entry.
 *
 * For scoped registration, supply the `widgets` prop on
 * `<SchemaComponent>` or `<SchemaProvider>` instead.
 */
export function registerWidget(
    name: string,
    component: SvelteRenderFunction
): void {
    globalWidgets.set(name, component);
}

/**
 * Look up a globally registered Svelte widget by hint name. Returns
 * `undefined` when nothing matches — callers fall back to the
 * resolver chain.
 *
 * @internal Used by the Svelte dispatcher wiring inside
 *   `SchemaComponent.svelte`; not part of the public surface.
 */
export function lookupGlobalWidget(
    name: string
): SvelteRenderFunction | undefined {
    return globalWidgets.get(name);
}

/**
 * Clear every globally registered Svelte widget. Intended for test
 * isolation — `registerWidget` writes to module-level state and that
 * state otherwise leaks across test cases.
 *
 * @internal
 */
export function __clearGlobalWidgets(): void {
    globalWidgets.clear();
}
