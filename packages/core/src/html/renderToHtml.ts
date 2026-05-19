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
 *
 * ```ts
 * import { renderToHtml } from "schema-components/html/renderToHtml";
 * const html = renderToHtml(userSchema, { value: userData });
 * ```
 *
 * Custom resolver:
 *
 * ```ts
 * const html = renderToHtml(schema, {
 *   value,
 *   resolver: { string: (props) => h("b", {}, String(props.value)) },
 * });
 * ```
 */

import { normaliseSchema, type SchemaIoSide } from "../core/adapter.ts";
import type { SchemaMeta, WalkedField } from "../core/types.ts";
import { walk } from "../core/walker.ts";
import type { WalkOptions } from "../core/walkBuilders.ts";
import { getHtmlRenderFn, mergeHtmlResolvers } from "../core/renderer.ts";
import type { HtmlRenderProps, HtmlResolver } from "../core/renderer.ts";
import { dispatchRenderField } from "../core/renderField.ts";
import type { RejectUnrepresentableZod } from "../core/typeInference.ts";
import { toRecordOrUndefined } from "../core/guards.ts";
import type { InferFields, InferredValue } from "../core/inferValue.ts";
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
 * The generic parameters mirror `<SchemaComponent>` so a typed
 * `schema` argument drives typed `value`, `ref`, and `fields` options.
 *
 * @group HTML
 */
export interface RenderToHtmlOptions<
    T = unknown,
    Ref extends string | undefined = undefined,
    Mode extends SchemaIoSide = "output",
> {
    /**
     * The data value to render. Typed against `InferredValue<T, Ref, undefined, Mode>`
     * so a typed `schema` argument drives the rendered value's shape.
     */
    value?: InferredValue<T, Ref, undefined, Mode>;
    /** For OpenAPI: a ref string like "#/components/schemas/User". */
    ref?: Ref;
    /**
     * Per-field meta overrides — nested object mirroring schema shape.
     * Typed against {@link InferFields} so a typed `schema` argument
     * drives autocomplete on the override map.
     */
    fields?: InferFields<T, Ref>;
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
export function renderToHtml<
    T = unknown,
    Ref extends string | undefined = undefined,
    Mode extends SchemaIoSide = "output",
>(
    schema: RejectUnrepresentableZod<T>,
    options: RenderToHtmlOptions<T, Ref, Mode> = {}
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
        fieldOverrides: toRecordOrUndefined(options.fields),
        rootDocument,
    };

    const tree = walk(jsonSchema, walkOptions);
    const resolver = options.resolver ?? defaultHtmlResolver;

    // `parentPath` flows through the closure so each child path is derived
    // from its structural position (property key, array index) joined to the
    // parent \u2014 never from a description fallback that would collide across
    // sibling fields without metadata. The recursion depth cap lives in
    // `dispatchRenderField` and is threaded through `renderFieldHtml`'s
    // `depth` argument.
    const makeRenderChild =
        (currentDepth: number, parentPath: string) =>
        (
            childTree: WalkedField,
            childValue: unknown,
            pathSuffix?: string
        ): string => {
            const childPath = joinPath(parentPath, pathSuffix);
            return renderFieldHtml(
                childTree,
                childValue,
                resolver,
                childPath,
                makeRenderChild(currentDepth + 1, childPath),
                currentDepth + 1
            );
        };

    const renderChild = makeRenderChild(0, "");

    const effectiveValue = options.value ?? tree.defaultValue;
    return renderFieldHtml(tree, effectiveValue, resolver, "", renderChild, 0);
}

// ---------------------------------------------------------------------------
// Field rendering — thin HTML-flavoured wrapper around the
// framework-agnostic `dispatchRenderField` dispatcher.
// ---------------------------------------------------------------------------

function renderFieldHtml(
    tree: WalkedField,
    value: unknown,
    resolver: HtmlResolver,
    path: string,
    renderChild: (tree: WalkedField, value: unknown) => string,
    depth = 0
): string {
    // Visibility check — hidden fields render nothing. Performed
    // outside the dispatcher because the empty-string output is a
    // structural feature of the HTML adapter; the dispatcher's
    // dispatch chain only runs for visible fields.
    if (tree.meta.visible === false) return "";

    const effectiveValue = value ?? tree.defaultValue;
    const mergedResolver = mergeHtmlResolvers(resolver, defaultHtmlResolver);

    return dispatchRenderField<HtmlRenderProps, string, HtmlResolver>({
        tree,
        value: effectiveValue,
        path,
        depth,
        resolver: mergedResolver,
        config: {
            buildProps: (fieldTree, fieldPath) => {
                const props: HtmlRenderProps = {
                    value: effectiveValue,
                    readOnly: fieldTree.editability === "presentation",
                    writeOnly: fieldTree.editability === "input",
                    meta: fieldTree.meta,
                    constraints: fieldTree.constraints,
                    path: fieldPath,
                    tree: fieldTree,
                    renderChild,
                };
                if (fieldTree.examples !== undefined)
                    props.examples = fieldTree.examples;
                return props;
            },
            lookupRenderFn: (type, htmlResolver) =>
                getHtmlRenderFn(type, htmlResolver),
            recursionSentinel: (fieldTree) => {
                const label =
                    typeof fieldTree.meta.description === "string"
                        ? fieldTree.meta.description
                        : "schema";
                return recursionSentinelHtml(label);
            },
            // `mergeHtmlResolvers` fills every `RESOLVER_KEYS` entry
            // from `defaultHtmlResolver`, and `typeToKey` maps every
            // `WalkedField['type']` to one of those keys, so the
            // lookup is total. Hitting this fallback signals an
            // invariant breakage — a future `WalkedField` variant
            // added without registering a default renderer — and we
            // surface it loudly rather than emitting silent empty
            // output, matching the historic guard inside
            // `renderFieldHtml`.
            fallback: (fieldTree) => {
                throw new Error(
                    `renderToHtml: no HTML renderer registered for type "${fieldTree.type}"`
                );
            },
            // HTML renderers always return strings. Narrow once;
            // any other shape falls through to the adapter's
            // `fallback`, which throws.
            coerceResult: (result) =>
                typeof result === "string" ? result : undefined,
        },
    });
}
