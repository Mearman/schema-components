/**
 * Context ports for the Lit adapter.
 *
 * Implements the `ContextPort<T>` abstraction described in the
 * multi-framework research note. The port is the framework-agnostic
 * contract for "provide a value at a parent and consume it at any
 * descendant" — every framework adapter (React `createContext`, Vue
 * `provide`/`inject`, Svelte `setContext`/`getContext`, Lit
 * `@lit/context`) wires the same shape into its native primitive so
 * the core renderer dispatch loop never reaches for a framework-
 * specific API.
 *
 * For Lit, the port is implemented on top of
 * [`@lit/context`](https://lit.dev/docs/data/context/), which uses the
 * proposed [Context Protocol](https://github.com/webcomponents/community-protocols/blob/main/proposals/context.md)
 * — DOM events bubble up from a consumer until a provider catches them
 * and seeds the consumer with the requested value. The protocol is
 * synchronous, DOM-scoped, and runs only in the browser.
 *
 * **SSR caveat.** `@lit/context` does NOT server-render. The Lit SSR
 * package (`@lit-labs/ssr`) emits Custom Element markup without firing
 * the consumer-side context request events, so any value provided via
 * a `ContextPort` is `undefined` on the server. Consumers must default
 * gracefully — the built-in Lit renderers fall back to the default
 * resolver when the resolver context is unset, matching their browser
 * behaviour when no consumer wraps the schema element.
 *
 * @packageDocumentation
 */

import { ContextProvider, ContextConsumer, createContext } from "@lit/context";
import type { ReactiveControllerHost, ReactiveElement } from "lit";
import type { LitComponentResolver } from "./types.ts";

// ---------------------------------------------------------------------------
// ContextPort<T> — framework-agnostic shape
// ---------------------------------------------------------------------------

/**
 * Framework-agnostic context port.
 *
 * Each framework adapter implements `provide` and `consume` over its
 * native primitive: React `createContext` + `useContext`, Vue
 * `provide`/`inject`, Svelte `setContext`/`getContext`, Lit
 * `@lit/context` (this file). The schema-components core can therefore
 * thread a value (e.g. a {@link LitComponentResolver}) through the
 * render tree without depending on any framework's runtime — the only
 * coupling is through the well-typed `ContextPort` contract.
 *
 * `provide` and `consume` are intentionally asymmetric: provide takes
 * a host (in Lit, a `ReactiveControllerHost`; in React, a parent
 * component) plus the initial value, while consume takes a host and
 * returns the current value (which may be `undefined` if no provider
 * is reachable).
 *
 * @typeParam T - The value type carried by the port.
 */
export interface ContextPort<T> {
    /**
     * Provide a value at a host. Returns an opaque controller object
     * the caller can hold onto in order to update the provided value
     * later — the shape of the controller is framework-specific.
     */
    provide: (
        host: ReactiveControllerHost & ReactiveElement,
        value: T
    ) => {
        setValue: (value: T) => void;
    };
    /**
     * Consume the value from the nearest ancestor provider. Returns a
     * disposable consumer object whose `value` property carries the
     * currently-provided value, or `undefined` if no provider is
     * reachable (the property is marked optional to match Lit's
     * `ContextConsumer` shape — which itself uses optional because
     * the value may genuinely be absent before a provider is mounted).
     */
    consume: (host: ReactiveControllerHost & ReactiveElement) => {
        readonly value?: T;
    };
}

// ---------------------------------------------------------------------------
// Resolver context — provided by <schema-component>, consumed by every <sc-*>
// ---------------------------------------------------------------------------

/**
 * Context key identifying the {@link LitComponentResolver} provided at
 * a host element. Re-used by every built-in `<sc-*>` Custom Element so
 * a single `<schema-component>` provider seeds the whole subtree —
 * matching the behaviour of `<SchemaProvider>` on the React side.
 *
 * The literal `"sc-resolver"` value is the runtime key carried in the
 * Context Protocol's `context-request` event; consumers and providers
 * must use the same `Context` object (not just the same string) to
 * match, which is why this is exported rather than redeclared per
 * element.
 */
export const resolverContext = createContext<LitComponentResolver>(
    Symbol.for("sc-resolver")
);

/**
 * {@link ContextPort} implementation for the {@link resolverContext}.
 *
 * The Lit binding wraps `ContextProvider` and `ContextConsumer` from
 * `@lit/context` in the `ContextPort<T>` shape so the core renderer
 * dispatch loop never touches `@lit/context` directly. This is the
 * same indirection the React adapter applies through `createContext` /
 * `useContext`, and is what lets a future Vue / Solid / Svelte adapter
 * implement the same port over its native API without churning the
 * renderer code.
 */
export const resolverContextPort: ContextPort<LitComponentResolver> = {
    provide(host, value) {
        const controller = new ContextProvider(host, {
            context: resolverContext,
            initialValue: value,
        });
        return {
            setValue(next) {
                controller.setValue(next);
            },
        };
    },
    consume(host) {
        const consumer = new ContextConsumer(host, {
            context: resolverContext,
            // `subscribe: true` re-renders the consuming element when
            // the provider updates the value. Required for theme
            // adapters that swap resolvers at runtime.
            subscribe: true,
        });
        return consumer;
    },
};

// ---------------------------------------------------------------------------
// Widgets context — instance-scoped widget overrides
// ---------------------------------------------------------------------------

/**
 * Widget map — name → custom element tag.
 *
 * Where the React adapter's `WidgetMap` is `ReadonlyMap<string, RenderFunction>`
 * (a function value per hint name), the Lit adapter resolves widgets by
 * Custom Element tag name. A schema field carrying
 * `.meta({ component: "color-picker" })` looks up `widgets.get("color-picker")`
 * and renders the matching tag — preserving the Web-Components-native
 * pattern where every renderer override IS a Custom Element.
 *
 * Tags must be registered via `customElements.define` before they can
 * be rendered. Unregistered tags surface as unknown elements with no
 * upgrade — matching the browser's behaviour rather than throwing.
 */
export type LitWidgetMap = ReadonlyMap<string, string>;

/**
 * Context key for {@link LitWidgetMap}.
 */
export const widgetsContext = createContext<LitWidgetMap>(
    Symbol.for("sc-widgets")
);

/**
 * {@link ContextPort} implementation for the {@link widgetsContext}.
 */
export const widgetsContextPort: ContextPort<LitWidgetMap> = {
    provide(host, value) {
        const controller = new ContextProvider(host, {
            context: widgetsContext,
            initialValue: value,
        });
        return {
            setValue(next) {
                controller.setValue(next);
            },
        };
    },
    consume(host) {
        const consumer = new ContextConsumer(host, {
            context: widgetsContext,
            subscribe: true,
        });
        return consumer;
    },
};
