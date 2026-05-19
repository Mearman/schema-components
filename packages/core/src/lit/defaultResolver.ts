/**
 * Default Lit {@link LitComponentResolver} that dispatches every
 * built-in schema type to the matching `<sc-*>` Custom Element.
 *
 * Where the React adapter's headless resolver composes per-type
 * functions that return React elements, the Lit equivalent emits a
 * `<sc-string>` / `<sc-number>` / … Custom Element with the per-field
 * props attached. The element itself is responsible for rendering —
 * the resolver is just a tag-name lookup with property assignment.
 *
 * When the consumer registered the elements with a non-empty prefix
 * (`registerSchemaComponents("myapp-")`), the resolver looks up the
 * prefixed tag from the {@link RegistrationResult.tags} map so the
 * right element is instantiated. A consumer that never called
 * `registerSchemaComponents` falls back to the canonical `sc-*`
 * names — letting tests render the elements directly with
 * `customElements.define` while keeping the production path
 * consumer-controlled.
 *
 * Implementation note: because Lit's `html` tagged template does not
 * support dynamically-named element tags, the resolver builds each
 * Custom Element via `document.createElement` and interpolates the
 * resulting `Node` into the template. This trades one shared cache
 * entry for any tag prefix — Lit's template caching is keyed on the
 * literal, so all 17 dispatches share the same cache slot — for the
 * loss of strictly-typed attribute templating. Per-field props are
 * still assigned through statically-typed property accessors below.
 *
 * @packageDocumentation
 */

import { html, type TemplateResult } from "lit";
import type { WalkedField } from "../core/types.ts";
import type { LitComponentResolver, LitRenderProps } from "./types.ts";
import type { RegistrationResult } from "./registry.ts";
import { BUILT_IN_ELEMENTS } from "./registry.ts";

// ---------------------------------------------------------------------------
// Mapping table — WalkedField.type → canonical <sc-*> tag
// ---------------------------------------------------------------------------

/**
 * Map of every `WalkedField.type` to its matching canonical `<sc-*>`
 * tag. Exhaustive over the discriminated union — adding a new variant
 * to the walker forces a deliberate update here.
 *
 * Exported so theme adapters can introspect the mapping when building
 * their own resolvers (e.g. a shadcn-flavoured Web Components theme
 * that wraps `<sc-string>` in a `<sl-input>`-style shell).
 */
export const TYPE_TO_CANONICAL_TAG: Readonly<
    Record<WalkedField["type"], string>
> = Object.freeze({
    string: "sc-string",
    number: "sc-number",
    boolean: "sc-boolean",
    null: "sc-null",
    enum: "sc-enum",
    object: "sc-object",
    array: "sc-array",
    tuple: "sc-tuple",
    record: "sc-record",
    union: "sc-union",
    discriminatedUnion: "sc-discriminated",
    conditional: "sc-conditional",
    negation: "sc-negation",
    literal: "sc-literal",
    file: "sc-file",
    never: "sc-never",
    unknown: "sc-unknown",
});

// ---------------------------------------------------------------------------
// Per-type render function builder
// ---------------------------------------------------------------------------

/**
 * Build the default Lit resolver for the supplied
 * {@link RegistrationResult}.
 *
 * Each render function emits a Lit `html` template whose body is a
 * dynamically-created `<sc-*>` element with every field prop assigned.
 * The change callback is forwarded directly so user input on a leaf
 * renderer reaches the orchestrator without going through a Custom
 * Event boundary on the fast path.
 *
 * When no `registration` is supplied, the resolver emits the
 * canonical `sc-*` tags. Useful in tests where `customElements.define`
 * may have been called separately and the consumer doesn't need a
 * prefixed registration object.
 */
export function createDefaultLitResolver(
    registration?: RegistrationResult
): LitComponentResolver {
    const tags =
        registration?.tags ??
        Object.fromEntries(
            Object.keys(BUILT_IN_ELEMENTS).map((tag) => [tag, tag])
        );

    function tagFor(type: WalkedField["type"]): string {
        const canonical = TYPE_TO_CANONICAL_TAG[type];
        return tags[canonical] ?? canonical;
    }

    function elementRenderer(
        type: WalkedField["type"]
    ): (props: LitRenderProps) => TemplateResult {
        return (props) => renderTagged(tagFor(type), props);
    }

    return {
        string: elementRenderer("string"),
        number: elementRenderer("number"),
        boolean: elementRenderer("boolean"),
        null: elementRenderer("null"),
        enum: elementRenderer("enum"),
        object: elementRenderer("object"),
        array: elementRenderer("array"),
        tuple: elementRenderer("tuple"),
        record: elementRenderer("record"),
        union: elementRenderer("union"),
        discriminatedUnion: elementRenderer("discriminatedUnion"),
        conditional: elementRenderer("conditional"),
        negation: elementRenderer("negation"),
        literal: elementRenderer("literal"),
        file: elementRenderer("file"),
        never: elementRenderer("never"),
        unknown: elementRenderer("unknown"),
    };
}

// ---------------------------------------------------------------------------
// Tagged-element factory
// ---------------------------------------------------------------------------

/**
 * Build a Lit template fragment that renders a single Custom Element
 * by tag name with every per-field prop attached.
 *
 * Pure DOM-side path. The `lit-labs/ssr` path (`renderToString` in
 * `lit/ssr.ts`) takes a separate code path that emits Declarative
 * Shadow DOM markup; this helper is for the browser render only.
 */
function renderTagged(tag: string, props: LitRenderProps): TemplateResult {
    if (typeof document === "undefined") {
        // No DOM (SSR worker context, top-level module evaluation in
        // pre-render). Emit an empty fragment — the SSR entry handles
        // server rendering separately, and any browser render after
        // hydration replaces this fragment with the upgraded element.
        return html``;
    }
    const el = document.createElement(tag);
    applyProperties(el, props);
    return html`${el}`;
}

/**
 * Assign every prop from {@link LitRenderProps} onto the created
 * element. Element constructors created with `document.createElement`
 * are typed as `HTMLElement`; we narrow through the `BaseScElement`
 * field shape (every built-in implements it) so the assignment is
 * statically typed without an `as` cast.
 *
 * If the element turns out NOT to be a `BaseScElement` (a tag prefix
 * collision with a consumer-registered third-party element, or a
 * misconfigured override), the assignment still succeeds because the
 * built-in field shape is structurally identical to a plain object —
 * the consumer is responsible for matching the field surface.
 */
function applyProperties(el: Element, props: LitRenderProps): void {
    // BaseScElement subclasses are the only built-ins, but third-party
    // overrides registered for the same tag MUST implement the same
    // field surface to receive the props. Use `Reflect.set` to assign
    // properties through the public DOM API — the runtime semantics
    // are identical to `el.prop = value`, and `Reflect.set` is typed
    // `(target: object, key: PropertyKey, value: unknown) => boolean`
    // so the assignment does not require widening `el` through a
    // type assertion (banned by the project's lint config).
    Reflect.set(el, "tree", props.tree);
    Reflect.set(el, "value", props.value);
    Reflect.set(el, "readOnly", props.readOnly);
    Reflect.set(el, "writeOnly", props.writeOnly);
    Reflect.set(el, "path", props.path);
    Reflect.set(el, "meta", props.meta);
    Reflect.set(el, "constraints", props.constraints);
    if (props.examples !== undefined) {
        Reflect.set(el, "examples", props.examples);
    }
    Reflect.set(el, "change", props.change);
    Reflect.set(el, "renderChild", props.renderChild);
}
