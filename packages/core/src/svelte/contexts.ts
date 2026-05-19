/**
 * Svelte 5 implementation of `core/contexts.ts`'s {@link ContextPort}
 * for the resolver and widget registry.
 *
 * Wires the abstract provide / consume port to Svelte's native
 * `setContext()` / `getContext()` primitives (re-exported from
 * `svelte`). Each port is keyed by a `Symbol` so multiple framework
 * adapters can coexist in the same module graph without aliasing —
 * Svelte's context keys are object-identity-compared.
 *
 * Unlike the React `<Provider>` wrapper, Svelte's context model is
 * "set on the current component instance, read from any descendant" —
 * the {@link ContextPort.provide} call therefore does not wrap
 * `children`. Instead, it sets the value on the component currently
 * being initialised; descendants call {@link ContextPort.consume} to
 * read it. The `children` argument is accepted purely to satisfy the
 * port contract; it is returned unchanged so callers that pass a
 * snippet or other ad-hoc representation can still receive their
 * input back.
 *
 * @group Framework Adapters
 */

import { setContext, getContext } from "svelte";
import type { ContextPort } from "../core/contexts.ts";
import type { SvelteComponentResolver, SvelteWidgetMap } from "./types.ts";

/**
 * Symbol key for the resolver context. Identity-compared by Svelte's
 * context API — never aliases against the widget context or any other
 * port.
 */
const RESOLVER_CONTEXT_KEY = Symbol("schema-components/svelte:resolver");

/**
 * Symbol key for the widgets context. Sibling to
 * {@link RESOLVER_CONTEXT_KEY}.
 */
const WIDGETS_CONTEXT_KEY = Symbol("schema-components/svelte:widgets");

/**
 * Context port for the active {@link SvelteComponentResolver}.
 *
 * The {@link ContextPort.consume} side returns `undefined` when no
 * resolver has been provided in the current component subtree — the
 * Svelte dispatcher then falls through to the headless resolver,
 * matching the React adapter's behaviour with its
 * `UserResolverContext` default value.
 */
export const resolverContext: ContextPort<SvelteComponentResolver | undefined> =
    {
        provide(value, children) {
            setContext(RESOLVER_CONTEXT_KEY, value);
            return children;
        },
        consume() {
            return getContext<SvelteComponentResolver | undefined>(
                RESOLVER_CONTEXT_KEY
            );
        },
    };

/**
 * Context port for the active {@link SvelteWidgetMap}.
 *
 * The {@link ContextPort.consume} side returns `undefined` when no
 * widget map has been provided — the dispatcher then falls through to
 * the per-instance and global widget registries before consulting the
 * resolver chain.
 */
export const widgetsContext: ContextPort<SvelteWidgetMap | undefined> = {
    provide(value, children) {
        setContext(WIDGETS_CONTEXT_KEY, value);
        return children;
    },
    consume() {
        return getContext<SvelteWidgetMap | undefined>(WIDGETS_CONTEXT_KEY);
    },
};
