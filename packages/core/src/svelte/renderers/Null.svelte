<!--
    Headless Svelte 5 renderer for null fields — `z.null()` or
    `{ type: "null" }`. Mirror of
    `react/headlessRenderers.tsx :: renderNull`.

    The only valid value is `null`, so render an em-dash placeholder
    regardless of mode. There is nothing the user can usefully change.
-->
<script lang="ts">
    import type { SvelteRenderProps } from "../types.ts";
    import { fieldDomId } from "../../core/idPath.ts";
    import { EM_DASH } from "../../core/cssClasses.ts";

    const props = $props<SvelteRenderProps>();

    const id = $derived(fieldDomId(props.path));
</script>

<span {id}>{EM_DASH}</span>
