/**
 * Solid widget registry.
 *
 * Mirrors the React widget registry — `.meta({ component: <name> })` on a
 * schema field selects a registered renderer by name, taking precedence
 * over the schema-type resolver. Resolution order matches the React
 * adapter:
 *
 *   instance widgets → context widgets → global widgets → resolver → headless
 *
 * The registry is module-scoped state; tests that exercise widget
 * registration must call {@link __clearGlobalSolidWidgets} from a setup
 * hook to avoid order-dependent cross-test pollution. This mirrors the
 * React adapter's `__clearGlobalWidgets` escape hatch.
 */

import type { SolidRenderFunction } from "./types.ts";

/** Global widget registry — app-wide Solid widget defaults. */
const globalSolidWidgets = new Map<string, SolidRenderFunction>();

/**
 * Register a Solid widget globally. The widget is resolved when a schema
 * field has `.meta({ component: <name> })`.
 *
 * For scoped registration prefer the `widgets` prop on
 * `<SchemaComponent>` (instance-level) or `<SchemaProvider>`
 * (context-level).
 */
export function registerSolidWidget(
    name: string,
    render: SolidRenderFunction
): void {
    globalSolidWidgets.set(name, render);
}

/**
 * Look up a globally registered Solid widget by name. Returns
 * `undefined` when nothing is registered for the supplied name.
 */
export function lookupGlobalSolidWidget(
    name: string
): SolidRenderFunction | undefined {
    return globalSolidWidgets.get(name);
}

/**
 * Clear every globally registered Solid widget. Intended for test
 * isolation — `registerSolidWidget` writes to module-level state and
 * that state otherwise leaks across test cases, making the test suite
 * order-dependent. Tests should call this from a `beforeEach` or
 * `afterEach` hook.
 *
 * @internal
 */
export function __clearGlobalSolidWidgets(): void {
    globalSolidWidgets.clear();
}
