/**
 * HTML renderer functions — produce semantic HTML from WalkedField trees.
 *
 * Each renderer handles a specific field type (string, number, object,
 * etc.) and produces either a read-only presentation or an editable
 * input using the typed `h()` builder.
 */

import type { WalkedField } from "../core/types.ts";
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
// Date/time input type mapping
// ---------------------------------------------------------------------------

export function dateInputType(format: string | undefined): string | undefined {
    if (format === "date") return "date";
    if (format === "time") return "time";
    if (format === "date-time" || format === "datetime")
        return "datetime-local";
    return undefined;
}

// ---------------------------------------------------------------------------
// ID normalisation — dots and brackets become hyphens for valid HTML IDs
// ---------------------------------------------------------------------------

/**
 * Normalise a structural path into a valid, `sc-` prefixed HTML ID.
 * Dots (object nesting) and brackets (array indices) become hyphens so
 * the id remains a valid CSS selector and predictable in test queries.
 */
export function fieldId(path: string): string {
    return `sc-${path.replace(/[.[\]]+/g, "-").replace(/-+$/g, "")}`;
}

// ---------------------------------------------------------------------------
// String renderers
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
    const format = props.constraints.format;
    const dateType = dateInputType(format);
    const inputType =
        dateType ??
        (format === "email" ? "email" : format === "uri" ? "url" : "text");
    const id = fieldId(props.path);

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

// ---------------------------------------------------------------------------
// Number renderers
// ---------------------------------------------------------------------------

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
    const id = fieldId(props.path);

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

// ---------------------------------------------------------------------------
// Boolean renderers
// ---------------------------------------------------------------------------

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
    const id = fieldId(props.path);

    const attrs: HtmlAttributes = {
        class: "sc-input",
        id,
        type: "checkbox",
        name: id,
    };

    if (!props.writeOnly && props.value === true) {
        attrs.checked = true;
    }

    Object.assign(attrs, ariaRequiredAttrs(props.tree));
    Object.assign(attrs, ariaLabelAttrs(props.meta.description));

    return h("input", attrs);
}

// ---------------------------------------------------------------------------
// Enum renderers
// ---------------------------------------------------------------------------

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
    const id = fieldId(props.path);
    const selectedValue = props.writeOnly ? "" : enumValue;

    const optionNodes = [
        h("option", { value: "" }, "Select\u2026"),
        ...(props.enumValues ?? []).map((v) => {
            const display =
                v === null ? "null" : typeof v === "string" ? v : String(v);
            const attrs: HtmlAttributes = { value: display };
            if (display === selectedValue) {
                attrs.selected = true;
            }
            return h("option", attrs, display);
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

// ---------------------------------------------------------------------------
// Object renderer
// ---------------------------------------------------------------------------

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

    const sortedEntries = Object.entries(fields)
        .sort((a, b) => {
            const orderA =
                typeof a[1].meta.order === "number"
                    ? a[1].meta.order
                    : Infinity;
            const orderB =
                typeof b[1].meta.order === "number"
                    ? b[1].meta.order
                    : Infinity;
            return orderA - orderB;
        })
        .filter(([, field]) => field.meta.visible !== false);

    if (props.readOnly) {
        const children: HtmlNode[] = [];
        if (legend !== undefined) children.push(legend);

        for (const [key, field] of sortedEntries) {
            const label =
                typeof field.meta.description === "string"
                    ? field.meta.description
                    : key;
            const childValue = obj[key];
            // Pass the structural key as a path suffix — `renderChild`
            // joins it to the parent path so every child gets a unique id.
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

    for (const [key, field] of sortedEntries) {
        const label =
            typeof field.meta.description === "string"
                ? field.meta.description
                : key;
        const fieldId = buildInputId(props.path, key);
        const childValue = obj[key];
        // Pass the structural key as a path suffix — `renderChild`
        // joins it to the parent path so every child gets a unique id.
        const childHtml = props.renderChild(field, childValue, key);
        const required = requiredIndicator(field);

        const labelContent: HtmlNode[] = [label];
        if (required !== undefined) labelContent.push(required);

        const fieldChildren: HtmlNode[] = [
            h("label", { class: "sc-label", for: fieldId }, ...labelContent),
            raw(childHtml),
        ];
        // Hint element for the field's constraints.
        // Uses fieldId (sc-prefixed) as the base ID, matching the child input's id.
        const hint = buildHintElement(fieldId, field.constraints);
        if (hint !== undefined) fieldChildren.push(hint);

        children.push(h("div", { class: "sc-field" }, ...fieldChildren));
    }

    const fieldsetAttrs: HtmlAttributes = { class: "sc-object" };
    Object.assign(fieldsetAttrs, ariaLabelAttrs(descriptionText));
    return h("fieldset", fieldsetAttrs, ...children);
}

// ---------------------------------------------------------------------------
// Array renderer
// ---------------------------------------------------------------------------

function renderArrayHtml(props: HtmlRenderProps): string {
    return serialize(renderArrayNode(props));
}

function renderArrayNode(props: HtmlRenderProps): HtmlNode {
    const arr = Array.isArray(props.value) ? props.value : [];
    const element = props.element;
    if (element === undefined) return "";

    // Render each child once; the readOnly branch only chooses the wrapper
    // element. Pass `[i]` as the path suffix so siblings get unique ids.
    const childHtmls = arr.map((item, i) =>
        props.renderChild(element, item, `[${String(i)}]`)
    );

    if (props.readOnly) {
        const items = childHtmls.map((childHtml) =>
            h("li", { class: "sc-item" }, raw(childHtml))
        );
        return h("ul", { class: "sc-array" }, ...items);
    }

    // Editable: wrap each item in a div
    const divItems = childHtmls.map((childHtml) =>
        h("div", {}, raw(childHtml))
    );
    return h("div", { class: "sc-array" }, ...divItems);
}

// ---------------------------------------------------------------------------
// Record renderer
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Literal renderer
// ---------------------------------------------------------------------------

function renderLiteralHtml(props: HtmlRenderProps): string {
    const values = props.literalValues;
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

// ---------------------------------------------------------------------------
// Union renderer
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Discriminated union renderer
// ---------------------------------------------------------------------------

function renderDiscriminatedUnionHtml(props: HtmlRenderProps): string {
    const options = props.options;
    const discriminator = props.discriminator;
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

    const isRecord = (v: unknown): v is Record<string, unknown> =>
        typeof v === "object" && v !== null && !Array.isArray(v);
    const obj = isRecord(props.value) ? props.value : {};
    const discKey = discriminator ?? "";
    const currentDiscriminatorValue =
        typeof obj[discKey] === "string" ? obj[discKey] : undefined;

    const optionLabels = options.map((opt) => {
        if (opt.type === "object") {
            const discriminatorField = opt.fields[discKey];
            if (discriminatorField?.type === "literal") {
                const constVal = discriminatorField.literalValues[0];
                if (typeof constVal === "string") return constVal;
            }
        }
        return typeof opt.meta.title === "string" ? opt.meta.title : opt.type;
    });

    let activeIndex = 0;
    if (currentDiscriminatorValue !== undefined) {
        const found = optionLabels.indexOf(currentDiscriminatorValue);
        if (found !== -1) activeIndex = found;
    }
    const activeOption = options[activeIndex];

    if (props.readOnly) {
        if (activeOption !== undefined) {
            return props.renderChild(activeOption, props.value);
        }
        return serialize(
            h("span", { class: "sc-value sc-value--empty" }, "\u2014")
        );
    }

    // Editable: WAI-ARIA tabs pattern.
    // Sanitise the base id once so dots/brackets in `props.path` (object
    // nesting, array indices) cannot leak into the tab/panel ids — those
    // would otherwise produce invalid CSS selectors and break the
    // `aria-labelledby` association on the tabpanel.
    const baseId = fieldId(props.path);
    const panelId = `${baseId}-panel`;
    const tabId = (i: number): string => `${baseId}-tab-${String(i)}`;
    const tabButtons = options.map((_opt, i) => {
        const attrs: HtmlAttributes = {
            type: "button",
            role: "tab",
            class: i === activeIndex ? "sc-tab sc-tab--active" : "sc-tab",
            id: tabId(i),
            "aria-selected": i === activeIndex ? "true" : undefined,
            "aria-controls": panelId,
            tabindex: i === activeIndex ? "0" : "-1",
        };
        return h("button", attrs, optionLabels[i]);
    });

    const children: HtmlNode[] = [
        h(
            "div",
            {
                role: "tablist",
                class: "sc-tabs",
                "aria-label": "Select variant",
            },
            ...tabButtons
        ),
    ];

    if (activeOption !== undefined) {
        const childHtml = props.renderChild(activeOption, props.value);
        children.push(
            h(
                "div",
                {
                    role: "tabpanel",
                    id: panelId,
                    "aria-labelledby": tabId(activeIndex),
                },
                raw(childHtml)
            )
        );
    }

    return serialize(
        h("div", { class: "sc-discriminated-union" }, ...children)
    );
}

// ---------------------------------------------------------------------------
// File renderer
// ---------------------------------------------------------------------------

function renderFileHtml(props: HtmlRenderProps): string {
    const id = fieldId(props.path);
    const accept = props.constraints.mimeTypes?.join(",");

    if (props.readOnly) {
        return serialize(
            h(
                "span",
                { class: "sc-value", id, ...ariaReadonlyAttrs() },
                "File field"
            )
        );
    }

    const attrs: HtmlAttributes = {
        class: "sc-input",
        id,
        type: "file",
        name: id,
    };
    if (accept !== undefined) {
        attrs.accept = accept;
    }
    Object.assign(attrs, ariaRequiredAttrs(props.tree));
    if (typeof props.meta.description === "string") {
        Object.assign(attrs, ariaLabelAttrs(props.meta.description));
    }

    return serialize(h("input", attrs));
}

// ---------------------------------------------------------------------------
// Unknown renderer
// ---------------------------------------------------------------------------

function renderRecursiveHtml(props: HtmlRenderProps): string {
    const refTarget = props.refTarget ?? "";
    const label =
        typeof props.meta.description === "string"
            ? props.meta.description
            : refTarget;
    return serialize(
        h("fieldset", { class: "sc-recursive" }, `↻ ${label} (recursive)`)
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
// Tuple rendering
// ---------------------------------------------------------------------------

function renderTupleHtml(props: HtmlRenderProps): string {
    const arr = Array.isArray(props.value) ? props.value : [];
    const prefixItems = props.prefixItems;
    if (prefixItems === undefined) return renderUnknownHtml(props);

    const children: HtmlNode[] = [];
    for (let i = 0; i < prefixItems.length; i++) {
        const itemValue: unknown = arr[i];
        const element = prefixItems[i];
        if (element === undefined) continue;
        const childHtml = props.renderChild(
            element,
            itemValue,
            `[${String(i)}]`
        );
        children.push(
            h(
                "div",
                { class: "sc-tuple-item" },
                h("span", { class: "sc-tuple-index" }, String(i)),
                raw(childHtml)
            )
        );
    }

    return serialize(h("div", { class: "sc-tuple" }, ...children));
}

// ---------------------------------------------------------------------------
// Conditional rendering
// ---------------------------------------------------------------------------

function renderConditionalHtml(props: HtmlRenderProps): string {
    // Conditionals are rendered as the base type with an annotation
    const children: HtmlNode[] = [];

    if (props.ifClause !== undefined) {
        children.push(h("div", { class: "sc-conditional-if" }, raw("if: ...")));
    }
    if (props.thenClause !== undefined) {
        children.push(
            h("div", { class: "sc-conditional-then" }, raw("then: ..."))
        );
    }
    if (props.elseClause !== undefined) {
        children.push(
            h("div", { class: "sc-conditional-else" }, raw("else: ..."))
        );
    }

    return serialize(h("div", { class: "sc-conditional" }, ...children));
}

// ---------------------------------------------------------------------------
// Negation rendering
// ---------------------------------------------------------------------------

function renderNegationHtml(props: HtmlRenderProps): string {
    // Props unused — negation renders a static annotation
    void props;
    return serialize(h("div", { class: "sc-negation" }, raw("not: ...")));
}

// ---------------------------------------------------------------------------
// Union matching heuristic
// ---------------------------------------------------------------------------

export function matchUnionOption(
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
    tuple: renderTupleHtml,
    record: renderRecordHtml,
    literal: renderLiteralHtml,
    union: renderUnionHtml,
    discriminatedUnion: renderDiscriminatedUnionHtml,
    conditional: renderConditionalHtml,
    negation: renderNegationHtml,
    recursive: renderRecursiveHtml,
    file: renderFileHtml,
    unknown: renderUnknownHtml,
};
