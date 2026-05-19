<!--
    Recursion-cap sentinel rendered when the Svelte dispatcher reaches
    `MAX_RENDER_DEPTH`. Mirror of the React recursion sentinel
    (a `<fieldset>` with an em-dashed "(recursive)" label) from
    `react/SchemaComponent.tsx :: renderField`.

    Receives the standard {@link SvelteRenderProps} bag and renders
    only the `meta.description` (falling back to "schema") inside a
    `<fieldset>` — the children are intentionally elided to break the
    recursion.
-->
<script lang="ts">
    import type { SvelteRenderProps } from "../types.ts";
    import { SC_CLASSES } from "../../core/cssClasses.ts";

    const props = $props<SvelteRenderProps>();

    const label = $derived(
        typeof props.meta.description === "string"
            ? props.meta.description
            : "schema"
    );
</script>

<fieldset class={SC_CLASSES.recursive}>
    <em>{`↻ ${label} (recursive)`}</em>
</fieldset>
