<!--
    Headless Svelte 5 renderer for `BooleanField` — plain
    `<input type="checkbox">` mirror of
    `react/headlessRenderers.tsx :: renderBoolean`.

    Read-only mode renders "Yes" / "No" through a `<span>`, falling
    back to an em-dash for non-boolean values. Editable mode applies
    the description as an `aria-label` via `buildAriaAttrs` — there
    is no separate placeholder slot on a checkbox, so the description
    drives the accessible name instead.
-->
<script lang="ts">
    import type { SvelteRenderProps } from "../types.ts";
    import { fieldDomId } from "../../core/idPath.ts";
    import { EM_DASH } from "../../core/cssClasses.ts";
    import { buildAriaAttrs } from "../a11y.ts";

    const props = $props<SvelteRenderProps>();

    const id = $derived(fieldDomId(props.path));
</script>

{#if props.readOnly}
    {#if typeof props.value !== "boolean"}
        <span {id}>{EM_DASH}</span>
    {:else}
        <span {id}>{props.value ? "Yes" : "No"}</span>
    {/if}
{:else}
    {@const ariaAttrs = buildAriaAttrs(props.tree, props.meta.description)}
    <input
        {id}
        type="checkbox"
        checked={props.writeOnly ? false : props.value === true}
        onchange={(e) => {
            const target = e.currentTarget;
            if (target instanceof HTMLInputElement) {
                props.onChange(target.checked);
            }
        }}
        {...ariaAttrs}
    />
{/if}
