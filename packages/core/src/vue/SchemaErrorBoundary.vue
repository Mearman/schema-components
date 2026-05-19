<script setup lang="ts">
/**
 * `<SchemaErrorBoundary>` — Vue counterpart of the React
 * `SchemaErrorBoundary`.
 *
 * Uses Vue 3's `onErrorCaptured` lifecycle hook
 * (https://vuejs.org/api/composition-api-lifecycle.html#onerrorcaptured)
 * to catch render-time errors thrown by any descendant — including
 * the dispatcher-wrapped `SchemaRenderError` from theme adapters that
 * throw inside their render function. Returning `false` from
 * `onErrorCaptured` halts further propagation up the component tree.
 *
 * The fallback slot is invoked with the captured error and a `reset`
 * callback. Calling `reset()` clears the captured error so the
 * children re-render (e.g. after fixing a bad schema prop).
 *
 * Like the React boundary, this captures render-time and lifecycle
 * errors but NOT errors thrown from event handlers (Vue routes those
 * through a separate `errorHandler` on the app instance) or async
 * code that escapes the component tree.
 *
 * @group Components
 */
import { onErrorCaptured, ref } from "vue";

const captured = ref<Error | undefined>(undefined);

defineSlots<{
    /**
     * Default slot — rendered when no error has been captured.
     */
    default(): unknown;
    /**
     * Fallback slot — invoked with the captured error and a `reset`
     * callback. Use it to render an error UI; call `reset` to clear
     * the captured state and let the children re-render.
     */
    fallback(props: { error: Error; reset: () => void }): unknown;
}>();

onErrorCaptured((err) => {
    captured.value =
        err instanceof Error ? err : new Error("Unknown render error");
    return false;
});

function reset(): void {
    captured.value = undefined;
}
</script>

<template>
    <slot
        v-if="captured !== undefined"
        name="fallback"
        :error="captured"
        :reset="reset"
    />
    <slot v-else />
</template>
