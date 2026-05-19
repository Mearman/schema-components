/**
 * Vue implementations of the abstract {@link ContextPort} from
 * `core/contexts.ts`.
 *
 * Each adapter implements the provide / consume port against its native
 * context primitive. The Vue 3 implementation uses Vue's `provide` and
 * `inject` (https://vuejs.org/guide/components/provide-inject.html)
 * keyed by a unique {@link InjectionKey} {@link Symbol} per context so
 * the two contexts never collide.
 *
 * `provide(value, children)` is called from inside a component's
 * `setup()` (typically the `<SchemaProvider>` SFC) — Vue's `provide`
 * works on the current component instance and makes the value available
 * to every descendant calling `inject` with the same key. The `children`
 * argument is therefore unused by the Vue port (no provider component
 * is wrapped around children) but kept for {@link ContextPort}
 * compatibility with React-style ports that DO wrap children. Callers
 * outside a `setup()` (e.g. ad-hoc render functions) should still go
 * through this port so future framework changes flow through one place.
 */

import { inject, provide, type InjectionKey } from "vue";
import type {
    ContextPort,
    ResolverContextShape,
    WidgetsContextShape,
} from "../core/contexts.ts";

// ---------------------------------------------------------------------------
// Injection keys
// ---------------------------------------------------------------------------

/**
 * Vue {@link InjectionKey} for the active {@link ResolverContextShape}.
 *
 * Exported so theme adapters and downstream Vue components can read or
 * provide the resolver directly through Vue's `inject` / `provide` —
 * the {@link VueResolverContext} port wraps these calls but the raw
 * symbol is available for callers that need custom composition (e.g.
 * a Pinia store that wants to read the active resolver in an action).
 */
export const VUE_RESOLVER_KEY: InjectionKey<ResolverContextShape> = Symbol(
    "schema-components.vue.resolver"
);

/**
 * Vue {@link InjectionKey} for the active {@link WidgetsContextShape}.
 *
 * Exported so callers can read or provide the scoped widget map directly
 * through Vue's `inject` / `provide`.
 */
export const VUE_WIDGETS_KEY: InjectionKey<WidgetsContextShape> = Symbol(
    "schema-components.vue.widgets"
);

// ---------------------------------------------------------------------------
// Ports
// ---------------------------------------------------------------------------

/**
 * Vue implementation of {@link ContextPort} for the
 * {@link ResolverContextShape}.
 *
 * `provide(value, _children)` calls Vue's `provide(VUE_RESOLVER_KEY, value)`
 * on the current component instance. The `_children` argument is unused
 * — Vue's provide model attaches the value to the component instance
 * rather than wrapping children in a new component — but kept for
 * {@link ContextPort} compatibility. Returns `undefined` because Vue's
 * `provide` does not produce a renderable wrapper.
 *
 * `consume()` calls `inject(VUE_RESOLVER_KEY, undefined)` and returns
 * the active resolver, or `undefined` when no provider is mounted in
 * scope (matching the React adapter's `undefined`-default behaviour).
 *
 * Must be called from inside a component's `setup()` — Vue's `provide`
 * and `inject` both rely on the current component instance, which is
 * only available during component setup.
 */
export const VueResolverContext: ContextPort<ResolverContextShape> = {
    provide(value: ResolverContextShape, children: unknown): unknown {
        provide(VUE_RESOLVER_KEY, value);
        // `children` is unused — Vue's `provide()` attaches the value
        // to the component instance rather than wrapping a children
        // subtree — but the {@link ContextPort} signature carries it
        // for React-style adapters that DO wrap children. `void`
        // discards the value without triggering the unused-args rule.
        void children;
        return undefined;
    },
    consume(): ResolverContextShape {
        return inject(VUE_RESOLVER_KEY, undefined);
    },
};

/**
 * Vue implementation of {@link ContextPort} for the
 * {@link WidgetsContextShape}. Mirrors {@link VueResolverContext}: a
 * thin wrapper around Vue's `provide` / `inject` keyed by
 * {@link VUE_WIDGETS_KEY}.
 *
 * Must be called from inside a component's `setup()`.
 */
export const VueWidgetsContext: ContextPort<WidgetsContextShape> = {
    provide(value: WidgetsContextShape, children: unknown): unknown {
        provide(VUE_WIDGETS_KEY, value);
        // See the matching `void children` note in
        // {@link VueResolverContext} — Vue's `provide()` does not wrap
        // children, but the port keeps the argument for React-style
        // adapter compatibility.
        void children;
        return undefined;
    },
    consume(): WidgetsContextShape {
        return inject(VUE_WIDGETS_KEY, undefined);
    },
};
