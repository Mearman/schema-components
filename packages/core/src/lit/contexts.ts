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
 * **Canonical {@link ContextPort} compatibility.** The canonical
 * {@link ContextPort} interface declared in `core/contexts.ts` is
 * deliberately host-agnostic: `provide(value, children): unknown` and
 * `consume(): T`. Lit's `@lit/context` requires a `ReactiveControllerHost`
 * at every call site to register provider / consumer controllers, so
 * the Lit ports below cannot match the canonical signature directly.
 * Rather than declaring a parallel local `ContextPort<T>` (which would
 * shadow the canonical type), the Lit adapter exports the port objects
 * with inferred local types and re-exports the canonical
 * {@link ContextPort} so consumers retain a single source of truth for
 * the type name.
 *
 * @packageDocumentation
 */

import { ContextProvider, ContextConsumer, createContext } from "@lit/context";
import type { ReactiveControllerHost, ReactiveElement } from "lit";
import type { ContextPort } from "../core/contexts.ts";
import type { LitComponentResolver } from "./types.ts";

/**
 * Re-export the canonical {@link ContextPort} so Lit consumers that
 * need the type name keep a single import path that points at the
 * core declaration.
 */
export type { ContextPort };

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
 * Lit binding wrapping `ContextProvider` / `ContextConsumer` from
 * `@lit/context` for the {@link resolverContext}.
 *
 * The port is host-scoped — both `provide` and `consume` require a
 * `ReactiveControllerHost` reference so `@lit/context` can register
 * its controllers on the element's lifecycle. This is unavoidable
 * given Lit's reactive update model and is the reason the Lit port
 * does not match the canonical {@link ContextPort} signature in
 * `core/contexts.ts` directly — see this module's docstring for the
 * rationale.
 */
export const resolverContextPort = {
    provide(
        host: ReactiveControllerHost & ReactiveElement,
        value: LitComponentResolver
    ): { setValue: (value: LitComponentResolver) => void } {
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
    consume(host: ReactiveControllerHost & ReactiveElement): {
        readonly value?: LitComponentResolver;
    } {
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
 * Lit binding wrapping `ContextProvider` / `ContextConsumer` from
 * `@lit/context` for the {@link widgetsContext}. Parallel to
 * {@link resolverContextPort}; see that export for the rationale on
 * why the Lit port is host-scoped rather than matching the canonical
 * {@link ContextPort} signature directly.
 */
export const widgetsContextPort = {
    provide(
        host: ReactiveControllerHost & ReactiveElement,
        value: LitWidgetMap
    ): { setValue: (value: LitWidgetMap) => void } {
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
    consume(host: ReactiveControllerHost & ReactiveElement): {
        readonly value?: LitWidgetMap;
    } {
        const consumer = new ContextConsumer(host, {
            context: widgetsContext,
            subscribe: true,
        });
        return consumer;
    },
};
