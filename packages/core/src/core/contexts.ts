/**
 * Abstract provide / consume port for the resolver and widget registry.
 *
 * Each framework adapter implements {@link ContextPort} against its
 * native provide / consume primitive:
 *
 * - React — `createContext` / `useContext` / `<Context.Provider>`
 * - Vue — `provide()` / `inject()`
 * - Solid — `createContext` / `useContext` (Solid's reactive variant)
 * - Svelte — `setContext()` / `getContext()`
 * - Lit — `@provide()` / `@consume()` decorators from `@lit/context`
 *
 * The port keeps the dispatcher and theme-adapter surface decoupled
 * from any particular framework's context implementation. Consumers
 * downstream — the React `SchemaProvider`, the React `SchemaComponent`,
 * the OpenAPI components — request the resolver / widget registry
 * through the port, and the adapter wires it to its native machinery.
 *
 * The React adapter's existing `UserResolverContext` and
 * `WidgetsContext` (declared via `createContext()` in
 * `react/SchemaComponent.tsx`) already satisfy this shape — the
 * provide step is `<Context.Provider value={value}>{children}` and
 * the consume step is `useContext(Context)`. No refactor of the
 * React adapter's context implementation is required as part of
 * introducing this port; future framework adapters declare their own
 * `ContextPort<ResolverContextShape>` and
 * `ContextPort<WidgetsContextShape>` against their own primitives.
 *
 * @group Framework Adapters
 */

import type { ComponentResolver, WidgetMap } from "./renderer.ts";

/**
 * Abstract provide / consume port that framework adapters implement
 * against their native context primitive. The {@link provide} step
 * wraps its `children` in the framework's provider machinery so any
 * descendant calling {@link consume} receives the supplied value;
 * {@link consume} is called from inside a child renderer to read the
 * current value.
 *
 * The return type of `provide` and the argument type of `consume` are
 * deliberately `unknown` so the port works for both React-style
 * "wrap children in a provider component" implementations and
 * Svelte-style "set on the current component instance" implementations
 * without forcing one shape on the other.
 *
 * @typeParam T - The value carried by the context.
 */
export interface ContextPort<T> {
    /**
     * Provide `value` to every descendant of `children`. The exact
     * shape of `children` is framework-specific — `ReactNode` for
     * React, the slot's render function for Svelte, the `setup`
     * return value for Vue. The implementation simply makes the
     * supplied value available to subsequent {@link consume} calls
     * within that scope.
     */
    provide(value: T, children: unknown): unknown;

    /**
     * Read the currently provided value. The exact host primitive is
     * framework-specific — `useContext(ctx)` in React, `inject(key)`
     * in Vue, `getContext(key)` in Svelte. When no provider is
     * mounted in scope, adapter implementations may return their
     * canonical "default" value or `undefined` — the choice is
     * adapter-defined.
     */
    consume(): T;
}

/**
 * Shape carried by the resolver context. Adapters expose this through
 * a `ContextPort<ResolverContextShape>` so the dispatcher can read
 * the active theme adapter without taking a direct dependency on the
 * host framework's context system.
 *
 * Mirrors the value carried by the React adapter's
 * `UserResolverContext` (defined in `react/SchemaComponent.tsx`) —
 * an optional {@link ComponentResolver}. The `undefined` branch
 * signals "no theme provider mounted; fall through to the headless
 * resolver".
 *
 * @group Framework Adapters
 */
export type ResolverContextShape = ComponentResolver | undefined;

/**
 * Shape carried by the widgets context. Adapters expose this through
 * a `ContextPort<WidgetsContextShape>` so the dispatcher can read
 * the active widget map without binding to the host framework's
 * context system.
 *
 * Mirrors the value carried by the React adapter's `WidgetsContext`
 * (defined in `react/SchemaComponent.tsx`) — an optional
 * {@link WidgetMap}. The `undefined` branch signals "no scoped widgets
 * for this subtree; fall through to per-instance widgets, then the
 * global registry, then the resolver".
 *
 * @group Framework Adapters
 */
export type WidgetsContextShape = WidgetMap | undefined;
