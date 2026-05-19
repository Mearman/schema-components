/**
 * Functional Vue component whose sole job is to render a supplied
 * `VNode` as its output. The SFC entry points (`SchemaComponent.vue`,
 * `SchemaView.vue`, `SchemaField.vue`) compute their render output as
 * a VNode in `setup()` and pass it through a `&lt;VNodeHost :node="vnode" /&gt;`
 * tag so the template body remains a single declarative anchor while
 * the actual rendering work happens in the dispatcher.
 *
 * Why this exists: Vue's `&lt;component :is&gt;` directive expects a
 * component definition or a tag name string — it does not accept a
 * bare `VNode`. Returning a render function from a `&lt;script setup&gt;`
 * block is also not a Vue idiom (the SFC compiler treats the setup
 * block's exposed bindings as values to surface to the template). A
 * functional component is the idiomatic seam: it accepts a `node`
 * prop and returns it from its render function unchanged.
 *
 * Functional components in Vue 3 are pure render functions — no
 * lifecycle, no reactive state — so the only cost is the function
 * call itself; reactivity continues to flow through the parent SFC's
 * computed VNode.
 */

import type { FunctionalComponent, VNode } from "vue";

export const VNodeHost: FunctionalComponent<{ node: VNode }> = (props) => {
    return props.node;
};

// Vue's runtime reads `props` off functional components for prop
// validation; declaring them keeps the warning-free contract that the
// SFC compiler enforces.
VNodeHost.props = ["node"];
