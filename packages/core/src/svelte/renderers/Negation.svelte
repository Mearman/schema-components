<!--
    Headless Svelte 5 renderer for negation fields — JSON Schema
    `{ not: { ... } }`. Mirror of
    `react/headlessRenderers.tsx :: renderNegation`.

    Negation describes a constraint ("value must NOT match this
    schema") rather than a value shape. The renderer surfaces the
    negated schema beneath an explanatory preamble inside a
    `<fieldset>`.
-->
<script lang="ts">
    import type { SvelteRenderProps } from "../types.ts";
    import { SC_CLASSES } from "../../core/cssClasses.ts";
    import Mount from "./Mount.svelte";

    const props = $props<SvelteRenderProps>();

    const negated = $derived(
        props.tree.type === "negation" ? props.tree.negated : undefined
    );
    const child = $derived(
        negated !== undefined
            ? props.renderChild(negated, props.value, props.onChange)
            : null
    );
</script>

{#if negated !== undefined}
    <fieldset class={SC_CLASSES.negation}>
        <strong>Must NOT match:</strong>
        {#if child !== null}
            <Mount descriptor={child} />
        {/if}
    </fieldset>
{/if}
