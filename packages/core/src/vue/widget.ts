/**
 * Vue widget registry — custom renderers keyed by `.meta({ component })`
 * hint.
 *
 * Mirrors `react/SchemaComponent.tsx`'s widget surface: a module-level
 * map storing app-wide widget defaults plus a clear hook used by tests
 * to isolate state between cases. Scoped registration (per-instance,
 * per-provider) lives on the corresponding props of the
 * `<SchemaComponent>` / `<SchemaProvider>` SFCs.
 *
 * Resolution order, matching the React adapter: instance → context →
 * global → resolver → headless.
 */

import type { VueRenderFunction } from "./types.ts";

/** Global widget registry — app-wide defaults. */
const globalWidgets = new Map<string, VueRenderFunction>();

/**
 * Register a widget globally. The widget is resolved when a schema field
 * has `.meta({ component: name })`.
 *
 * For scoped registration, use the `widgets` prop on `<SchemaComponent>`
 * or `<SchemaProvider>` instead.
 */
export function registerWidget(name: string, render: VueRenderFunction): void {
    globalWidgets.set(name, render);
}

/**
 * Look up a widget in the global registry. Used by the Vue dispatcher
 * after the per-instance and context maps have been checked.
 */
export function lookupGlobalWidget(
    name: string
): VueRenderFunction | undefined {
    return globalWidgets.get(name);
}

/**
 * Clear every globally registered widget. Intended for test isolation
 * — `registerWidget` writes to module-level state and that state
 * otherwise leaks across test cases, making the test suite
 * order-dependent. Tests should call this from an `afterEach` hook.
 *
 * @internal
 */
export function __clearGlobalWidgets(): void {
    globalWidgets.clear();
}
