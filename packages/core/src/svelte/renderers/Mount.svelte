<!--
    Utility component that mounts a {@link SvelteRenderDescriptor}
    returned by `props.renderChild(...)`. Centralised so every
    container renderer (`Object`, `Array`, `Tuple`, `Record`,
    `Union`, `DiscriminatedUnion`, `Conditional`, `Negation`) uses
    the same `<svelte:component>`-equivalent code path.

    Svelte 5's dynamic-component feature renders a capitalised local
    variable that references a `Component<Props>` constructor as
    `<Var ... />`. The descriptor is destructured once here so the
    consumer just writes `<Mount {descriptor} />`.
-->
<script lang="ts">
    import type { SvelteRenderDescriptor } from "../types.ts";

    interface Props {
        descriptor: SvelteRenderDescriptor;
    }

    const { descriptor }: Props = $props();
    const Component = $derived(descriptor.component);
</script>

<Component {...descriptor.props} />
