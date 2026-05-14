/**
 * HTML renderer — produces semantic HTML from schemas using the typed `h()` builder.
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
import { walk, type WalkOptions } from "../core/walker.ts";
import { getHtmlRenderFn, mergeHtmlResolvers } from "../core/renderer.ts";
import type { HtmlRenderProps, HtmlResolver } from "../core/renderer.ts";
import {
    h,
    serialize,
    raw,
    type HtmlNode,
    type HtmlAttributes,
} from "./html.ts";
import {
    buildInputId,
    ariaRequiredAttrs,
    ariaDescribedByAttrs,
    ariaReadonlyAttrs,
    ariaLabelAttrs,
    buildHintElement,
    requiredIndicator,
} from "./a11y.ts";

// ---------------------------------------------------------------------------
// HTML resolver interface (re-exported for backward compatibility)
// ---------------------------------------------------------------------------

// HtmlRenderProps, HtmlRenderFunction, HtmlResolver are in core/renderer.ts.
// Re-exported from this module for backward compatibility.

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

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
// Default HTML renderers — all use h() builder
// ---------------------------------------------------------------------------

function renderStringHtml(props: HtmlRenderProps): string {
    if (props.readOnly) {
        return serialize(renderStringReadOnly(props));
    }
    return serialize(renderStringEditable(props));
}

function renderStringReadOnly(props: HtmlRenderProps): HtmlNode {
    const strValue = typeof props.value === "string" ? props.value : undefined;
    if (strValue === undefined || strValue.length === 0) {
        return h(
            "span",
            { class: "sc-value sc-value--empty", ...ariaReadonlyAttrs() },
            "\u2014"
        );
    }
    const format = props.constraints.format;
    if (format === "email") {
        return h(
            "a",
            {
                class: "sc-value",
                href: `mailto:${strValue}`,
                ...ariaReadonlyAttrs(),
            },
            strValue
        );
    }
    if (format === "uri" || format === "url") {
        return h(
            "a",
            { class: "sc-value", href: strValue, ...ariaReadonlyAttrs() },
            strValue
        );
    }
    return h("span", { class: "sc-value", ...ariaReadonlyAttrs() }, strValue);
}

function renderStringEditable(props: HtmlRenderProps): HtmlNode {
    const strValue = typeof props.value === "string" ? props.value : "";
    const inputType =
        props.constraints.format === "email"
            ? "email"
            : props.constraints.format === "uri"
              ? "url"
              : "text";
    const id = props.path;

    const attrs: HtmlAttributes = {
        class: "sc-input",
        id,
        type: inputType,
        name: id,
    };

    if (!props.writeOnly) {
        attrs.value = strValue;
    }
    if (typeof props.meta.description === "string") {
        attrs.placeholder = props.meta.description;
    }
    if (props.constraints.minLength !== undefined) {
        attrs.minlength = String(props.constraints.minLength);
    }
    if (props.constraints.maxLength !== undefined) {
        attrs.maxlength = String(props.constraints.maxLength);
    }

    Object.assign(attrs, ariaRequiredAttrs(props.tree));
    Object.assign(attrs, ariaDescribedByAttrs(id, props.constraints));

    return h("input", attrs);
}

function renderNumberHtml(props: HtmlRenderProps): string {
    if (props.readOnly) {
        return serialize(renderNumberReadOnly(props));
    }
    return serialize(renderNumberEditable(props));
}

function renderNumberReadOnly(props: HtmlRenderProps): HtmlNode {
    if (typeof props.value !== "number") {
        return h(
            "span",
            { class: "sc-value sc-value--empty", ...ariaReadonlyAttrs() },
            "\u2014"
        );
    }
    return h(
        "span",
        { class: "sc-value", ...ariaReadonlyAttrs() },
        props.value.toLocaleString()
    );
}

function renderNumberEditable(props: HtmlRenderProps): HtmlNode {
    const numValue = typeof props.value === "number" ? String(props.value) : "";
    const id = props.path;

    const attrs: HtmlAttributes = {
        class: "sc-input",
        id,
        type: "number",
        name: id,
    };

    if (!props.writeOnly) {
        attrs.value = numValue;
    }
    if (props.constraints.minimum !== undefined) {
        attrs.min = String(props.constraints.minimum);
    }
    if (props.constraints.maximum !== undefined) {
        attrs.max = String(props.constraints.maximum);
    }

    Object.assign(attrs, ariaRequiredAttrs(props.tree));
    Object.assign(attrs, ariaDescribedByAttrs(id, props.constraints));

    return h("input", attrs);
}

function renderBooleanHtml(props: HtmlRenderProps): string {
    if (props.readOnly) {
        return serialize(renderBooleanReadOnly(props));
    }
    return serialize(renderBooleanEditable(props));
}

function renderBooleanReadOnly(props: HtmlRenderProps): HtmlNode {
    if (typeof props.value !== "boolean") {
        return h(
            "span",
            { class: "sc-value sc-value--empty", ...ariaReadonlyAttrs() },
            "\u2014"
        );
    }
    return h(
        "span",
        { class: "sc-value sc-value--boolean", ...ariaReadonlyAttrs() },
        props.value ? "Yes" : "No"
    );
}

function renderBooleanEditable(props: HtmlRenderProps): HtmlNode {
    const id = props.path;

    const attrs: HtmlAttributes = {
        class: "sc-input",
        id,
        type: "checkbox",
        name: id,
    };

    if (props.value === true) {
        attrs.checked = true;
    }

    Object.assign(attrs, ariaRequiredAttrs(props.tree));
    Object.assign(attrs, ariaLabelAttrs(props.meta.description));

    return h("input", attrs);
}

function renderEnumHtml(props: HtmlRenderProps): string {
    if (props.readOnly) {
        return serialize(renderEnumReadOnly(props));
    }
    return serialize(renderEnumEditable(props));
}

function renderEnumReadOnly(props: HtmlRenderProps): HtmlNode {
    const enumValue = typeof props.value === "string" ? props.value : "";
    if (enumValue.length === 0) {
        return h(
            "span",
            { class: "sc-value sc-value--empty", ...ariaReadonlyAttrs() },
            "\u2014"
        );
    }
    return h("span", { class: "sc-value", ...ariaReadonlyAttrs() }, enumValue);
}

function renderEnumEditable(props: HtmlRenderProps): HtmlNode {
    const enumValue = typeof props.value === "string" ? props.value : "";
    const id = props.path;
    const selectedValue = props.writeOnly ? "" : enumValue;

    const optionNodes = [
        h("option", { value: "" }, "Select\u2026"),
        ...(props.enumValues ?? []).map((v) => {
            const attrs: HtmlAttributes = { value: v };
            if (v === selectedValue) {
                attrs.selected = true;
            }
            return h("option", attrs, v);
        }),
    ];

    const selectAttrs: HtmlAttributes = {
        class: "sc-input",
        id,
        name: id,
    };

    Object.assign(selectAttrs, ariaRequiredAttrs(props.tree));

    return h("select", selectAttrs, ...optionNodes);
}

function renderObjectHtml(props: HtmlRenderProps): string {
    return serialize(renderObjectNode(props));
}

function renderObjectNode(props: HtmlRenderProps): HtmlNode {
    const fields = props.fields;
    if (fields === undefined) return "";

    const isRecord = (v: unknown): v is Record<string, unknown> =>
        typeof v === "object" && v !== null && !Array.isArray(v);
    const obj = isRecord(props.value) ? props.value : {};

    const descriptionText =
        typeof props.meta.description === "string"
            ? props.meta.description
            : undefined;
    const legend =
        descriptionText !== undefined
            ? h("legend", {}, descriptionText)
            : undefined;

    if (props.readOnly) {
        const children: HtmlNode[] = [];
        if (legend !== undefined) children.push(legend);

        for (const [key, field] of Object.entries(fields)) {
            const label =
                typeof field.meta.description === "string"
                    ? field.meta.description
                    : key;
            const childValue = obj[key];
            const childHtml = props.renderChild(field, childValue, key);
            children.push(h("dt", { class: "sc-label" }, label));
            children.push(h("dd", { class: "sc-value" }, raw(childHtml)));
        }

        const dlAttrs: HtmlAttributes = { class: "sc-object" };
        Object.assign(dlAttrs, ariaLabelAttrs(descriptionText));
        return h("dl", dlAttrs, ...children);
    }

    const children: HtmlNode[] = [];
    if (legend !== undefined) children.push(legend);

    for (const [key, field] of Object.entries(fields)) {
        const label =
            typeof field.meta.description === "string"
                ? field.meta.description
                : key;
        const fieldId = buildInputId(props.path, key);
        const childValue = obj[key];
        const childHtml = props.renderChild(field, childValue, key);
        const required = requiredIndicator(field);

        const labelContent: HtmlNode[] = [label];
        if (required !== undefined) labelContent.push(required);

        const fieldChildren: HtmlNode[] = [
            h("label", { class: "sc-label", for: fieldId }, ...labelContent),
            raw(childHtml),
        ];
        // Hint element for the field's constraints.
        // Uses key as the base ID, matching the child's props.path.
        const hint = buildHintElement(key, field.constraints);
        if (hint !== undefined) fieldChildren.push(hint);

        children.push(h("div", { class: "sc-field" }, ...fieldChildren));
    }

    const fieldsetAttrs: HtmlAttributes = { class: "sc-object" };
    Object.assign(fieldsetAttrs, ariaLabelAttrs(descriptionText));
    return h("fieldset", fieldsetAttrs, ...children);
}

function renderArrayHtml(props: HtmlRenderProps): string {
    return serialize(renderArrayNode(props));
}

function renderArrayNode(props: HtmlRenderProps): HtmlNode {
    const arr = Array.isArray(props.value) ? props.value : [];
    const element = props.element;
    if (element === undefined) return "";

    const items = arr.map((item) => {
        const childHtml = props.renderChild(element, item);
        return h("li", { class: "sc-item" }, raw(childHtml));
    });

    if (props.readOnly) {
        return h("ul", { class: "sc-array" }, ...items);
    }

    // Editable: wrap each item in a div
    const divItems = arr.map((item) => {
        const childHtml = props.renderChild(element, item);
        return h("div", {}, raw(childHtml));
    });
    return h("div", { class: "sc-array" }, ...divItems);
}

function renderRecordHtml(props: HtmlRenderProps): string {
    return serialize(renderRecordNode(props));
}

function renderRecordNode(props: HtmlRenderProps): HtmlNode {
    const isRecord = (v: unknown): v is Record<string, unknown> =>
        typeof v === "object" && v !== null && !Array.isArray(v);
    const obj = isRecord(props.value) ? props.value : {};
    const valueType = props.valueType;
    if (valueType === undefined) return "";

    const attrs: HtmlAttributes = { class: "sc-record", role: "group" };

    if (props.readOnly) {
        const children: HtmlNode[] = [];
        for (const [key, val] of Object.entries(obj)) {
            const childHtml = props.renderChild(valueType, val, key);
            children.push(h("dt", { class: "sc-label" }, key));
            children.push(h("dd", { class: "sc-value" }, raw(childHtml)));
        }
        return h("dl", attrs, ...children);
    }

    const children: HtmlNode[] = [];
    for (const [key, val] of Object.entries(obj)) {
        const childHtml = props.renderChild(valueType, val, key);
        children.push(
            h(
                "div",
                { class: "sc-field" },
                h("label", { class: "sc-label" }, key),
                raw(childHtml)
            )
        );
    }
    return h("div", attrs, ...children);
}

function renderLiteralHtml(props: HtmlRenderProps): string {
    const values = props.tree.literalValues;
    if (values === undefined || values.length === 0) {
        return serialize(
            h("span", { class: "sc-value sc-value--empty" }, "\u2014")
        );
    }
    const display = values
        .map((v) => (v === null ? "null" : String(v)))
        .join(", ");
    return serialize(h("span", { class: "sc-value" }, display));
}

function renderUnionHtml(props: HtmlRenderProps): string {
    const options = props.options;
    if (options === undefined || options.length === 0) {
        if (props.value === undefined || props.value === null) {
            return serialize(
                h("span", { class: "sc-value sc-value--empty" }, "\u2014")
            );
        }
        return serialize(
            h("span", { class: "sc-value" }, JSON.stringify(props.value))
        );
    }

    const matched = matchUnionOption(options, props.value);
    if (matched !== undefined) {
        return props.renderChild(matched, props.value);
    }

    const firstOption = options[0];
    if (firstOption !== undefined) {
        return props.renderChild(firstOption, props.value);
    }
    return serialize(
        h("span", { class: "sc-value sc-value--empty" }, "\u2014")
    );
}

function renderUnknownHtml(props: HtmlRenderProps): string {
    if (props.readOnly) {
        if (props.value === undefined || props.value === null) {
            return serialize(
                h("span", { class: "sc-value sc-value--empty" }, "\u2014")
            );
        }
        if (typeof props.value === "string") {
            return serialize(h("span", { class: "sc-value" }, props.value));
        }
        return serialize(
            h("span", { class: "sc-value" }, JSON.stringify(props.value))
        );
    }

    const strValue = typeof props.value === "string" ? props.value : "";
    const name = props.path;

    const attrs: HtmlAttributes = {
        class: "sc-input",
        type: "text",
        name,
    };
    if (!props.writeOnly) {
        attrs.value = strValue;
    }

    return serialize(h("input", attrs));
}

// ---------------------------------------------------------------------------
// Union matching heuristic
// ---------------------------------------------------------------------------

function matchUnionOption(
    options: WalkedField[],
    value: unknown
): WalkedField | undefined {
    if (typeof value === "string") {
        return options.find((o) => o.type === "string" || o.type === "enum");
    }
    if (typeof value === "number") {
        return options.find((o) => o.type === "number");
    }
    if (typeof value === "boolean") {
        return options.find((o) => o.type === "boolean");
    }
    if (Array.isArray(value)) {
        return options.find((o) => o.type === "array");
    }
    if (typeof value === "object" && value !== null) {
        return options.find((o) => o.type === "object");
    }
    return undefined;
}

// ---------------------------------------------------------------------------
// Default resolver
// ---------------------------------------------------------------------------

export const defaultHtmlResolver: HtmlResolver = {
    string: renderStringHtml,
    number: renderNumberHtml,
    boolean: renderBooleanHtml,
    enum: renderEnumHtml,
    object: renderObjectHtml,
    array: renderArrayHtml,
    record: renderRecordHtml,
    literal: renderLiteralHtml,
    union: renderUnionHtml,
    unknown: renderUnknownHtml,
};

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

    const renderChild = (
        childTree: WalkedField,
        childValue: unknown,
        pathSuffix?: string
    ): string => {
        const childPath = pathSuffix ?? childTree.meta.description ?? "";
        return renderFieldHtml(
            childTree,
            childValue,
            resolver,
            childPath,
            renderChild
        );
    };

    return renderFieldHtml(tree, options.value, resolver, "", renderChild);
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
    const mergedResolver = mergeHtmlResolvers(resolver, defaultHtmlResolver);
    const renderFn = getHtmlRenderFn(tree.type, mergedResolver);

    if (renderFn !== undefined) {
        const props: HtmlRenderProps = {
            value,
            readOnly: tree.editability === "presentation",
            writeOnly: tree.editability === "input",
            meta: tree.meta,
            constraints: tree.constraints,
            path,
            tree,
            renderChild,
        };
        if (tree.enumValues !== undefined) props.enumValues = tree.enumValues;
        if (tree.element !== undefined) props.element = tree.element;
        if (tree.fields !== undefined) props.fields = tree.fields;
        if (tree.options !== undefined) props.options = tree.options;
        if (tree.discriminator !== undefined)
            props.discriminator = tree.discriminator;
        if (tree.keyType !== undefined) props.keyType = tree.keyType;
        if (tree.valueType !== undefined) props.valueType = tree.valueType;

        return renderFn(props);
    }

    // Fallback for unhandled types
    if (value === undefined || value === null) {
        return serialize(
            h("span", { class: "sc-value sc-value--empty" }, "\u2014")
        );
    }
    return serialize(
        h(
            "span",
            { class: "sc-value" },
            typeof value === "string" ? value : JSON.stringify(value)
        )
    );
}

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

export type {
    HtmlRenderProps,
    HtmlRenderFunction,
    HtmlResolver,
} from "../core/renderer.ts";
