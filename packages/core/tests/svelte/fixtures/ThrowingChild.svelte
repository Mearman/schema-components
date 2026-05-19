<script lang="ts">
    /**
     * Test fixture component that throws synchronously during render.
     * Exercises the `<SchemaErrorBoundary>` catch path.
     *
     * The throw lives inside a `$derived` so Svelte treats the
     * computation as reactive — this avoids the
     * `state_referenced_locally` warning that fires when a `$props()`
     * field is read directly inside top-level script code.
     */
    interface Props {
        message?: string;
    }

    const { message = "intentional render error" }: Props = $props();

    const _trigger = $derived.by((): never => {
        throw new Error(message);
    });

    // Reference `_trigger` so the `$derived` is actually evaluated
    // when the component renders.
    $effect(() => {
        // Touching the derived forces evaluation; the throw above
        // surfaces into the parent `<svelte:boundary>`.
        void _trigger;
    });
</script>
