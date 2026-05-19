<!--
    Headless Svelte 5 renderer for conditional fields — JSON Schema
    `if` / `then` / `else`. Mirror of
    `react/headlessRenderers.tsx :: renderConditional`.

    Conditional schemas describe constraints rather than a single
    value shape, so the renderer surfaces each clause as a labelled
    section inside a `<fieldset>`. Mirrors the HTML renderer's
    annotation approach and gives a predictable structure for theme
    adapters that want to override it.
-->
<script lang="ts">
    import type { SvelteRenderProps } from "../types.ts";
    import { SC_CLASSES } from "../../core/cssClasses.ts";
    import Mount from "./Mount.svelte";

    const props = $props<SvelteRenderProps>();

    const ifClause = $derived(
        props.tree.type === "conditional" ? props.tree.ifClause : undefined
    );
    const thenClause = $derived(
        props.tree.type === "conditional" ? props.tree.thenClause : undefined
    );
    const elseClause = $derived(
        props.tree.type === "conditional" ? props.tree.elseClause : undefined
    );

    const ifChild = $derived(
        ifClause !== undefined
            ? props.renderChild(ifClause, props.value, props.onChange)
            : null
    );
    const thenChild = $derived(
        thenClause !== undefined
            ? props.renderChild(thenClause, props.value, props.onChange)
            : null
    );
    const elseChild = $derived(
        elseClause !== undefined
            ? props.renderChild(elseClause, props.value, props.onChange)
            : null
    );
</script>

{#if ifClause !== undefined}
    <fieldset class={SC_CLASSES.conditional}>
        <div class={SC_CLASSES.conditionalIf}>
            <strong>if:</strong>
            {#if ifChild !== null}
                <Mount descriptor={ifChild} />
            {/if}
        </div>
        {#if thenClause !== undefined && thenChild !== null}
            <div class={SC_CLASSES.conditionalThen}>
                <strong>then:</strong>
                <Mount descriptor={thenChild} />
            </div>
        {/if}
        {#if elseClause !== undefined && elseChild !== null}
            <div class={SC_CLASSES.conditionalElse}>
                <strong>else:</strong>
                <Mount descriptor={elseChild} />
            </div>
        {/if}
    </fieldset>
{/if}
