/**
 * HTML renderer functions — produce semantic HTML from WalkedField trees.
 *
 * Each renderer handles a specific field type (string, number, object,
 * etc.) and produces either a read-only presentation or an editable
 * input using the typed `h()` builder.
 */

import type { HtmlRenderProps, HtmlResolver } from "../core/renderer.ts";
import { dateInputType } from "../core/formats.ts";
import { sortFieldsByOrder } from "../core/fieldOrder.ts";
import { isSafeHyperlink, isSafeMailtoAddress } from "../core/uri.ts";
import { isObject } from "../core/guards.ts";
import { displayJsonValue } from "../core/walkBuilders.ts";
import {
    matchUnionOption,
    resolveDiscriminatedActive,
} from "../core/unionMatch.ts";
import { fieldDomId, panelIdFor, tabIdFor } from "../core/idPath.ts";
import { SC_CLASSES, EM_DASH, ELLIPSIS } from "../core/cssClasses.ts";
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

export { dateInputType };

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
        return h("span", { class: SC_CLASSES.valueEmpty }, EM_DASH);
    }
    const format = props.constraints.format;
    if (format === "email" && isSafeMailtoAddress(strValue)) {
        return h(
            "a",
            {
                class: SC_CLASSES.value,
                href: `mailto:${strValue}`,
                ...ariaReadonlyAttrs(),
            },
            strValue
        );
    }
    if ((format === "uri" || format === "url") && isSafeHyperlink(strValue)) {
        return h(
            "a",
            { class: SC_CLASSES.value, href: strValue, ...ariaReadonlyAttrs() },
            strValue
        );
    }
    // Either the format is plain text, the URI scheme is unsafe (e.g.
    // `javascript:`), or the email contains characters that could inject
    // mailto header lines. Fall through to text rendering so the value
    // is never interpreted as a navigable URI.
    return h("span", { class: SC_CLASSES.value }, strValue);
}

function renderStringEditable(props: HtmlRenderProps): HtmlNode {
    const strValue = typeof props.value === "string" ? props.value : "";
    const format = props.constraints.format;
    const dateType = dateInputType(format);
    // A `writeOnly` string with `format: "password"` is treated as a
    // credential field — render as `<input type="password">` so the
    // value is masked. The conservative heuristic uses Swagger 2.0 /
    // OpenAPI 3.x's `format: "password"` as the explicit credential
    // signal; key-name or description-based guesses are too fragile to
    // ship by default.
    const isCredential = props.writeOnly && format === "password";
    const inputType =
        dateType ??
        (isCredential
            ? "password"
            : format === "email"
              ? "email"
              : format === "uri"
                ? "url"
                : "text");
    const id = fieldDomId(props.path);

    const attrs: HtmlAttributes = {
        class: SC_CLASSES.input,
        id,
        type: inputType,
        name: id,
    };

    if (isCredential) {
        // A non-empty initial value indicates the consumer is editing
        // an existing credential (the value is still hidden from view —
        // `writeOnly` clears `attrs.value` below — but the browser /
        // password manager should treat the field as `current-password`
        // so it offers to fill the existing entry). An empty initial
        // value indicates a new-credential entry flow.
        attrs.autocomplete =
            strValue.length > 0 ? "current-password" : "new-password";
    }

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
        return h("span", { class: SC_CLASSES.valueEmpty }, EM_DASH);
    }
    return h("span", { class: SC_CLASSES.value }, props.value.toLocaleString());
}

function renderNumberEditable(props: HtmlRenderProps): HtmlNode {
    const numValue = typeof props.value === "number" ? String(props.value) : "";
    const id = fieldDomId(props.path);
    // `tree.type === "number"` is guaranteed by the resolver dispatch
    // (the resolver routes `NumberField` to this renderer). Narrowing here
    // exposes the `isInteger` flag for the inputmode / step heuristic.
    const isInteger =
        props.tree.type === "number" ? props.tree.isInteger : false;
    // Integer schemas use a numeric keypad and a step of 1. Decimal
    // schemas use the decimal keypad and derive `step` from `multipleOf`
    // when supplied; HTML defaults to "any" for unconstrained decimals so
    // the spinner button increments cleanly.
    const inputMode = isInteger ? "numeric" : "decimal";
    const multipleOf = props.constraints.multipleOf;

    const attrs: HtmlAttributes = {
        class: SC_CLASSES.input,
        id,
        type: "number",
        name: id,
        inputmode: inputMode,
    };

    if (multipleOf !== undefined) {
        attrs.step = String(multipleOf);
    } else if (isInteger) {
        attrs.step = "1";
    }

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
        return h("span", { class: SC_CLASSES.valueEmpty }, EM_DASH);
    }
    return h(
        "span",
        { class: "sc-value sc-value--boolean" },
        props.value ? "Yes" : "No"
    );
}

function renderBooleanEditable(props: HtmlRenderProps): HtmlNode {
    const id = fieldDomId(props.path);

    const attrs: HtmlAttributes = {
        class: SC_CLASSES.input,
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
        return h("span", { class: SC_CLASSES.valueEmpty }, EM_DASH);
    }
    return h("span", { class: SC_CLASSES.value }, enumValue);
}

function renderEnumEditable(props: HtmlRenderProps): HtmlNode {
    const enumValue = typeof props.value === "string" ? props.value : "";
    const id = fieldDomId(props.path);
    const selectedValue = props.writeOnly ? "" : enumValue;
    const enumValues = props.tree.type === "enum" ? props.tree.enumValues : [];

    const optionNodes = [
        h("option", { value: "" }, `Select${ELLIPSIS}`),
        ...enumValues.map((v) => {
            const display = displayJsonValue(v);
            const attrs: HtmlAttributes = { value: display };
            if (display === selectedValue) {
                attrs.selected = true;
            }
            return h("option", attrs, display);
        }),
    ];

    const selectAttrs: HtmlAttributes = {
        class: SC_CLASSES.input,
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
    if (props.tree.type !== "object") return "";
    const fields = props.tree.fields;

    const obj = isObject(props.value) ? props.value : {};

    const descriptionText =
        typeof props.meta.description === "string"
            ? props.meta.description
            : undefined;
    const legend =
        descriptionText !== undefined
            ? h("legend", {}, descriptionText)
            : undefined;

    const sortedEntries = sortFieldsByOrder(fields).filter(
        ([, field]) => field.meta.visible !== false
    );

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
            children.push(h("dt", { class: SC_CLASSES.label }, label));
            children.push(h("dd", { class: SC_CLASSES.value }, raw(childHtml)));
        }

        const dlAttrs: HtmlAttributes = { class: SC_CLASSES.object };
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
            h(
                "label",
                { class: SC_CLASSES.label, for: fieldId },
                ...labelContent
            ),
            raw(childHtml),
        ];
        // Hint element for the field's constraints.
        // Uses fieldId (sc-prefixed) as the base ID, matching the child input's id.
        const hint = buildHintElement(fieldId, field.constraints);
        if (hint !== undefined) fieldChildren.push(hint);

        children.push(h("div", { class: SC_CLASSES.field }, ...fieldChildren));
    }

    const fieldsetAttrs: HtmlAttributes = { class: SC_CLASSES.object };
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
    const element =
        props.tree.type === "array" ? props.tree.element : undefined;
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
        return h("ul", { class: SC_CLASSES.array }, ...items);
    }

    // Editable: wrap each item in a div
    const divItems = childHtmls.map((childHtml) =>
        h("div", {}, raw(childHtml))
    );
    return h("div", { class: SC_CLASSES.array }, ...divItems);
}

// ---------------------------------------------------------------------------
// Record renderer
// ---------------------------------------------------------------------------

function renderRecordHtml(props: HtmlRenderProps): string {
    return serialize(renderRecordNode(props));
}

function renderRecordNode(props: HtmlRenderProps): HtmlNode {
    if (props.tree.type !== "record") return "";
    const obj = isObject(props.value) ? props.value : {};
    const valueType = props.tree.valueType;

    const attrs: HtmlAttributes = { class: SC_CLASSES.record, role: "group" };

    if (props.readOnly) {
        const children: HtmlNode[] = [];
        for (const [key, val] of Object.entries(obj)) {
            const childHtml = props.renderChild(valueType, val, key);
            children.push(h("dt", { class: SC_CLASSES.label }, key));
            children.push(h("dd", { class: SC_CLASSES.value }, raw(childHtml)));
        }
        return h("dl", attrs, ...children);
    }

    const children: HtmlNode[] = [];
    for (const [key, val] of Object.entries(obj)) {
        // Derive the child id the same way `renderObjectNode` does so the
        // `<label for>` resolves to the leaf input rendered for this entry.
        const childInputId = buildInputId(props.path, key);
        const childHtml = props.renderChild(valueType, val, key);
        children.push(
            h(
                "div",
                { class: SC_CLASSES.field },
                h("label", { class: SC_CLASSES.label, for: childInputId }, key),
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
    if (props.tree.type !== "literal") {
        return serialize(h("span", { class: SC_CLASSES.valueEmpty }, EM_DASH));
    }
    const values = props.tree.literalValues;
    if (values.length === 0) {
        return serialize(h("span", { class: SC_CLASSES.valueEmpty }, EM_DASH));
    }
    const display = values.map((v) => displayJsonValue(v)).join(", ");
    return serialize(h("span", { class: SC_CLASSES.value }, display));
}

// ---------------------------------------------------------------------------
// Union renderer
// ---------------------------------------------------------------------------

function renderUnionHtml(props: HtmlRenderProps): string {
    const options =
        props.tree.type === "union" || props.tree.type === "discriminatedUnion"
            ? props.tree.options
            : undefined;
    if (options === undefined || options.length === 0) {
        if (props.value === undefined || props.value === null) {
            return serialize(
                h("span", { class: SC_CLASSES.valueEmpty }, EM_DASH)
            );
        }
        return serialize(
            h("span", { class: SC_CLASSES.value }, JSON.stringify(props.value))
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
    return serialize(h("span", { class: SC_CLASSES.valueEmpty }, EM_DASH));
}

// ---------------------------------------------------------------------------
// Discriminated union renderer
// ---------------------------------------------------------------------------

function renderDiscriminatedUnionHtml(props: HtmlRenderProps): string {
    if (props.tree.type !== "discriminatedUnion") {
        if (props.value === undefined || props.value === null) {
            return serialize(
                h("span", { class: SC_CLASSES.valueEmpty }, EM_DASH)
            );
        }
        return serialize(
            h("span", { class: SC_CLASSES.value }, JSON.stringify(props.value))
        );
    }
    // Narrow once at the top \u2014 `discriminator` is `string` on every
    // `DiscriminatedUnionField`, so no `?? ""` empty fallback is needed.
    const { options, discriminator } = props.tree;
    if (options.length === 0) {
        if (props.value === undefined || props.value === null) {
            return serialize(
                h("span", { class: SC_CLASSES.valueEmpty }, EM_DASH)
            );
        }
        return serialize(
            h("span", { class: SC_CLASSES.value }, JSON.stringify(props.value))
        );
    }

    const valueObject: Record<string, unknown> | undefined = isObject(
        props.value
    )
        ? props.value
        : undefined;
    const { optionLabels, activeIndex, activeOption } =
        resolveDiscriminatedActive(options, discriminator, valueObject);

    if (props.readOnly) {
        if (activeOption !== undefined) {
            return props.renderChild(activeOption, props.value);
        }
        return serialize(h("span", { class: SC_CLASSES.valueEmpty }, EM_DASH));
    }

    // Editable: WAI-ARIA tabs pattern. Both `panelIdFor` and `tabIdFor`
    // are the canonical id helpers from `core/idPath.ts`, so the sync,
    // streaming, and React renderers all derive the same id for the
    // same structural path. The helpers also sanitise dots / brackets
    // out of the path so the tab/panel ids remain valid CSS selectors
    // when nested beneath arrays or under deep object paths.
    const tabPanelId = panelIdFor(props.path);
    const tabButtons = options.map((_opt, i) => {
        const attrs: HtmlAttributes = {
            type: "button",
            role: "tab",
            class: i === activeIndex ? SC_CLASSES.tabActive : SC_CLASSES.tab,
            id: tabIdFor(props.path, i),
            // Emit the literal `"false"` rather than omitting the
            // attribute on inactive tabs — some screen readers only
            // announce selection state when `aria-selected` is
            // explicitly present on every tab.
            "aria-selected": i === activeIndex ? "true" : "false",
            "aria-controls": tabPanelId,
            tabindex: i === activeIndex ? "0" : "-1",
        };
        return h("button", attrs, optionLabels[i]);
    });

    const children: HtmlNode[] = [
        h(
            "div",
            {
                role: "tablist",
                class: SC_CLASSES.tabs,
                "aria-label": "Select variant",
                "aria-orientation": "horizontal",
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
                    id: tabPanelId,
                    "aria-labelledby": tabIdFor(props.path, activeIndex),
                },
                raw(childHtml)
            )
        );
    }

    return serialize(
        h("div", { class: SC_CLASSES.discriminatedUnion }, ...children)
    );
}

// ---------------------------------------------------------------------------
// File renderer
// ---------------------------------------------------------------------------

function renderFileHtml(props: HtmlRenderProps): string {
    const id = fieldDomId(props.path);
    const accept = props.constraints.mimeTypes?.join(",");

    if (props.readOnly) {
        return serialize(
            h("span", { class: SC_CLASSES.value, id }, "File field")
        );
    }

    const attrs: HtmlAttributes = {
        class: SC_CLASSES.input,
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

function renderUnknownHtml(props: HtmlRenderProps): string {
    if (props.readOnly) {
        if (props.value === undefined || props.value === null) {
            return serialize(
                h("span", { class: SC_CLASSES.valueEmpty }, EM_DASH)
            );
        }
        if (typeof props.value === "string") {
            return serialize(
                h("span", { class: SC_CLASSES.value }, props.value)
            );
        }
        return serialize(
            h("span", { class: SC_CLASSES.value }, JSON.stringify(props.value))
        );
    }

    const strValue = typeof props.value === "string" ? props.value : "";
    const name = props.path;

    const attrs: HtmlAttributes = {
        class: SC_CLASSES.input,
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
    if (props.tree.type !== "tuple") return renderUnknownHtml(props);
    const arr = Array.isArray(props.value) ? props.value : [];
    const prefixItems = props.tree.prefixItems;
    const restItems = props.tree.restItems;

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
                { class: SC_CLASSES.tupleItem },
                h("span", { class: SC_CLASSES.tupleIndex }, String(i)),
                raw(childHtml)
            )
        );
    }

    // Render rest items (entries beyond the prefix length) when a rest
    // schema is supplied — Draft 2020-12 `items` adjacent to `prefixItems`.
    if (restItems !== undefined) {
        for (let i = prefixItems.length; i < arr.length; i++) {
            const itemValue: unknown = arr[i];
            const childHtml = props.renderChild(
                restItems,
                itemValue,
                `[${String(i)}]`
            );
            children.push(
                h(
                    "div",
                    {
                        class: `${SC_CLASSES.tupleItem} ${SC_CLASSES.tupleRest}`,
                    },
                    h("span", { class: SC_CLASSES.tupleIndex }, String(i)),
                    raw(childHtml)
                )
            );
        }
    }

    return serialize(h("div", { class: SC_CLASSES.tuple }, ...children));
}

// ---------------------------------------------------------------------------
// Conditional rendering
// ---------------------------------------------------------------------------

function renderConditionalHtml(props: HtmlRenderProps): string {
    // Conditionals are rendered as the base type with an annotation
    const children: HtmlNode[] = [];

    if (props.tree.type === "conditional") {
        // `ifClause` is always present on a ConditionalField.
        children.push(
            h("div", { class: SC_CLASSES.conditionalIf }, raw("if: ..."))
        );
        if (props.tree.thenClause !== undefined) {
            children.push(
                h(
                    "div",
                    { class: SC_CLASSES.conditionalThen },
                    raw("then: ...")
                )
            );
        }
        if (props.tree.elseClause !== undefined) {
            children.push(
                h(
                    "div",
                    { class: SC_CLASSES.conditionalElse },
                    raw("else: ...")
                )
            );
        }
    }

    return serialize(h("div", { class: SC_CLASSES.conditional }, ...children));
}

// ---------------------------------------------------------------------------
// Negation rendering
// ---------------------------------------------------------------------------

function renderNegationHtml(props: HtmlRenderProps): string {
    // Props unused — negation renders a static annotation
    void props;
    return serialize(h("div", { class: SC_CLASSES.negation }, raw("not: ...")));
}

// ---------------------------------------------------------------------------
// Null rendering
// ---------------------------------------------------------------------------

/**
 * Render a null field — `z.null()` or `{ type: "null" }`.
 *
 * The only valid value is `null`, so render an em-dash placeholder.
 */
function renderNullHtml(props: HtmlRenderProps): string {
    const id = fieldDomId(props.path);
    return serialize(
        h(
            "span",
            {
                class: SC_CLASSES.valueEmpty,
                id,
                ...ariaReadonlyAttrs(),
            },
            EM_DASH
        )
    );
}

// ---------------------------------------------------------------------------
// Never rendering
// ---------------------------------------------------------------------------

/**
 * Render a never field — `z.never()` or a `false` schema.
 *
 * `never` indicates a position that cannot hold any value. Render a
 * visible placeholder rather than throwing because some valid schemas
 * intentionally contain `never` branches.
 */
function renderNeverHtml(props: HtmlRenderProps): string {
    const id = fieldDomId(props.path);
    return serialize(
        h(
            "span",
            { class: "sc-value sc-never", id },
            h("em", {}, "never matches")
        )
    );
}

// ---------------------------------------------------------------------------
// Union matching heuristic — re-export of the canonical helper so existing
// callers that imported from `html/renderers` keep working.
// ---------------------------------------------------------------------------

export { matchUnionOption };

// ---------------------------------------------------------------------------
// Default resolver
// ---------------------------------------------------------------------------

/**
 * Default HTML resolver used by `renderToHtml` and the streaming
 * renderers when the consumer does not pass a custom resolver. Maps
 * every `WalkedField` variant to a semantic HTML renderer built on the
 * `h()` element builder.
 */
export const defaultHtmlResolver: HtmlResolver = {
    string: renderStringHtml,
    number: renderNumberHtml,
    boolean: renderBooleanHtml,
    null: renderNullHtml,
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
    file: renderFileHtml,
    never: renderNeverHtml,
    unknown: renderUnknownHtml,
};
