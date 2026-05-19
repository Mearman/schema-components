<!--
    Headless Svelte 5 renderer for `ArrayField` — ordered list with
    add / remove controls. Mirror of
    `react/headlessRenderers.tsx :: renderArray`.

    Read-only mode renders the list without controls; an empty array
    produces no list so leaf nodes in recursive schemas don't get
    orphaned "Children" labels.

    Editable mode wraps each item in `<li>` with a Remove button and
    appends an "Add item" button at the foot. `<button type="button">`
    keeps the controls keyboard-accessible (Space / Enter) without
    custom key handlers and stops them accidentally submitting any
    enclosing form.
-->
<script lang="ts">
    import type { SvelteRenderProps } from "../types.ts";
    import { ariaLabel } from "../a11y.ts";
    import { defaultRecordValue } from "../headlessFns.ts";
    import Mount from "./Mount.svelte";

    const props = $props<SvelteRenderProps>();

    const arr = $derived<unknown[]>(
        Array.isArray(props.value) ? props.value : []
    );

    const element = $derived(
        props.tree.type === "array" ? props.tree.element : undefined
    );
</script>

{#if props.tree.type !== "array" || element === undefined}
    {#if !props.readOnly}
        <!-- defensive: misconfigured resolver wired this component into a non-array slot. -->
    {/if}
{:else if props.readOnly}
    {#if arr.length > 0}
        <ul role="group" aria-label={ariaLabel(props.meta.description)}>
            {#each arr as item, i (i)}
                {@const child = props.renderChild(
                    element,
                    item,
                    () => {
                        /* read-only: noop */
                    },
                    `[${String(i)}]`
                )}
                {#if child !== null}
                    <li>
                        <Mount descriptor={child} />
                    </li>
                {/if}
            {/each}
        </ul>
    {/if}
{:else}
    {@const handleRemove = (index: number) => {
        const next = arr.slice();
        next.splice(index, 1);
        props.onChange(next);
    }}
    {@const handleAdd = () => {
        const next = arr.slice();
        next.push(defaultRecordValue(element));
        props.onChange(next);
    }}
    <div role="group" aria-label={ariaLabel(props.meta.description)}>
        <ul>
            {#each arr as item, i (i)}
                {@const childOnChange = (v: unknown) => {
                    const nextArr = arr.slice();
                    nextArr[i] = v;
                    props.onChange(nextArr);
                }}
                {@const child = props.renderChild(
                    element,
                    item,
                    childOnChange,
                    `[${String(i)}]`
                )}
                <li>
                    {#if child !== null}
                        <Mount descriptor={child} />
                    {/if}
                    <button
                        type="button"
                        aria-label={`Remove item ${String(i)}`}
                        onclick={() => handleRemove(i)}>Remove</button
                    >
                </li>
            {/each}
        </ul>
        <button type="button" aria-label="Add item" onclick={handleAdd}
            >Add</button
        >
    </div>
{/if}
