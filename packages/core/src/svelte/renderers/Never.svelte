<!--
    Headless Svelte 5 renderer for `NeverField` — `z.never()` or
    `{ not: {} }` / `false` schemas. Mirror of
    `react/headlessRenderers.tsx :: renderNever`.

    `never` indicates a position that cannot hold any value. Render a
    visible placeholder rather than throwing because some valid
    schemas intentionally contain `never` branches (e.g. exhaustive
    discriminated unions), and a runtime crash on render would be
    worse than a visible indicator.
-->
<script lang="ts">
    import type { SvelteRenderProps } from "../types.ts";
    import { fieldDomId } from "../../core/idPath.ts";
    import { SC_CLASSES } from "../../core/cssClasses.ts";

    const props = $props<SvelteRenderProps>();

    const id = $derived(fieldDomId(props.path));
</script>

<span {id} class={SC_CLASSES.never}>
    <em>never matches</em>
</span>
