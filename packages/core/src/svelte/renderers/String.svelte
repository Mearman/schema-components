<!--
    Headless Svelte 5 renderer for `StringField` — plain `<input>` /
    `<span>` mirror of `react/headlessRenderers.tsx :: renderString`.

    Honours the same accessibility wiring as the React equivalent:
    `aria-required`, `aria-describedby`, an optional sibling
    `<small class="sc-hint">` and a forced `aria-label` when the
    `meta.description` is supplied. Date / time / email / URL formats
    swap the `<input type="…">` accordingly; password format triggers
    masking and an `autocomplete="(current|new)-password"` hint.

    Read-only mode renders a `<span>` (or a safe `<a>` for valid
    `mailto:` / `https:` URIs). All editable inputs propagate value
    changes via the supplied `props.onChange` callback — no synthetic
    events, no two-way binding, just a raw DOM `onchange` handler.
-->
<script lang="ts">
    import type { SvelteRenderProps } from "../types.ts";
    import { fieldDomId } from "../../core/idPath.ts";
    import { dateInputType } from "../../core/formats.ts";
    import { isSafeHyperlink, isSafeMailtoAddress } from "../../core/uri.ts";
    import { displayJsonValue } from "../../core/walkBuilders.ts";
    import { EM_DASH, ELLIPSIS } from "../../core/cssClasses.ts";
    import { buildAriaAttrs, buildHintInfo } from "../a11y.ts";

    const props = $props<SvelteRenderProps>();

    const id = $derived(fieldDomId(props.path));
    const strValue = $derived(
        typeof props.value === "string" ? props.value : ""
    );

    function formatDateTime(value: string): string {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return value;
        return date.toLocaleString();
    }

    function formatDate(value: string): string {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return value;
        return date.toLocaleDateString();
    }

    function formatTime(value: string): string {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return value;
        return date.toLocaleTimeString();
    }
</script>

{#if props.readOnly}
    {@const readValue = typeof props.value === "string" ? props.value : ""}
    {#if readValue.length === 0}
        <span {id}>{EM_DASH}</span>
    {:else if props.constraints.format === "email" && isSafeMailtoAddress(readValue)}
        <!-- svelte-ignore a11y_role_supports_aria_props_implicit -->
        <a href={`mailto:${readValue}`} {id} aria-readonly="true">{readValue}</a>
    {:else if (props.constraints.format === "uri" || props.constraints.format === "url") && isSafeHyperlink(readValue)}
        <!-- svelte-ignore a11y_role_supports_aria_props_implicit -->
        <a href={readValue} {id} aria-readonly="true">{readValue}</a>
    {:else if props.constraints.format === "date"}
        <span {id}>{formatDate(readValue)}</span>
    {:else if props.constraints.format === "time"}
        <span {id}>{formatTime(readValue)}</span>
    {:else if props.constraints.format === "date-time" || props.constraints.format === "datetime"}
        <span {id}>{formatDateTime(readValue)}</span>
    {:else}
        <span {id}>{readValue}</span>
    {/if}
{:else}
    {@const dateType = dateInputType(props.constraints.format)}
    {@const ariaAttrs = buildAriaAttrs(props.tree)}
    {@const hintInfo = buildHintInfo(id, props.constraints)}
    {@const enumValues =
        props.tree.type === "enum" ? props.tree.enumValues : []}
    {@const isCredential =
        props.writeOnly === true && props.constraints.format === "password"}
    {@const inputType = isCredential
        ? "password"
        : props.constraints.format === "email"
          ? "email"
          : props.constraints.format === "uri"
            ? "url"
            : "text"}
    {@const autoComplete = isCredential
        ? strValue.length > 0
            ? "current-password"
            : "new-password"
        : undefined}
    {@const placeholderText =
        typeof props.meta.description === "string"
            ? props.meta.description
            : undefined}

    {#if dateType !== undefined}
        <input
            {id}
            type={dateType}
            value={props.writeOnly ? "" : strValue}
            onchange={(e) => {
                const target = e.currentTarget;
                if (target instanceof HTMLInputElement) {
                    props.onChange(target.value);
                }
            }}
            aria-describedby={hintInfo?.ariaDescribedBy}
            {...ariaAttrs}
        />
    {:else if props.tree.type === "enum" && enumValues.length > 0}
        <select
            {id}
            value={props.writeOnly ? "" : strValue}
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
                <option value={displayJsonValue(v)}
                    >{displayJsonValue(v)}</option
                >
            {/each}
        </select>
    {:else}
        <input
            {id}
            type={inputType}
            autocomplete={autoComplete}
            value={props.writeOnly ? "" : strValue}
            onchange={(e) => {
                const target = e.currentTarget;
                if (target instanceof HTMLInputElement) {
                    props.onChange(target.value);
                }
            }}
            placeholder={placeholderText}
            minlength={props.constraints.minLength}
            maxlength={props.constraints.maxLength}
            aria-describedby={hintInfo?.ariaDescribedBy}
            {...ariaAttrs}
        />
    {/if}
    {#if hintInfo !== undefined}
        <small id={hintInfo.id} class="sc-hint">{hintInfo.hint}</small>
    {/if}
{/if}
