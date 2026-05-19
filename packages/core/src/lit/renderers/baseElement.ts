/**
 * Shared base class for every built-in `<sc-*>` Custom Element.
 *
 * Centralises the per-field property declarations and a small helper
 * for dispatching the canonical `sc-change` Custom Event that wires
 * an internal change through to whichever ancestor element is
 * orchestrating value flow (typically `<schema-component>`).
 *
 * Every Custom Element on the Lit side reads the per-field data from
 * declarative properties — schemas, walked field trees, constraints,
 * and example arrays cannot be safely serialised through HTML
 * attributes, so the declarations use `attribute: false`. This is the
 * single largest difference from the React adapter, where the same
 * data flows through component props.
 *
 * @packageDocumentation
 */

import { html, LitElement, type TemplateResult } from "lit";
import type { AllConstraints } from "../../core/renderer.ts";
import type { SchemaMeta, WalkedField } from "../../core/types.ts";
import type { LitRenderProps } from "../types.ts";

/**
 * Detail payload emitted on the `sc-change` Custom Event.
 *
 * The event bubbles and is composed so cross-Shadow-DOM listeners
 * (e.g. the orchestrating `<schema-component>` outside the child's
 * shadow tree) receive it without breaking encapsulation.
 */
export interface ScChangeEventDetail {
    value: unknown;
    /** Path of the field that produced the change. */
    path: string;
}

/**
 * Canonical Custom Event name emitted by every built-in `<sc-*>`
 * element when its user-facing input changes.
 *
 * The orchestrating `<schema-component>` listens for this internal
 * event, applies the resulting structural update to the root value,
 * and re-emits a public `change` Custom Event on its own host so
 * framework consumers observe a single, well-typed boundary event.
 */
export const SC_CHANGE_EVENT = "sc-change";

/**
 * Base class for the built-in `<sc-*>` Custom Elements.
 *
 * Subclasses declare:
 *
 * 1. A `static properties` table extending `BaseScElement.properties`.
 * 2. A `render()` method returning the per-type `TemplateResult`.
 *
 * The class deliberately does not implement `render()` itself — a
 * `LitElement` without `render()` is still constructible, but its
 * default behaviour is to render nothing. Subclasses are required to
 * override.
 */
export abstract class BaseScElement extends LitElement {
    /**
     * Property declarations shared by every built-in Custom Element.
     *
     * Subclasses spread this in:
     *
     * ```ts
     * static override properties = {
     *   ...BaseScElement.properties,
     *   ...
     * };
     * ```
     *
     * Every shared property uses `attribute: false` — none of the
     * payloads (`tree`, `value`, `meta`, `constraints`) round-trip
     * safely through HTML attribute strings.
     */
    static override readonly properties = {
        tree: { attribute: false },
        value: { attribute: false },
        readOnly: { attribute: false },
        writeOnly: { attribute: false },
        path: { attribute: false },
        meta: { attribute: false },
        constraints: { attribute: false },
        examples: { attribute: false },
        change: { attribute: false },
        renderChild: { attribute: false },
    };

    // Field declarations. These default values exist so static type
    // checking inside subclass templates does not have to narrow
    // `undefined`. Real values are set as properties by the
    // orchestrating element before the first render.
    tree!: WalkedField;
    value: unknown = undefined;
    readOnly = false;
    writeOnly = false;
    path = "";
    meta: SchemaMeta = {};
    constraints: AllConstraints = {};
    examples?: unknown[];

    /**
     * Default change handler — a no-op. The orchestrating
     * `<schema-component>` sets a real callback on every child so the
     * field's `change()` calls thread back up the structural tree.
     */
    change: (value: unknown) => void = () => {
        /* intentional no-op default; replaced by orchestrator */
    };

    /**
     * Default renderChild closure — emits an empty template. Container
     * renderers (object, array, tuple, record, union, …) need this
     * replaced by the orchestrator with the resolver-dispatching
     * closure so nested fields render through the same theme as the
     * root. Leaf renderers (string, number, boolean, …) never call it.
     */
    renderChild: LitRenderProps["renderChild"] = () => html``;

    /**
     * Dispatch the canonical `sc-change` event. Renderers call this
     * inside DOM event handlers (`@input`, `@change`, `@click` on
     * add/remove controls) — the orchestrating ancestor catches the
     * event, propagates the structural update to the root value, and
     * re-emits a top-level `change` event on its own host.
     */
    protected emitChange(value: unknown): void {
        // Also invoke the directly-attached callback (set by the
        // orchestrator when wiring renderChild). The Custom Event
        // pathway is the public API for cross-boundary listeners; the
        // callback is the internal fast-path so the orchestrator
        // doesn't have to install event listeners on every nested
        // shadow root.
        this.change(value);
        this.dispatchEvent(
            new CustomEvent<ScChangeEventDetail>(SC_CHANGE_EVENT, {
                detail: { value, path: this.path },
                bubbles: true,
                composed: true,
            })
        );
    }
}

// ---------------------------------------------------------------------------
// renderChild builder — used by container renderers (object, array, …)
// ---------------------------------------------------------------------------

/**
 * Build a `renderChild` closure that delegates back to the
 * orchestrating resolver dispatch. Container renderers (object, array,
 * tuple, record, union, discriminatedUnion, conditional, negation)
 * call this to recursively render their children without re-running
 * the resolver dispatch loop themselves.
 *
 * The closure is stored on the parent's render props and forwarded to
 * the resolver render function, mirroring the `renderChild` signatures
 * on the React and HTML render-props (see `core/renderer.ts`).
 */
export type LitRenderChild = LitRenderProps["renderChild"];

/**
 * Trivial pass-through helper used by renderers that need to emit a
 * `nothing` placeholder rather than a full `TemplateResult`. Keeps the
 * dispatch table strictly typed without forcing callers to import
 * `nothing` from Lit.
 */
export const emptyTemplate = (): TemplateResult => html``;
