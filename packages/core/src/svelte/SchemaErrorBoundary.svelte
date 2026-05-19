<!--
    Svelte 5 error boundary for schema-components.

    Uses Svelte 5's native `<svelte:boundary>` primitive (introduced
    in Svelte 5) — the structural equivalent of the React class
    component `componentDidCatch` / `getDerivedStateFromError`
    pattern from `react/SchemaErrorBoundary.tsx`.

    Catches synchronous render errors thrown by descendant
    components (including `<SchemaComponent>` / `<SchemaView>` and
    any custom theme adapter renderers). The boundary surfaces the
    caught `Error` to the supplied `fallback` snippet alongside a
    `reset` callback that clears the error state — Svelte's boundary
    primitive owns the state internally; the snippet just receives
    whichever helpers Svelte passes to it.

    Mirrors the React boundary's documentation: this primitive does
    NOT catch errors thrown from event handlers, async work, or
    server-side rendering. Those must be handled at the host
    application boundary.
-->
<script lang="ts">
    import type { Snippet } from "svelte";
    import { SchemaError } from "../core/errors.ts";

    interface Props {
        /** Rendered while no error is in flight. */
        children: Snippet;
        /**
         * Rendered when the boundary catches an error. Receives the
         * thrown `Error` and a `reset` thunk that re-renders the
         * children once the underlying problem is fixed (e.g. a
         * corrected `schema` prop).
         */
        fallback: Snippet<[Error, () => void]>;
    }

    const { children, fallback }: Props = $props();

    function logIfUnexpected(error: unknown): void {
        // Non-SchemaError thrown values are forwarded to the
        // console so the application has at least one signal in the
        // logs. SchemaError instances are presumed handled by the
        // `onError` callback on `<SchemaComponent>` / `<SchemaView>`.
        if (!(error instanceof SchemaError)) {
            // Diagnostic surface mirroring the React adapter — the
            // boundary's contract is "log the unexpected, surface
            // structured errors through `failed`".
            console.error("[schema-components] Unhandled render error:", error);
        }
    }
</script>

<svelte:boundary
    onerror={(error) => {
        logIfUnexpected(error);
    }}
>
    {@render children()}
    {#snippet failed(error, reset)}
        {@render fallback(
            error instanceof Error ? error : new Error(String(error)),
            reset
        )}
    {/snippet}
</svelte:boundary>
