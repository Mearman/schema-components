/**
 * Widget registry for the Lit adapter.
 *
 * Where the React adapter's widget registry stores function values
 * (`(props: RenderProps) => unknown`), the Lit adapter stores Custom
 * Element tag names — because every renderer override on the Web
 * Components side IS a Custom Element. A schema field carrying
 * `.meta({ component: "color-picker" })` is rendered by looking up
 * the tag name registered against `"color-picker"` and emitting an
 * instance of that element with the per-field props attached.
 *
 * Two scopes are supported:
 *
 * 1. **Global** — `registerLitWidget(name, tag)` writes to a module-level
 *    map shared by every `<schema-component>` in the document. Matches
 *    the React `registerWidget()` global default behaviour.
 * 2. **Instance** — the `widgets` property on `<schema-component>` (a
 *    `LitWidgetMap` from `lit/contexts.ts`) overrides the global map
 *    for the wrapped subtree.
 *
 * Resolution order: instance widgets → global widgets → resolver →
 * default Custom Element registry. The same order the React adapter
 * implements; the only difference is the per-step lookup returns a
 * tag name rather than a function value.
 *
 * @packageDocumentation
 */

/**
 * Global widget registry — `widget-name` → custom element tag name.
 *
 * Internal; consumers register via {@link registerLitWidget} and read
 * via {@link resolveLitWidget} so the map shape can evolve without
 * breaking callers.
 */
const globalLitWidgets = new Map<string, string>();

/**
 * Register a widget globally. The widget is resolved when a schema
 * field has `.meta({ component: name })` and the rendered element is
 * an instance of the matching Custom Element tag.
 *
 * `tag` must be a valid Custom Element name (containing a hyphen) and
 * SHOULD be registered via `customElements.define` before any
 * `<schema-component>` in the document instantiates the corresponding
 * field — otherwise the browser emits an unupgraded element and the
 * registered handler never runs.
 *
 * @example
 * ```ts
 * import { registerLitWidget } from "schema-components/lit/widget";
 * import "./my-color-picker.ts";   // calls customElements.define("my-color-picker", ...)
 *
 * registerLitWidget("color-picker", "my-color-picker");
 * ```
 *
 * @param name - Widget hint name (matches `.meta({ component })`).
 * @param tag - Custom Element tag name (e.g. `my-color-picker`).
 */
export function registerLitWidget(name: string, tag: string): void {
    globalLitWidgets.set(name, tag);
}

/**
 * Resolve a widget hint to a Custom Element tag name, considering
 * instance widgets first and falling back to the global registry.
 *
 * @param name - Widget hint name from `.meta({ component })`.
 * @param instanceWidgets - Optional instance-scoped overrides.
 * @returns The Custom Element tag, or `undefined` when no widget is
 *   registered under `name` at either scope.
 */
export function resolveLitWidget(
    name: string,
    instanceWidgets?: ReadonlyMap<string, string>
): string | undefined {
    const instance = instanceWidgets?.get(name);
    if (instance !== undefined) return instance;
    return globalLitWidgets.get(name);
}

/**
 * Clear every globally registered widget. Intended for test isolation
 * — `registerLitWidget` writes to module-level state, and that state
 * leaks across test cases without an explicit reset.
 *
 * @internal
 */
export function __clearGlobalLitWidgets(): void {
    globalLitWidgets.clear();
}
