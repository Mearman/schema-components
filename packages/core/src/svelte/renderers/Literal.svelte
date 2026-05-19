<!--
    Headless Svelte 5 renderer for literal fields — `z.literal("a")` or
    `{ const: 5 }`. Mirror of
    `react/headlessRenderers.tsx :: renderLiteral`.

    Literals are non-editable by nature (the value is fixed at the
    schema level), so both read-only and editable modes display the
    declared value(s). Multiple literals (`z.literal(["a", "b"])`)
    render comma-separated through `displayJsonValue`.
-->
<script lang="ts">
    import type { SvelteRenderProps } from "../types.ts";
    import { fieldDomId } from "../../core/idPath.ts";
    import { EM_DASH } from "../../core/cssClasses.ts";
    import { displayJsonValue } from "../../core/walkBuilders.ts";

    const props = $props<SvelteRenderProps>();

    const id = $derived(fieldDomId(props.path));
    const literalValues = $derived(
        props.tree.type === "literal" ? props.tree.literalValues : []
    );
</script>

{#if props.tree.type !== "literal" || literalValues.length === 0}
    <span {id}>{EM_DASH}</span>
{:else}
    <span {id}>{literalValues.map((v) => displayJsonValue(v)).join(", ")}</span>
{/if}
