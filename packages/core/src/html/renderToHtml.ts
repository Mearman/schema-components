/**
 * HTML renderer entry point — produces semantic HTML from schemas.
 *
 * Framework-agnostic alternative to the React rendering pipeline.
 * Uses the same walker and adapter (normalise → walk → render) but
 * outputs HTML strings instead of ReactNode.
 *
 * All HTML construction goes through `h()` from `html.ts`, which gives
 * compile-time tag/attribute checking and automatic escaping.
 *
 * Usage:
 *   import { renderToHtml } from "schema-components/html/renderToHtml";
 *   const html = renderToHtml(userSchema, { value: userData });
 *
 * Custom resolver:
 *   const html = renderToHtml(schema, {
 *     value,
 *     resolver: { string: (props) => h("b", {}, String(props.value)) },
 *   });
 */

import { normaliseSchema } from "../core/adapter.ts";
import type { SchemaMeta, WalkedField } from "../core/types.ts";
import { walk } from "../core/walker.ts";
import type { WalkOptions } from "../core/walkBuilders.ts";
import { getHtmlRenderFn, mergeHtmlResolvers } from "../core/renderer.ts";
import type { HtmlRenderProps, HtmlResolver } from "../core/renderer.ts";
import { h, serialize } from "./html.ts";
import { defaultHtmlResolver } from "./renderers.ts";

// ---------------------------------------------------------------------------
// HTML resolver interface (re-exported for backward compatibility)
// ---------------------------------------------------------------------------

// HtmlRenderProps, HtmlRenderFunction, HtmlResolver are in core/renderer.ts.
// Import directly: import type { HtmlRenderProps } from "schema-components/core/renderer";

export interface RenderToHtmlOptions {
    /** The data value to render. */
    value?: unknown;
    /** For OpenAPI: a ref string like "#/components/schemas/User". */
    ref?: string;
    /** Per-field meta overrides. */
    fields?: Record<string, unknown>;
    /** Meta overrides applied to the root schema. */
    meta?: SchemaMeta;
    /** Force all fields read-only. */
    readOnly?: boolean;
    /** Force all fields as inputs. */
    writeOnly?: boolean;
    /** Root description. */
    description?: string;
    /** Custom HTML resolver. Falls back to defaultHtmlResolver. */
    resolver?: HtmlResolver;
}

// ---------------------------------------------------------------------------
// renderToHtml — main entry point
// ---------------------------------------------------------------------------

/**
 * Render a schema to an HTML string.
 *
 * @param schema - Zod schema, JSON Schema, or OpenAPI document
 * @param options - Value, overrides, and resolver options
 * @returns Semantic HTML string with `sc-` prefixed classes
 */
export function renderToHtml(
    schema: unknown,
    options: RenderToHtmlOptions = {}
): string {
    const mergedMeta: SchemaMeta = { ...options.meta };
    if (options.readOnly === true) mergedMeta.readOnly = true;
    if (options.writeOnly === true) mergedMeta.writeOnly = true;
    if (options.description !== undefined)
        mergedMeta.description = options.description;

    const normalised = normaliseSchema(schema, options.ref);
    const { jsonSchema, rootMeta, rootDocument } = normalised;

    const walkOptions: WalkOptions = {
        componentMeta: mergedMeta,
        rootMeta,
        fieldOverrides: options.fields,
        rootDocument,
    };

    const tree = walk(jsonSchema, walkOptions);
    const resolver = options.resolver ?? defaultHtmlResolver;

    // Depth limit prevents infinite recursion on circular schema references
    const MAX_HTML_DEPTH = 10;
    const makeRenderChild =
        (currentDepth: number) =>
        (
            childTree: WalkedField,
            childValue: unknown,
            pathSuffix?: string
        ): string => {
            if (currentDepth >= MAX_HTML_DEPTH) {
                const label =
                    typeof childTree.meta.description === "string"
                        ? childTree.meta.description
                        : "schema";
                return `<fieldset class="sc-recursive"><em>\u21bb ${label} (recursive)</em></fieldset>`;
            }
            const childPath = pathSuffix ?? childTree.meta.description ?? "";
            return renderFieldHtml(
                childTree,
                childValue,
                resolver,
                childPath,
                makeRenderChild(currentDepth + 1)
            );
        };

    const renderChild = makeRenderChild(0);

    const effectiveValue = options.value ?? tree.defaultValue;
    return renderFieldHtml(tree, effectiveValue, resolver, "", renderChild);
}

// ---------------------------------------------------------------------------
// Field rendering
// ---------------------------------------------------------------------------

function renderFieldHtml(
    tree: WalkedField,
    value: unknown,
    resolver: HtmlResolver,
    path: string,
    renderChild: (tree: WalkedField, value: unknown) => string
): string {
    // Visibility check — hidden fields render nothing
    if (tree.meta.visible === false) return "";

    const effectiveValue = value ?? tree.defaultValue;
    const mergedResolver = mergeHtmlResolvers(resolver, defaultHtmlResolver);
    const renderFn = getHtmlRenderFn(tree.type, mergedResolver);

    if (renderFn !== undefined) {
        const props: HtmlRenderProps = {
            value: effectiveValue,
            readOnly: tree.editability === "presentation",
            writeOnly: tree.editability === "input",
            meta: tree.meta,
            constraints: tree.constraints,
            path,
            tree,
            renderChild,
        };
        if (tree.type === "enum") props.enumValues = tree.enumValues;
        if (tree.type === "array" && tree.element !== undefined)
            props.element = tree.element;
        if (tree.type === "object") props.fields = tree.fields;
        if (tree.type === "union" || tree.type === "discriminatedUnion")
            props.options = tree.options;
        if (tree.type === "discriminatedUnion")
            props.discriminator = tree.discriminator;
        if (tree.type === "record") props.keyType = tree.keyType;
        if (tree.type === "record") props.valueType = tree.valueType;
        if (tree.type === "tuple") props.prefixItems = tree.prefixItems;
        if (tree.type === "conditional") props.ifClause = tree.ifClause;
        if (tree.type === "conditional" && tree.thenClause !== undefined)
            props.thenClause = tree.thenClause;
        if (tree.type === "conditional" && tree.elseClause !== undefined)
            props.elseClause = tree.elseClause;
        if (tree.type === "negation") props.negated = tree.negated;
        if (tree.type === "literal") props.literalValues = tree.literalValues;
        if (tree.examples !== undefined) props.examples = tree.examples;

        return renderFn(props);
    }

    // Fallback for unhandled types
    if (effectiveValue === undefined || effectiveValue === null) {
        return serialize(
            h("span", { class: "sc-value sc-value--empty" }, "\u2014")
        );
    }
    return serialize(
        h(
            "span",
            { class: "sc-value" },
            typeof effectiveValue === "string"
                ? effectiveValue
                : JSON.stringify(effectiveValue)
        )
    );
}

// Import types directly from core/renderer.ts
