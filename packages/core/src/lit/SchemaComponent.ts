/**
 * `<schema-component>` — top-level Lit Custom Element for editable
 * schema-driven UI.
 *
 * Parity with the React `<SchemaComponent>` for the rendering path:
 *
 * - Accepts a Zod schema, JSON Schema, or OpenAPI document via the
 *   `schema` property (NOT attribute — see "Property-only schema/
 *   value/resolver" in `lit/README.md`).
 * - Walks the schema via `normaliseSchema` → `walk` from
 *   `core/walker.ts` and dispatches every node through a Lit
 *   resolver — by default, the {@link createDefaultLitResolver}
 *   resolver that renders the built-in `<sc-*>` Custom Elements.
 * - Emits a public `change` Custom Event on every user edit, with
 *   the updated root value in `event.detail.value`. Cross-framework
 *   wrappers translate this into the host framework's event /
 *   binding primitive (React's `onChange`, Vue `@change`, Svelte
 *   `on:change`).
 *
 * The element is registered by {@link registerSchemaComponents}; tag
 * name defaults to `<schema-component>`. Pass a non-empty prefix
 * (`registerSchemaComponents("myapp-")`) to namespace the top-level
 * tag alongside every `<sc-*>` child.
 *
 * @packageDocumentation
 */

import { html, LitElement, type TemplateResult } from "lit";
import { walk } from "../core/walker.ts";
import type { WalkOptions } from "../core/walkBuilders.ts";
import { normaliseSchema, type SchemaIoSide } from "../core/adapter.ts";
import { MAX_RENDER_DEPTH } from "../core/limits.ts";
import { buildRenderProps } from "../core/renderer.ts";
import type { SchemaMeta, WalkedField } from "../core/types.ts";
import { SchemaNormalisationError, SchemaRenderError } from "../core/errors.ts";
import { SC_CLASSES } from "../core/cssClasses.ts";
import { toRecordOrUndefined } from "../core/guards.ts";
import type { DiagnosticsOptions, Diagnostic } from "../core/diagnostics.ts";
import type { LitComponentResolver, LitRenderProps } from "./types.ts";
import { createDefaultLitResolver } from "./defaultResolver.ts";
import { resolveLitWidget } from "./widget.ts";

/**
 * Public change-event detail emitted on the top-level `<schema-component>`.
 *
 * The `value` payload carries the updated root value as returned by
 * the user's most recent edit. Consumers wire this into their
 * framework's binding system — React via `addEventListener` on the
 * canonical `change` event, Vue via a `@change` directive, Svelte
 * via `on:change`. The detail object always carries a single
 * `value` field with the post-edit root value.
 */
export interface SchemaChangeEventDetail {
    value: unknown;
}

/**
 * Lit Custom Element for editable schema-driven UI.
 *
 * Tag: `<schema-component>` (default) or `<{prefix}schema-component>`
 * (when `registerSchemaComponents(prefix)` is called).
 *
 * **Required:** call {@link registerSchemaComponents} once at module
 * setup before instantiating this element in HTML markup, otherwise
 * none of the per-type `<sc-*>` children will upgrade and the tree
 * will render as unknown elements.
 */
export class SchemaComponent extends LitElement {
    /**
     * Element property declarations.
     *
     * All four "data" properties (`schema`, `value`, `resolver`,
     * `widgets`) carry `attribute: false`: Custom Element attributes
     * are strings, and these payloads (an arbitrary Zod schema, an
     * arbitrary JS value, a resolver function map, a widget tag map)
     * cannot round-trip through attribute serialisation. Set them via
     * direct property assignment.
     *
     * `readOnly` is a boolean attribute (and reflects to DOM) so the
     * common "render read-only view" case is reachable from plain
     * HTML markup (`<schema-component readonly></schema-component>`).
     * The capitalisation is `readOnly` on the property and `readonly`
     * on the attribute — matching the HTML `readonly` attribute on
     * `<input>` / `<textarea>`.
     */
    static override readonly properties = {
        schema: { attribute: false },
        value: { attribute: false },
        resolver: { attribute: false },
        widgets: { attribute: false },
        fields: { attribute: false },
        meta: { attribute: false },
        ref: { attribute: false },
        io: { attribute: false },
        idPrefix: { attribute: false },
        onDiagnostic: { attribute: false },
        readOnly: { type: Boolean, reflect: true, attribute: "readonly" },
        strict: { type: Boolean },
    };

    /**
     * Zod schema, JSON Schema object, or OpenAPI document.
     *
     * Property-only — there is no way to serialise a schema through
     * an HTML attribute. Framework wrappers (React, Vue, Svelte
     * native CE interop) all support property binding; document the
     * binding syntax in `lit/README.md`.
     */
    schema: unknown = undefined;

    /** For OpenAPI: a ref string like `"#/components/schemas/User"`. */
    ref: string | undefined = undefined;

    /** Which side of every transform / pipe / codec to render. */
    io: SchemaIoSide | undefined = undefined;

    /** Current value to render. */
    value: unknown = undefined;

    /**
     * Theme adapter. Property-only — like the React {@link ComponentResolver}
     * the resolver is a per-type function map.
     */
    resolver: LitComponentResolver | undefined = undefined;

    /**
     * Widget map: hint name → Custom Element tag. Property-only.
     */
    widgets: ReadonlyMap<string, string> | undefined = undefined;

    /** Per-field meta overrides. */
    fields: Record<string, unknown> | undefined = undefined;

    /** Meta overrides applied to the root schema. */
    meta: SchemaMeta | undefined = undefined;

    /** Prefix used for every input id in this element's subtree. */
    idPrefix: string | undefined = undefined;

    /** Whether the element renders read-only. */
    readOnly = false;

    /** When true, any diagnostic becomes a thrown error. */
    strict = false;

    /**
     * Called with each diagnostic emitted during schema processing.
     * Property-only.
     */
    onDiagnostic: ((diagnostic: Diagnostic) => void) | undefined = undefined;

    override render(): TemplateResult {
        if (this.schema === undefined) {
            // Empty render until the schema is provided — matches the
            // React adapter, which short-circuits when no schema is
            // available rather than throwing.
            return html``;
        }

        let jsonSchema: Record<string, unknown>;
        let rootMeta: SchemaMeta | undefined;
        let rootDocument: Record<string, unknown>;
        try {
            const diagnosticsOptions =
                this.onDiagnostic !== undefined || this.strict
                    ? this.buildDiagnostics()
                    : undefined;
            const normaliseOptions =
                diagnosticsOptions !== undefined || this.io !== undefined
                    ? {
                          ...(diagnosticsOptions !== undefined
                              ? { diagnostics: diagnosticsOptions }
                              : {}),
                          ...(this.io !== undefined ? { io: this.io } : {}),
                      }
                    : undefined;
            const normalised = normaliseSchema(
                this.schema,
                this.ref,
                normaliseOptions
            );
            jsonSchema = normalised.jsonSchema;
            rootMeta = normalised.rootMeta;
            rootDocument = normalised.rootDocument;
        } catch (err: unknown) {
            if (err instanceof SchemaNormalisationError) throw err;
            throw new SchemaNormalisationError(
                err instanceof Error
                    ? err.message
                    : "Failed to normalise schema",
                this.schema,
                "unknown"
            );
        }

        const mergedMeta: SchemaMeta = { ...this.meta };
        if (this.readOnly) mergedMeta.readOnly = true;

        const walkOptions: WalkOptions = {
            componentMeta: mergedMeta,
            rootMeta,
            fieldOverrides: toRecordOrUndefined(this.fields),
            rootDocument,
            ...(this.onDiagnostic !== undefined || this.strict
                ? { diagnostics: this.buildDiagnostics() }
                : {}),
        };

        const tree = walk(jsonSchema, walkOptions);
        const userResolver = this.resolver ?? createDefaultLitResolver();
        const rootPath = this.idPrefix ?? "root";

        const rootChange = (next: unknown): void => {
            // The element is its own bridge between the internal
            // `sc-change` events and the public `change` event.
            this.value = next;
            this.dispatchEvent(
                new CustomEvent<SchemaChangeEventDetail>("change", {
                    detail: { value: next },
                    bubbles: false,
                    composed: false,
                })
            );
            this.requestUpdate();
        };

        const renderChild = this.makeRenderChild(0, rootPath, userResolver);
        return this.renderField(
            tree,
            this.value ?? tree.defaultValue,
            rootChange,
            userResolver,
            renderChild,
            rootPath
        );
    }

    /**
     * Build the recursive `renderChild` closure threaded through every
     * container renderer.
     */
    protected makeRenderChild(
        currentDepth: number,
        parentPath: string,
        userResolver: LitComponentResolver
    ): LitRenderProps["renderChild"] {
        const joinPath = (parent: string, suffix?: string): string => {
            if (suffix === undefined) return parent;
            return suffix.startsWith("[")
                ? `${parent}${suffix}`
                : `${parent}.${suffix}`;
        };
        return (childTree, childValue, childChange, pathSuffix) => {
            const childPath = joinPath(parentPath, pathSuffix);
            if (currentDepth >= MAX_RENDER_DEPTH) {
                const label =
                    typeof childTree.meta.description === "string"
                        ? childTree.meta.description
                        : "schema";
                return html`<fieldset class=${SC_CLASSES.recursive}>
                    <em>${`↻ ${label} (recursive)`}</em>
                </fieldset>`;
            }
            const grandChild = this.makeRenderChild(
                currentDepth + 1,
                childPath,
                userResolver
            );
            return this.renderField(
                childTree,
                childValue,
                childChange,
                userResolver,
                grandChild,
                childPath
            );
        };
    }

    /**
     * Dispatch a single walked field through the resolver, widget
     * registry, and recursion limit. Parallel to
     * `renderField` in `react/SchemaComponent.tsx`.
     */
    protected renderField(
        tree: WalkedField,
        value: unknown,
        change: (next: unknown) => void,
        userResolver: LitComponentResolver,
        renderChild: LitRenderProps["renderChild"],
        path: string
    ): TemplateResult {
        // Widgets take priority over the resolver.
        const componentHint = tree.meta.component;
        if (typeof componentHint === "string") {
            const widget = resolveLitWidget(componentHint, this.widgets);
            if (widget !== undefined) {
                if (typeof document === "undefined") return html``;
                const el = document.createElement(widget);
                this.applyWidgetProperties(el, tree, value, change, path);
                return html`${el}`;
            }
        }

        const renderFn = userResolver[litResolverKey(tree.type)];
        if (renderFn !== undefined) {
            // Build a `RenderProps` shape compatible with `buildRenderProps`,
            // then adapt to the Lit-shaped `LitRenderProps` so the
            // resolver receives both `change` and `renderChild` in
            // their Lit-native form (rather than `onChange`). The
            // adapter forwards through to the Lit `renderChild`, dropping
            // the React-style `onChange` parameter from the React-shaped
            // signature — Lit child renderers consume the change
            // callback directly via the `LitRenderProps.change` field.
            const adaptedRenderChild = (
                childTree: WalkedField,
                childValue: unknown,
                childOnChange: (v: unknown) => void,
                pathSuffix?: string
            ): TemplateResult =>
                renderChild(childTree, childValue, childOnChange, pathSuffix);
            const coreProps = buildRenderProps(
                tree,
                value,
                change,
                adaptedRenderChild,
                path
            );
            const litProps: LitRenderProps = {
                value: coreProps.value,
                readOnly: coreProps.readOnly,
                writeOnly: coreProps.writeOnly,
                meta: coreProps.meta,
                constraints: coreProps.constraints,
                path: coreProps.path,
                tree: coreProps.tree,
                change,
                renderChild,
                ...(coreProps.examples !== undefined
                    ? { examples: coreProps.examples }
                    : {}),
            };
            try {
                return renderFn(litProps);
            } catch (err: unknown) {
                throw new SchemaRenderError(
                    err instanceof Error
                        ? err.message
                        : `Render function threw for type "${tree.type}"`,
                    tree,
                    tree.type,
                    err
                );
            }
        }
        // Fallback (no resolver registered for this type): em-dash placeholder.
        if (value === undefined || value === null) {
            return html`<span>—</span>`;
        }
        const display =
            typeof value === "string" ? value : JSON.stringify(value);
        return html`<span>${display}</span>`;
    }

    private applyWidgetProperties(
        el: Element,
        tree: WalkedField,
        value: unknown,
        change: (next: unknown) => void,
        path: string
    ): void {
        Reflect.set(el, "tree", tree);
        Reflect.set(el, "value", value);
        Reflect.set(el, "readOnly", this.readOnly);
        Reflect.set(el, "path", path);
        Reflect.set(el, "meta", tree.meta);
        Reflect.set(el, "constraints", tree.constraints);
        Reflect.set(el, "change", change);
    }

    private buildDiagnostics(): DiagnosticsOptions {
        const opts: DiagnosticsOptions = {};
        if (this.onDiagnostic !== undefined) {
            opts.diagnostics = this.onDiagnostic;
        }
        if (this.strict) {
            opts.strict = true;
        }
        return opts;
    }
}

// Note: this resolver-key lookup is duplicated from `typeToKey` in
// `core/renderer.ts` to satisfy the layer-boundary lint without
// taking a runtime dependency on a generic-over-output `typeToKey`
// (which doesn't exist on the React-shaped `ComponentResolver`).
function litResolverKey(type: WalkedField["type"]): keyof LitComponentResolver {
    switch (type) {
        case "string":
        case "number":
        case "boolean":
        case "null":
        case "enum":
        case "object":
        case "array":
        case "tuple":
        case "record":
        case "union":
        case "discriminatedUnion":
        case "conditional":
        case "negation":
        case "literal":
        case "file":
        case "never":
        case "unknown":
            return type;
    }
}
