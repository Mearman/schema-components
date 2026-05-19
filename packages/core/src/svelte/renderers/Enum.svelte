<!--
    Headless Svelte 5 renderer for `EnumField` — plain `<select>`
    mirror of `react/headlessRenderers.tsx :: renderEnum`. Lists
    every enumerated value through `displayJsonValue` and wires the
    constraint hint via `aria-describedby` when present.

    Read-only mode emits the current value through a `<span>`, falling
    back to an em-dash for empty / undefined values.
-->
<script lang="ts">
    import type { SvelteRenderProps } from "../types.ts";
    import { fieldDomId } from "../../core/idPath.ts";
    import { EM_DASH, ELLIPSIS } from "../../core/cssClasses.ts";
    import { displayJsonValue } from "../../core/walkBuilders.ts";
    import { buildAriaAttrs, buildHintInfo } from "../a11y.ts";

    const props = $props<SvelteRenderProps>();

    const id = $derived(fieldDomId(props.path));
    const enumValue = $derived(
        typeof props.value === "string" ? props.value : ""
    );
</script>

{#if props.readOnly}
    <span {id}>{enumValue.length > 0 ? enumValue : EM_DASH}</span>
{:else}
    {@const ariaAttrs = buildAriaAttrs(props.tree)}
    {@const hintInfo = buildHintInfo(id, props.constraints)}
    {@const enumValues =
        props.tree.type === "enum" ? props.tree.enumValues : []}

    <select
        {id}
        value={props.writeOnly ? "" : enumValue}
        onchange={(e) => {
            const target = e.currentTarget;
            if (target instanceof HTMLSelectElement) {
                props.onChange(target.value);
            }
        }}
        aria-describedby={hintInfo?.ariaDescribedBy}
        {...ariaAttrs}
    >
        <option value="">Select{ELLIPSIS}</option>
        {#each enumValues as v (displayJsonValue(v))}
            <option value={displayJsonValue(v)}>{displayJsonValue(v)}</option>
        {/each}
    </select>
    {#if hintInfo !== undefined}
        <small id={hintInfo.id} class="sc-hint">{hintInfo.hint}</small>
    {/if}
{/if}
