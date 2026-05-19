<!--
    Headless Svelte 5 renderer for tuple fields — positional
    rendering of `prefixItems` followed by any `restItems`. Mirror of
    `react/headlessRenderers.tsx :: renderTuple`.

    Each prefix entry is rendered at its index with structural suffix
    `[i]`. Rest items beyond `prefixItems.length` are rendered when a
    `restItems` schema is present and the value array is longer than
    the prefix.

    Renders nothing when the tuple has no prefix items, no rest
    schema, and no values — keeps empty positions from emitting
    pointless wrappers.
-->
<script lang="ts">
    import type { SvelteRenderProps } from "../types.ts";
    import { ariaLabel } from "../a11y.ts";
    import Mount from "./Mount.svelte";

    const props = $props<SvelteRenderProps>();

    const prefixItems = $derived(
        props.tree.type === "tuple" ? props.tree.prefixItems : []
    );
    const restItems = $derived(
        props.tree.type === "tuple" ? props.tree.restItems : undefined
    );
    const arr = $derived<unknown[]>(
        Array.isArray(props.value) ? props.value : []
    );
    const restCount = $derived(
        restItems !== undefined
            ? Math.max(arr.length - prefixItems.length, 0)
            : 0
    );
    const shouldRender = $derived(
        prefixItems.length > 0 || restItems !== undefined || arr.length > 0
    );
</script>

{#if props.tree.type === "tuple" && shouldRender}
    <div role="group" aria-label={ariaLabel(props.meta.description)}>
        {#each prefixItems as element, i (i)}
            {@const itemValue = arr[i]}
            {@const childOnChange = (v: unknown) => {
                const next = arr.slice();
                next[i] = v;
                props.onChange(next);
            }}
            {@const child = props.renderChild(
                element,
                itemValue,
                childOnChange,
                `[${String(i)}]`
            )}
            <div>
                {#if child !== null}
                    <Mount descriptor={child} />
                {/if}
            </div>
        {/each}
        {#if restItems !== undefined}
            {#each Array.from({ length: restCount }, (_, j) => prefixItems.length + j) as i (i)}
                {@const itemValue = arr[i]}
                {@const childOnChange = (v: unknown) => {
                    const next = arr.slice();
                    next[i] = v;
                    props.onChange(next);
                }}
                {@const child = props.renderChild(
                    restItems,
                    itemValue,
                    childOnChange,
                    `[${String(i)}]`
                )}
                <div>
                    {#if child !== null}
                        <Mount descriptor={child} />
                    {/if}
                </div>
            {/each}
        {/if}
    </div>
{/if}
