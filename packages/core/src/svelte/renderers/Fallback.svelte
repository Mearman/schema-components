<!--
    Fallback Svelte renderer emitted by the dispatcher when no widget
    or resolver render function produced output. Mirror of the React
    fallback `<span>—</span>` / `<span>{JSON.stringify(value)}</span>`
    in `react/SchemaComponent.tsx :: renderField`.

    Renders an em-dash for undefined / null values and a stringified
    JSON projection otherwise so unhandled positions remain visible
    without a runtime crash.
-->
<script lang="ts">
    import type { SvelteRenderProps } from "../types.ts";
    import { EM_DASH } from "../../core/cssClasses.ts";

    const props = $props<SvelteRenderProps>();
</script>

{#if props.value === undefined || props.value === null}
    <span>{EM_DASH}</span>
{:else if typeof props.value === "string"}
    <span>{props.value}</span>
{:else}
    <span>{JSON.stringify(props.value)}</span>
{/if}
