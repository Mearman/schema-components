/**
 * Solid bindings for the framework-agnostic {@link ContextPort} contract.
 *
 * Wraps Solid's native `createContext`/`useContext` primitives into the
 * shape every framework adapter exposes. Two ports are pre-bound for the
 * schema-components subtree — the theme resolver and the widget map —
 * mirroring the React adapter's `UserResolverContext` and
 * `WidgetsContext`.
 *
 * Unlike React's wrapping `<Provider>` JSX, Solid's `<Context.Provider>`
 * is itself a JSX component and must be invoked from inside a JSX tree.
 * The {@link ContextPort.provide} adapter therefore cannot construct the
 * Solid `<Provider>` element directly — it returns `children` unchanged,
 * relying on the Solid `<SchemaProvider>` template to wrap descendants
 * with the underlying `Context.Provider`. The ports exist so the generic
 * {@link ContextPort} contract has a concrete Solid implementation that
 * cross-framework consumers can introspect.
 */

import { createContext, useContext } from "solid-js";
import type { Context } from "solid-js";
import type { ContextPort } from "../core/contexts.ts";
import type { SolidComponentResolver, SolidWidgetMap } from "./types.ts";

/**
 * Solid context carrying the theme resolver propagated by
 * {@link SchemaProvider}. Default value `undefined` — the renderer falls
 * back to the headless resolver when no provider sits above a
 * `<SchemaComponent>`.
 */
export const UserResolverContext: Context<SolidComponentResolver | undefined> =
    createContext<SolidComponentResolver | undefined>(undefined);

/**
 * Solid context carrying the widget map provided by
 * {@link SchemaProvider}. Default value `undefined` — the renderer
 * dispatches to instance widgets / globals when no provider supplies a
 * context-level map.
 */
export const WidgetsContext: Context<SolidWidgetMap | undefined> =
    createContext<SolidWidgetMap | undefined>(undefined);

/**
 * Solid binding of {@link ContextPort} for the user resolver context.
 *
 * Exposed primarily so the {@link ContextPort} contract has a concrete
 * Solid implementation alongside the React, Vue and Svelte bindings —
 * generic consumers (cross-framework testing, port-driven adapters)
 * can read the resolver without depending on Solid's native context
 * shape. The Solid {@link SchemaProvider} component performs the actual
 * `<Context.Provider>` wrapping in its template.
 */
export const userResolverPort: ContextPort<SolidComponentResolver | undefined> =
    {
        provide(_value, children) {
            return children;
        },
        consume() {
            return useContext(UserResolverContext);
        },
    };

/**
 * Solid binding of {@link ContextPort} for the widgets context. Parallel
 * to {@link userResolverPort}.
 */
export const widgetsPort: ContextPort<SolidWidgetMap | undefined> = {
    provide(_value, children) {
        return children;
    },
    consume() {
        return useContext(WidgetsContext);
    },
};
