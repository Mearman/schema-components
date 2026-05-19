<!--
    Headless Svelte 5 renderer for `RecordField` — editable key/value
    rows with add / remove controls. Mirror of
    `react/headlessRenderers.tsx :: renderRecord`.

    Read-only mode renders a labelled list, falling back to an
    em-dash placeholder when empty. Editable mode wraps each entry
    in a row with a renameable key input, the value editor, and a
    Remove button; the footer Add button appends a new entry with a
    type-appropriate default via `defaultRecordValue`.

    Key rename uses `onblur` rather than `oninput` so intermediate
    typing states don't trigger early `onChange` calls — matches the
    React renderer's `onBlur` semantics.
-->
<script lang="ts">
    import type { SvelteRenderProps } from "../types.ts";
    import { fieldDomId } from "../../core/idPath.ts";
    import { EM_DASH } from "../../core/cssClasses.ts";
    import { isObject } from "../../core/guards.ts";
    import { ariaLabel } from "../a11y.ts";
    import {
        defaultRecordValue,
        nextRecordKey,
        renameRecordKey,
    } from "../headlessFns.ts";
    import Mount from "./Mount.svelte";

    const props = $props<SvelteRenderProps>();

    const obj = $derived<Record<string, unknown>>(
        isObject(props.value) ? props.value : {}
    );
    const valueType = $derived(
        props.tree.type === "record" ? props.tree.valueType : undefined
    );
    const entries = $derived(Object.entries(obj));
</script>

{#if props.tree.type === "record" && valueType !== undefined}
    {#if props.readOnly}
        {#if entries.length === 0}
            <span>{EM_DASH}</span>
        {:else}
            <div role="group" aria-label={ariaLabel(props.meta.description)}>
                {#each entries as [key, value] (key)}
                    {@const childId = fieldDomId(`${props.path}.${key}`)}
                    {@const child = props.renderChild(
                        valueType,
                        value,
                        () => {
                            /* read-only: noop */
                        },
                        key
                    )}
                    <div>
                        <label for={childId}>{key}</label>
                        {#if child !== null}
                            <Mount descriptor={child} />
                        {/if}
                    </div>
                {/each}
            </div>
        {/if}
    {:else}
        {@const handleRename = (oldKey: string, newKey: string) => {
            const renamed = renameRecordKey(obj, oldKey, newKey);
            if (renamed === obj) return;
            props.onChange(renamed);
        }}
        {@const handleValueChange = (key: string, nextValue: unknown) => {
            const updated: Record<string, unknown> = {};
            for (const [k, val] of Object.entries(obj)) {
                updated[k] = val;
            }
            updated[key] = nextValue;
            props.onChange(updated);
        }}
        {@const handleRemove = (key: string) => {
            const next: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(obj)) {
                if (k === key) continue;
                next[k] = v;
            }
            props.onChange(next);
        }}
        {@const handleAdd = () => {
            const newKey = nextRecordKey(Object.keys(obj));
            const next: Record<string, unknown> = { ...obj };
            next[newKey] = defaultRecordValue(valueType);
            props.onChange(next);
        }}
        <div role="group" aria-label={ariaLabel(props.meta.description)}>
            {#each entries as [key, value] (key)}
                {@const childId = fieldDomId(`${props.path}.${key}`)}
                {@const keyId = `${childId}-key`}
                {@const childOnChange = (v: unknown) => {
                    handleValueChange(key, v);
                }}
                {@const child = props.renderChild(
                    valueType,
                    value,
                    childOnChange,
                    key
                )}
                <div>
                    <input
                        id={keyId}
                        type="text"
                        aria-label="Entry key"
                        value={key}
                        onblur={(e) => {
                            const target = e.currentTarget;
                            if (target instanceof HTMLInputElement) {
                                handleRename(key, target.value);
                            }
                        }}
                    />
                    {#if child !== null}
                        <Mount descriptor={child} />
                    {/if}
                    <button
                        type="button"
                        aria-label={`Remove entry ${key}`}
                        onclick={() => handleRemove(key)}>Remove</button
                    >
                </div>
            {/each}
            <button type="button" aria-label="Add entry" onclick={handleAdd}
                >Add</button
            >
        </div>
    {/if}
{/if}
