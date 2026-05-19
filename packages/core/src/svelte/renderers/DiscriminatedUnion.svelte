<!--
    Headless Svelte 5 renderer for `DiscriminatedUnionField` —
    tabbed UI driven by the discriminator. Mirror of
    `react/headlessRenderers.tsx :: renderDiscriminatedUnion` plus
    the embedded `DiscriminatedUnionTabs` component.

    Implements the WAI-ARIA "Tabs with Automatic Activation" pattern:
    ArrowRight / ArrowLeft move between tabs (wrapping at the
    extremes), Home / End jump to the first / last tab, every tab
    carries explicit `aria-selected` (NVDA / JAWS browse-mode read
    selection state only when the attribute is present on every tab),
    `aria-controls` references the shared tab-panel id, and a roving
    `tabindex` (`0` on the active tab, `-1` elsewhere) keeps keyboard
    focus inside the tablist.

    Focus management state machine — mirrors the React equivalent:

      1. Component renders with `activeIndex` derived from the value.
      2. User presses an arrow / Home / End key → handler computes
         the new index, sets the `pendingFocus` flag, and calls
         `props.onChange({ [discKey]: newLabel })`.
      3. Parent re-renders with the new value; `activeIndex` updates.
      4. `$effect` observes the `activeIndex` change AND
         `pendingFocus`; if both are set, focus the new tab and clear
         the flag.

    Clicks already move focus (the browser's default), so the
    `pendingFocus` flag is only ever set inside the keyboard handler.
    The flag is held in `$state` rather than a plain variable so the
    effect re-runs reliably when it transitions.

    `$bindable` is intentionally not used — `value`/`onChange` is the
    canonical contract across React, HTML, and Svelte. Consumers who
    want `bind:value` ergonomics use `<SchemaComponent {schema}
    bind:value />` at the call site; Svelte translates that into an
    `onChange` that mutates the bound rune-backed reference, so this
    component never sees the binding.
-->
<script lang="ts">
    import type { SvelteRenderProps } from "../types.ts";
    import { panelIdFor, tabIdFor } from "../../core/idPath.ts";
    import { EM_DASH } from "../../core/cssClasses.ts";
    import { isObject } from "../../core/guards.ts";
    import { resolveDiscriminatedActive } from "../../core/unionMatch.ts";
    import {
        discriminatedUnionValueForTab,
        wrapTabIndex,
    } from "../headlessFns.ts";
    import Mount from "./Mount.svelte";

    const props = $props<SvelteRenderProps>();

    const tabRefs: (HTMLButtonElement | null)[] = $state([]);
    let pendingFocus = $state(false);

    const valueObject = $derived(
        isObject(props.value) ? props.value : undefined
    );

    const resolved = $derived(
        props.tree.type === "discriminatedUnion"
            ? resolveDiscriminatedActive(
                  props.tree.options,
                  props.tree.discriminator,
                  valueObject
              )
            : { optionLabels: [], activeIndex: 0, activeOption: undefined }
    );

    const options = $derived(
        props.tree.type === "discriminatedUnion" ? props.tree.options : []
    );

    const discKey = $derived(
        props.tree.type === "discriminatedUnion" ? props.tree.discriminator : ""
    );

    const panelId = $derived(panelIdFor(props.path));

    function handleTabChange(newIndex: number): void {
        const next = discriminatedUnionValueForTab(
            resolved.optionLabels,
            discKey,
            newIndex
        );
        if (next === undefined) return;
        props.onChange(next);
    }

    function handleKeyDown(e: KeyboardEvent): void {
        let target: number | undefined;
        if (e.key === "ArrowRight")
            target = wrapTabIndex(resolved.activeIndex + 1, options.length);
        else if (e.key === "ArrowLeft")
            target = wrapTabIndex(resolved.activeIndex - 1, options.length);
        else if (e.key === "Home") target = 0;
        else if (e.key === "End") target = options.length - 1;
        if (target === undefined) return;
        e.preventDefault();
        if (target === resolved.activeIndex) return;
        pendingFocus = true;
        handleTabChange(target);
    }

    /**
     * After a keyboard-driven activeIndex change, move focus to the
     * newly active tab. Skipped on initial mount and after clicks
     * because `pendingFocus` is only set inside `handleKeyDown`.
     */
    $effect(() => {
        // Re-run when `activeIndex` changes.
        const index = resolved.activeIndex;
        if (!pendingFocus) return;
        pendingFocus = false;
        const tab = tabRefs[index];
        if (tab !== null && tab !== undefined) tab.focus();
    });
</script>

{#if props.tree.type !== "discriminatedUnion" || options.length === 0}
    {#if props.value === undefined || props.value === null}
        <span>{EM_DASH}</span>
    {:else}
        <span>{JSON.stringify(props.value)}</span>
    {/if}
{:else if props.readOnly}
    {#if resolved.activeOption !== undefined}
        {@const child = props.renderChild(
            resolved.activeOption,
            props.value,
            props.onChange
        )}
        {#if child !== null}
            <Mount descriptor={child} />
        {:else}
            <span>{EM_DASH}</span>
        {/if}
    {:else}
        <span>{EM_DASH}</span>
    {/if}
{:else}
    <div>
        <!--
            `role="tablist"` requires a tabindex per WAI-ARIA. The
            tablist itself never receives focus directly — the roving
            tabindex on the individual tabs handles keyboard entry —
            so set `tabindex=-1` to satisfy the rule without
            introducing a redundant focus stop.
        -->
        <div
            role="tablist"
            tabindex={-1}
            aria-label="Select variant"
            aria-orientation="horizontal"
            style="display: flex; gap: 0.25rem; margin-bottom: 0.5rem;"
            onkeydown={handleKeyDown}
        >
            {#each options as _opt, i (i)}
                <button
                    bind:this={tabRefs[i]}
                    type="button"
                    role="tab"
                    id={tabIdFor(props.path, i)}
                    aria-selected={i === resolved.activeIndex ? "true" : "false"}
                    aria-controls={panelId}
                    tabindex={i === resolved.activeIndex ? 0 : -1}
                    onclick={() => handleTabChange(i)}
                    style="padding: 0.25rem 0.75rem; border: 1px solid {i ===
                    resolved.activeIndex
                        ? '#3b82f6'
                        : '#d1d5db'}; border-radius: 0.25rem; background: {i ===
                    resolved.activeIndex
                        ? '#eff6ff'
                        : 'transparent'}; cursor: pointer; font-size: 0.875rem;"
                >
                    {resolved.optionLabels[i]}
                </button>
            {/each}
        </div>
        <div
            role="tabpanel"
            id={panelId}
            aria-labelledby={tabIdFor(props.path, resolved.activeIndex)}
        >
            {#if resolved.activeOption !== undefined}
                {@const child = props.renderChild(
                    resolved.activeOption,
                    props.value,
                    props.onChange
                )}
                {#if child !== null}
                    <Mount descriptor={child} />
                {/if}
            {/if}
        </div>
    </div>
{/if}
