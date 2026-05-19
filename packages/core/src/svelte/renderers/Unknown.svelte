<!--
    Headless Svelte 5 renderer for `UnknownField` — JSON-encoded
    fallback for unconstrained values. Mirror of
    `react/headlessRenderers.tsx :: renderUnknown`.

    Read-only mode stringifies non-string values through
    `JSON.stringify` so any JSON-shaped value renders intelligibly.
    Editable mode emits a plain text input so the user can edit at
    least the string projection of the value.
-->
<script lang="ts">
    import type { SvelteRenderProps } from "../types.ts";
    import { fieldDomId } from "../../core/idPath.ts";
    import { EM_DASH } from "../../core/cssClasses.ts";

    const props = $props<SvelteRenderProps>();

    const id = $derived(fieldDomId(props.path));
</script>

{#if props.readOnly}
    {#if props.value === undefined || props.value === null}
        <span {id}>{EM_DASH}</span>
    {:else if typeof props.value === "string"}
        <span {id}>{props.value}</span>
    {:else}
        <span {id}>{JSON.stringify(props.value)}</span>
    {/if}
{:else}
    {@const strValue = typeof props.value === "string" ? props.value : ""}
    <input
        {id}
        type="text"
        value={props.writeOnly ? "" : strValue}
        onchange={(e) => {
            const target = e.currentTarget;
            if (target instanceof HTMLInputElement) {
                props.onChange(target.value);
            }
        }}
    />
{/if}
