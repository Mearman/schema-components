<!--
    Headless Svelte 5 renderer for `NumberField` — plain
    `<input type="number">` mirror of
    `react/headlessRenderers.tsx :: renderNumber`.

    Drives `inputmode` from the walked field's `isInteger` flag
    (`numeric` for integers, `decimal` otherwise) and the step
    attribute from `multipleOf` — falling back to `step="1"` for
    integer schemas without `multipleOf`, omitted otherwise so the
    browser default applies.

    Read-only mode emits the value through `toLocaleString()` so
    locale-aware thousands separators / decimal marks match the
    React equivalent.
-->
<script lang="ts">
    import type { SvelteRenderProps } from "../types.ts";
    import { fieldDomId } from "../../core/idPath.ts";
    import { EM_DASH } from "../../core/cssClasses.ts";
    import { buildAriaAttrs, buildHintInfo } from "../a11y.ts";

    const props = $props<SvelteRenderProps>();

    const id = $derived(fieldDomId(props.path));
</script>

{#if props.readOnly}
    {#if typeof props.value !== "number"}
        <span {id}>{EM_DASH}</span>
    {:else}
        <span {id}>{props.value.toLocaleString()}</span>
    {/if}
{:else}
    {@const numValue = typeof props.value === "number" ? props.value : ""}
    {@const ariaAttrs = buildAriaAttrs(props.tree)}
    {@const hintInfo = buildHintInfo(id, props.constraints)}
    {@const isInteger =
        props.tree.type === "number" ? props.tree.isInteger : false}
    {@const inputMode = isInteger ? "numeric" : "decimal"}
    {@const multipleOf = props.constraints.multipleOf}
    {@const step =
        multipleOf !== undefined
            ? String(multipleOf)
            : isInteger
              ? "1"
              : undefined}

    <input
        {id}
        type="number"
        inputmode={inputMode}
        {step}
        value={props.writeOnly ? "" : numValue}
        onchange={(e) => {
            const target = e.currentTarget;
            if (target instanceof HTMLInputElement) {
                props.onChange(Number(target.value));
            }
        }}
        min={props.constraints.minimum}
        max={props.constraints.maximum}
        aria-describedby={hintInfo?.ariaDescribedBy}
        {...ariaAttrs}
    />
    {#if hintInfo !== undefined}
        <small id={hintInfo.id} class="sc-hint">{hintInfo.hint}</small>
    {/if}
{/if}
