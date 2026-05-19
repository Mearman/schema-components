<!--
    Test harness wrapping `<SchemaErrorBoundary>` around the
    `ThrowingChild` fixture. The `failed` snippet renders the caught
    error's message inside a `<p data-testid="boundary-fallback">`
    so the test can locate it without depending on whitespace.
-->
<script lang="ts">
    import SchemaErrorBoundary from "../../../src/svelte/SchemaErrorBoundary.svelte";
    import ThrowingChild from "./ThrowingChild.svelte";

    interface Props {
        throwMessage?: string;
    }

    const { throwMessage }: Props = $props();
</script>

<SchemaErrorBoundary>
    {#snippet children()}
        <ThrowingChild message={throwMessage} />
    {/snippet}
    {#snippet fallback(error: Error, reset: () => void)}
        <p data-testid="boundary-fallback">{error.message}</p>
        <button type="button" onclick={reset}>Reset</button>
    {/snippet}
</SchemaErrorBoundary>
