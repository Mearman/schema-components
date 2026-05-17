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
import { joinPath } from "./a11y.ts";

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

    // Depth limit prevents infinite recursion on circular schema references.
    // `parentPath` flows through the closure so each child path is derived
    // from its structural position (property key, array index) joined to the
    // parent \u2014 never from a description fallback that would collide across
    // sibling fields without metadata.
    const MAX_HTML_DEPTH = 10;
    const makeRenderChild =
        (currentDepth: number, parentPath: string) =>
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
            const childPath = joinPath(parentPath, pathSuffix);
            return renderFieldHtml(
                childTree,
                childValue,
                resolver,
                childPath,
                makeRenderChild(currentDepth + 1, childPath)
            );
        };

    const renderChild = makeRenderChild(0, "");

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
