<script setup lang="ts">
/**
 * `<SchemaProvider>` — provide a theme resolver and scoped widgets to
 * every `<SchemaComponent>` and `<SchemaView>` rendered inside the
 * subtree.
 *
 * Vue counterpart of the React adapter's `SchemaProvider`. Uses the
 * abstract `ContextPort` from `core/contexts.ts` (instantiated as
 * `VueResolverContext` / `VueWidgetsContext` via Vue's `provide` /
 * `inject`) so the dispatcher remains decoupled from Vue specifics —
 * the only Vue-specific code is the `provide()` call here and the
 * matching `inject()` calls inside the consumer SFCs.
 *
 * @group Components
 */
import { VueResolverContext, VueWidgetsContext } from "./contexts.ts";
import type { VueComponentResolver, VueWidgetMap } from "./types.ts";

const props = defineProps<{
    /** The theme adapter that drives every nested `<SchemaComponent>`. */
    resolver: VueComponentResolver;
    /** Scoped widgets available to descendants. */
    widgets?: VueWidgetMap;
}>();

// Provide both contexts before children render. `VueResolverContext.provide`
// wraps Vue's `provide()` so the call site does not depend directly on
// Vue's primitive — the abstraction lives in `core/contexts.ts`.
// `null` is passed as `children` because Vue's provide model attaches
// values to the component instance rather than wrapping a children
// subtree; the port signature keeps the argument for React-adapter
// compatibility.
VueResolverContext.provide(props.resolver, null);
VueWidgetsContext.provide(props.widgets, null);
</script>

<template>
    <slot />
</template>
