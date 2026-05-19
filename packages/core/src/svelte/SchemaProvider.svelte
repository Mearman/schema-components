<!--
    Provide a theme resolver and scoped widgets to every
    `<SchemaComponent>` and `<SchemaView>` rendered inside the
    subtree. Mirror of `react/SchemaComponent.tsx :: SchemaProvider`
    for Svelte 5.

    Sets the resolver and widget map via `setContext()`
    (`./contexts.ts :: resolverContext`, `widgetsContext`) so any
    descendant calling `resolverContext.consume()` or
    `widgetsContext.consume()` receives the supplied values.
    `<SchemaComponent>` calls those consume hooks on mount and will
    therefore pick up the provided theme automatically.
-->
<script lang="ts">
    import type { Snippet } from "svelte";
    import { resolverContext, widgetsContext } from "./contexts.ts";
    import type { SvelteComponentResolver, SvelteWidgetMap } from "./types.ts";

    interface Props {
        /** Theme resolver to install for the subtree. */
        resolver: SvelteComponentResolver;
        /** Scoped widgets — override per-instance and global widgets. */
        widgets?: SvelteWidgetMap;
        children: Snippet;
    }

    const { resolver, widgets, children }: Props = $props();

    // Svelte's `setContext` is one-shot per component mount; the
    // provide port returns its `children` argument so the call site
    // gets a familiar value-returning shape, but the actual context
    // wiring happens as a side effect. Reactive updates to
    // `resolver` / `widgets` after mount intentionally do not
    // propagate — matches the React adapter's
    // `<UserResolverContext.Provider value={resolver}>` semantics
    // where re-rendering the provider with a new value would update
    // consumers; here we contract the value as mount-fixed and
    // recommend re-mounting the subtree when the theme changes.

    /* svelte-ignore state_referenced_locally */
    resolverContext.provide(resolver, undefined);
    /* svelte-ignore state_referenced_locally */
    widgetsContext.provide(widgets, undefined);
</script>

{@render children()}
