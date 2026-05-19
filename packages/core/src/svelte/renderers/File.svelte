<!--
    Headless Svelte 5 renderer for `FileField` — plain
    `<input type="file">`. Mirror of
    `react/headlessRenderers.tsx :: renderFile`.

    Wires the first MIME type / array of MIME types from the
    constraint bag into the `accept` attribute. Read-only mode emits
    a placeholder span — file inputs cannot meaningfully be rendered
    read-only.
-->
<script lang="ts">
    import type { SvelteRenderProps } from "../types.ts";
    import { fieldDomId } from "../../core/idPath.ts";
    import { buildAriaAttrs, buildHintInfo } from "../a11y.ts";

    const props = $props<SvelteRenderProps>();

    const id = $derived(fieldDomId(props.path));
    const accept = $derived(props.constraints.mimeTypes?.join(","));
</script>

{#if props.readOnly}
    <span {id}>{"File field"}</span>
{:else}
    {@const ariaAttrs = buildAriaAttrs(props.tree, props.meta.description)}
    {@const hintInfo = buildHintInfo(id, props.constraints)}
    <input
        {id}
        type="file"
        {accept}
        onchange={(e) => {
            const target = e.currentTarget;
            if (target instanceof HTMLInputElement) {
                const file = target.files?.[0];
                if (file !== undefined) {
                    props.onChange(file);
                }
            }
        }}
        aria-describedby={hintInfo?.ariaDescribedBy}
        {...ariaAttrs}
    />
    {#if hintInfo !== undefined}
        <small id={hintInfo.id} class="sc-hint">{hintInfo.hint}</small>
    {/if}
{/if}
