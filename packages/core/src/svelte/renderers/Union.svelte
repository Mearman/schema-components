<!--
    Headless Svelte 5 renderer for plain `UnionField` — picks the
    matching option from the union's `options` list and renders it.
    Mirror of `react/headlessRenderers.tsx :: renderUnion`.

    Falls back to the first option when no structural match is found,
    matching React's behaviour. Empty unions render an em-dash for
    nullish values or `JSON.stringify(value)` otherwise.
-->
<script lang="ts">
    import type { SvelteRenderProps } from "../types.ts";
    import { EM_DASH } from "../../core/cssClasses.ts";
    import { matchUnionOption } from "../../core/unionMatch.ts";
    import Mount from "./Mount.svelte";

    const props = $props<SvelteRenderProps>();

    const options = $derived(
        props.tree.type === "union" ||
            props.tree.type === "discriminatedUnion"
            ? props.tree.options
            : undefined
    );
</script>

{#if options === undefined || options.length === 0}
    {#if props.value === undefined || props.value === null}
        <span>{EM_DASH}</span>
    {:else}
        <span>{JSON.stringify(props.value)}</span>
    {/if}
{:else}
    {@const matched = matchUnionOption(options, props.value)}
    {@const chosen = matched ?? options[0]}
    {#if chosen !== undefined}
        {@const child = props.renderChild(
            chosen,
            props.value,
            props.onChange
        )}
        {#if child !== null}
            <Mount descriptor={child} />
        {:else}
            <span>{EM_DASH}</span>
        {/if}
    {:else}
        <span>{EM_DASH}</span>
    {/if}
{/if}
