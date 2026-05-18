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
import { MAX_RENDER_DEPTH } from "../core/limits.ts";
import type { SchemaMeta, WalkedField } from "../core/types.ts";
import { walk } from "../core/walker.ts";
import type { WalkOptions } from "../core/walkBuilders.ts";
import { getHtmlRenderFn, mergeHtmlResolvers } from "../core/renderer.ts";
import type { HtmlRenderProps, HtmlResolver } from "../core/renderer.ts";
import { defaultHtmlResolver } from "./renderers.ts";
import { joinPath } from "./a11y.ts";
import { h, serialize } from "./html.ts";

/**
 * Build the recursion-cap sentinel element used when the renderer
 * encounters circular schema references. The label is interpolated via
 * `h()` + `serialize` so any HTML in `meta.description` (which is
 * schema-author content but can equally be sourced from user-supplied
 * JSON Schema input) is escaped — never interpolated into raw markup.
 *
 * @group HTML
 */
export function recursionSentinelHtml(label: string): string {
    return serialize(
        h(
            "fieldset",
            { class: "sc-recursive" },
            h("em", {}, `↻ ${label} (recursive)`)
        )
    );
}

// ---------------------------------------------------------------------------
// HTML resolver interface
// ---------------------------------------------------------------------------

// HtmlRenderProps, HtmlRenderFunction, HtmlResolver are in core/renderer.ts.
// Import directly: import type { HtmlRenderProps } from "schema-components/core/renderer";

/**
 * Options accepted by {@link renderToHtml}.
 *
 * @group HTML
 */
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
 * Render a schema to a semantic HTML string.
 *
 * Framework-agnostic alternative to the React rendering pipeline.
 * Shares the same normalise → walk → render pipeline, but emits
 * escaped HTML with `sc-` prefixed classes rather than ReactNodes.
 * Pass `resolver` to plug in a custom HTML renderer.
 *
 * @group HTML
 * @param schema - Zod schema, JSON Schema, or OpenAPI document
 * @param options - Value, overrides, and resolver options
 * @returns Semantic HTML string with `sc-` prefixed classes
 * @example
 * ```tsx
 * import { renderToHtml } from "schema-components/html/renderToHtml";
 *
 * const html = renderToHtml(userSchema, { value: user, readOnly: true });
 * ```
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
    const makeRenderChild =
        (currentDepth: number, parentPath: string) =>
        (
            childTree: WalkedField,
            childValue: unknown,
            pathSuffix?: string
        ): string => {
            if (currentDepth >= MAX_RENDER_DEPTH) {
                const label =
                    typeof childTree.meta.description === "string"
                        ? childTree.meta.description
                        : "schema";
                return recursionSentinelHtml(label);
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
    // `mergeHtmlResolvers` fills every `RESOLVER_KEYS` entry from
    // `defaultHtmlResolver`, and `typeToKey` maps every `WalkedField['type']`
    // to one of those keys, so the lookup is total. The guard below exists to
    // narrow the type for TypeScript and to fail loudly if the invariant ever
    // breaks (e.g. a future `WalkedField` variant added without registering a
    // default renderer).
    const renderFn = getHtmlRenderFn(tree.type, mergedResolver);
    if (renderFn === undefined) {
        throw new Error(
            `renderToHtml: no HTML renderer registered for type "${tree.type}"`
        );
    }

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
