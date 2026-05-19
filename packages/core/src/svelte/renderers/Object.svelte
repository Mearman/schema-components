<!--
    Headless Svelte 5 renderer for `ObjectField` — `<fieldset>` per
    object with one labelled child per property. Mirrors
    `react/headlessRenderers.tsx :: renderObject`.

    Each property is rendered by calling `props.renderChild(field,
    childValue, childOnChange, key)` and mounting the returned
    descriptor via `<Mount descriptor={…} />` (the shared utility
    component in this directory).
    The label text falls back to the structural key when no
    `meta.description` is supplied — every input gets an accessible
    name even on an undecorated `z.object({...})`.
-->
<script lang="ts">
    import type { SvelteRenderProps } from "../types.ts";
    import { fieldDomId } from "../../core/idPath.ts";
    import { sortFieldsByOrder } from "../../core/fieldOrder.ts";
    import { isObject } from "../../core/guards.ts";
    import Mount from "./Mount.svelte";

    const props = $props<SvelteRenderProps>();

    /**
     * Narrow once at the top — the dispatcher only calls this renderer
     * when `tree.type === "object"`. The check is defensive against
     * misconfigured custom resolvers wiring this component into the
     * wrong slot.
     */
    const fields = $derived(
        props.tree.type === "object" ? props.tree.fields : {}
    );

    const obj = $derived<Record<string, unknown>>(
        isObject(props.value) ? props.value : {}
    );

    const sortedEntries = $derived(sortFieldsByOrder(fields));
</script>

<fieldset>
    {#if typeof props.meta.description === "string"}
        <legend>{props.meta.description}</legend>
    {/if}
    {#each sortedEntries.filter(([, field]) => field.meta.visible !== false) as [key, field] (key)}
        {@const childValue = obj[key]}
        {@const childId = fieldDomId(`${props.path}.${key}`)}
        {@const labelText =
            typeof field.meta.description === "string"
                ? field.meta.description
                : key}
        {@const childOnChange = (v: unknown) => {
            const updated: Record<string, unknown> = {};
            for (const [k, val] of Object.entries(obj)) {
                updated[k] = val;
            }
            updated[key] = v;
            props.onChange(updated);
        }}
        {@const child = props.renderChild(field, childValue, childOnChange, key)}
        {#if child !== null}
            <div>
                <label for={childId}>
                    {labelText}
                    {#if field.isOptional === false}
                        <span aria-hidden="true" style="color: #dc2626"
                            >{" *"}</span
                        >
                    {/if}
                </label>
                <Mount descriptor={child} />
            </div>
        {/if}
    {/each}
</fieldset>
