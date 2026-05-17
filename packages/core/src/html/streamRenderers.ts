/**
 * Streaming HTML renderer functions — yields HTML chunks incrementally.
 *
 * Generator-based rendering that yields at natural boundaries:
 * - Object: opening tag, one chunk per field, closing tag
 * - Array: opening tag, one chunk per item, closing tag
 * - Record: opening tag, one chunk per entry, closing tag
 * - Union / DiscriminatedUnion: matched option content
 * - Leaf types: rendered entirely as one chunk
 */

import type { WalkedField } from "../core/types.ts";
import { isObject } from "../core/guards.ts";
import { getHtmlRenderFn } from "../core/renderer.ts";
import type { HtmlRenderProps, HtmlResolver } from "../core/renderer.ts";
import {
    h,
    serialize,
    serializeAttributes,
    VOID_ELEMENTS,
    raw,
    type HtmlNode,
    type HtmlElement,
    type HtmlAttributes,
} from "./html.ts";
import {
    buildInputId,
    buildHintElement,
    requiredIndicator,
    ariaLabelAttrs,
} from "./a11y.ts";

// ---------------------------------------------------------------------------
// Yield helpers (passed from the parent module)
// ---------------------------------------------------------------------------

export function yieldOpen(el: HtmlElement): string {
    const attrStr = serializeAttributes(el.attributes);
    if (el.children.length === 0 && VOID_ELEMENTS.has(el.tag)) {
        return `<${el.tag}${attrStr}>`;
    }
    return `<${el.tag}${attrStr}>`;
}

export function yieldClose(el: HtmlElement): string {
    if (VOID_ELEMENTS.has(el.tag)) return "";
    return `</${el.tag}>`;
}

// ---------------------------------------------------------------------------
// Leaf rendering (sync — used for nested content within generators)
// ---------------------------------------------------------------------------

export function renderLeaf(
    tree: WalkedField,
    value: unknown,
    mergedResolver: HtmlResolver,
    path: string
): string {
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
            renderChild: () => "",
        };

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
// Sync field rendering (for nested content within generators)
// ---------------------------------------------------------------------------

export function renderFieldSync(
    tree: WalkedField,
    value: unknown,
    mergedResolver: HtmlResolver,
    path: string,
    rawResolver: HtmlResolver
): string {
    const chunks = [
        ...streamField(tree, value, mergedResolver, path, rawResolver),
    ];
    return chunks.join("");
}

// ---------------------------------------------------------------------------
// Union matching
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
// Chunked field rendering — yields at natural boundaries
// ---------------------------------------------------------------------------

export function* streamField(
    tree: WalkedField,
    value: unknown,
    mergedResolver: HtmlResolver,
    path: string,
    rawResolver: HtmlResolver
): Iterable<string, void, undefined> {
    const effectiveValue = value ?? tree.defaultValue;
    const type = tree.type;

    // Leaf types — render entirely as one chunk using the resolver
    if (
        type === "string" ||
        type === "number" ||
        type === "boolean" ||
        type === "enum" ||
        type === "literal" ||
        type === "file" ||
        type === "unknown"
    ) {
        yield renderLeaf(tree, effectiveValue, mergedResolver, path);
        return;
    }

    // Union — render matched option
    if (type === "union") {
        yield* streamUnion(
            tree,
            effectiveValue,
            mergedResolver,
            path,
            rawResolver
        );
        return;
    }

    // Discriminated union — tabs + active option
    if (type === "discriminatedUnion") {
        yield* streamDiscriminatedUnion(
            tree,
            value,
            mergedResolver,
            path,
            rawResolver
        );
        return;
    }

    // Object — chunk per field
    if (type === "object") {
        yield* streamObject(tree, value, mergedResolver, path, rawResolver);
        return;
    }

    // Array — chunk per item
    if (type === "array") {
        yield* streamArray(tree, value, mergedResolver, path, rawResolver);
        return;
    }

    // Record — chunk per entry
    if (type === "record") {
        yield* streamRecord(tree, value, mergedResolver, path, rawResolver);
        return;
    }

    // Fallback
    yield renderLeaf(tree, value, mergedResolver, path);
}

// ---------------------------------------------------------------------------
// Object streaming
// ---------------------------------------------------------------------------

function* streamObject(
    tree: WalkedField,
    value: unknown,
    mergedResolver: HtmlResolver,
    path: string,
    rawResolver: HtmlResolver
): Iterable<string, void, undefined> {
    if (tree.type !== "object") return;
    const fields = tree.fields;

    const obj = isObject(value) ? value : {};
    const readOnly = tree.editability === "presentation";
    const descriptionText =
        typeof tree.meta.description === "string"
            ? tree.meta.description
            : undefined;

    const labelAttrs = ariaLabelAttrs(descriptionText);

    if (readOnly) {
        const dlAttrs: HtmlAttributes = { class: "sc-object" };
        Object.assign(dlAttrs, labelAttrs);
        const dl = h("dl", dlAttrs);

        const legend =
            descriptionText !== undefined
                ? serialize(h("legend", {}, descriptionText))
                : "";

        yield `${yieldOpen(dl)}${legend}`;

        for (const [key, field] of Object.entries(fields)) {
            const label =
                typeof field.meta.description === "string"
                    ? field.meta.description
                    : key;
            const childValue = obj[key];
            const childHtml = renderFieldSync(
                field,
                childValue,
                mergedResolver,
                key,
                rawResolver
            );
            const dt = serialize(h("dt", { class: "sc-label" }, label));
            const dd = serialize(
                h("dd", { class: "sc-value" }, raw(childHtml))
            );
            yield `${dt}${dd}`;
        }

        yield yieldClose(dl);
    } else {
        const fieldsetAttrs: HtmlAttributes = { class: "sc-object" };
        Object.assign(fieldsetAttrs, labelAttrs);
        const fieldset = h("fieldset", fieldsetAttrs);

        const legend =
            descriptionText !== undefined
                ? serialize(h("legend", {}, descriptionText))
                : "";

        yield `${yieldOpen(fieldset)}${legend}`;

        for (const [key, field] of Object.entries(fields)) {
            const label =
                typeof field.meta.description === "string"
                    ? field.meta.description
                    : key;
            const fieldId = buildInputId(path, key);
            const childValue = obj[key];
            const childChunks = [
                ...streamField(
                    field,
                    childValue,
                    mergedResolver,
                    key,
                    rawResolver
                ),
            ].join("");

            const required = requiredIndicator(field);

            const labelContent: HtmlNode[] = [label];
            if (required !== undefined) labelContent.push(required);

            const fieldChildren: HtmlNode[] = [
                h(
                    "label",
                    { class: "sc-label", for: fieldId },
                    ...labelContent
                ),
                raw(childChunks),
            ];
            const hint = buildHintElement(key, field.constraints);
            if (hint !== undefined) fieldChildren.push(hint);

            const fieldDiv = h("div", { class: "sc-field" }, ...fieldChildren);
            yield serialize(fieldDiv);
        }

        yield yieldClose(fieldset);
    }
}

// ---------------------------------------------------------------------------
// Array streaming
// ---------------------------------------------------------------------------

function* streamArray(
    tree: WalkedField,
    value: unknown,
    mergedResolver: HtmlResolver,
    path: string,
    rawResolver: HtmlResolver
): Iterable<string, void, undefined> {
    const arr = Array.isArray(value) ? value : [];
    if (tree.type !== "array") return;
    const element = tree.element;
    if (element === undefined) return;

    const readOnly = tree.editability === "presentation";

    const elementPath =
        typeof element.meta.description === "string"
            ? element.meta.description
            : "";

    if (readOnly) {
        const ul = h("ul", { class: "sc-array" });
        yield yieldOpen(ul);
        for (const item of arr) {
            const childHtml = renderFieldSync(
                element,
                item,
                mergedResolver,
                elementPath,
                rawResolver
            );
            yield serialize(h("li", { class: "sc-item" }, raw(childHtml)));
        }
        yield yieldClose(ul);
    } else {
        const div = h("div", { class: "sc-array" });
        yield yieldOpen(div);
        for (const item of arr) {
            const childHtml = renderFieldSync(
                element,
                item,
                mergedResolver,
                elementPath,
                rawResolver
            );
            yield serialize(h("div", {}, raw(childHtml)));
        }
        yield yieldClose(div);
    }
}

// ---------------------------------------------------------------------------
// Record streaming
// ---------------------------------------------------------------------------

function* streamRecord(
    tree: WalkedField,
    value: unknown,
    mergedResolver: HtmlResolver,
    path: string,
    rawResolver: HtmlResolver
): Iterable<string, void, undefined> {
    const obj = isObject(value) ? value : {};
    if (tree.type !== "record") return;
    const valueType = tree.valueType;

    const readOnly = tree.editability === "presentation";
    const attrs: HtmlAttributes = { class: "sc-record", role: "group" };

    if (readOnly) {
        const dl = h("dl", attrs);
        yield yieldOpen(dl);
        for (const [key, val] of Object.entries(obj)) {
            const childHtml = renderFieldSync(
                valueType,
                val,
                mergedResolver,
                key,
                rawResolver
            );
            const dt = serialize(h("dt", { class: "sc-label" }, key));
            const dd = serialize(
                h("dd", { class: "sc-value" }, raw(childHtml))
            );
            yield `${dt}${dd}`;
        }
        yield yieldClose(dl);
    } else {
        const container = h("div", attrs);
        yield yieldOpen(container);
        for (const [key, val] of Object.entries(obj)) {
            const childHtml = renderFieldSync(
                valueType,
                val,
                mergedResolver,
                key,
                rawResolver
            );
            yield serialize(
                h(
                    "div",
                    { class: "sc-field" },
                    h("label", { class: "sc-label" }, key),
                    raw(childHtml)
                )
            );
        }
        yield yieldClose(container);
    }
}

// ---------------------------------------------------------------------------
// Union streaming
// ---------------------------------------------------------------------------

function* streamUnion(
    tree: WalkedField,
    value: unknown,
    mergedResolver: HtmlResolver,
    path: string,
    rawResolver: HtmlResolver
): Iterable<string, void, undefined> {
    const options = tree.type === "union" ? tree.options : undefined;
    if (options === undefined || options.length === 0) {
        if (value === undefined || value === null) {
            yield serialize(
                h("span", { class: "sc-value sc-value--empty" }, "\u2014")
            );
        } else {
            yield serialize(
                h("span", { class: "sc-value" }, JSON.stringify(value))
            );
        }
        return;
    }

    const matched = matchUnionOption(options, value);
    const target = matched ?? options[0];
    if (target !== undefined) {
        const targetPath =
            typeof target.meta.description === "string"
                ? target.meta.description
                : "";
        yield* streamField(
            target,
            value,
            mergedResolver,
            targetPath,
            rawResolver
        );
    } else {
        yield serialize(
            h("span", { class: "sc-value sc-value--empty" }, "\u2014")
        );
    }
}

function* streamDiscriminatedUnion(
    tree: WalkedField,
    value: unknown,
    mergedResolver: HtmlResolver,
    path: string,
    rawResolver: HtmlResolver
): Iterable<string, void, undefined> {
    const options =
        tree.type === "discriminatedUnion" ? tree.options : undefined;
    const discriminator =
        tree.type === "discriminatedUnion" ? tree.discriminator : undefined;
    if (options === undefined || options.length === 0) {
        if (value === undefined || value === null) {
            yield serialize(
                h("span", { class: "sc-value sc-value--empty" }, "\u2014")
            );
        } else {
            yield serialize(
                h("span", { class: "sc-value" }, JSON.stringify(value))
            );
        }
        return;
    }

    const isRecord = (v: unknown): v is Record<string, unknown> =>
        typeof v === "object" && v !== null && !Array.isArray(v);
    const obj = isRecord(value) ? value : {};
    const discKey = discriminator ?? "";
    const currentDiscriminatorValue =
        typeof obj[discKey] === "string" ? obj[discKey] : undefined;

    const optionLabels = options.map((opt: WalkedField) => {
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

    const isPresentation = tree.editability === "presentation";

    if (isPresentation) {
        if (activeOption !== undefined) {
            const targetPath =
                typeof activeOption.meta.description === "string"
                    ? activeOption.meta.description
                    : "";
            yield* streamField(
                activeOption,
                value,
                mergedResolver,
                targetPath,
                rawResolver
            );
        }
        return;
    }

    // Editable: WAI-ARIA tabs pattern
    const panelId = `sc-${path}-panel`;
    const wrapper = h("div", { class: "sc-discriminated-union" });
    yield yieldOpen(wrapper);

    // Tab bar
    const tabButtons = options.map((_opt: WalkedField, i: number) => {
        const attrs: HtmlAttributes = {
            type: "button",
            role: "tab",
            class: i === activeIndex ? "sc-tab sc-tab--active" : "sc-tab",
            id: `sc-${path}-tab-${String(i)}`,
            "aria-selected": i === activeIndex ? "true" : undefined,
            "aria-controls": panelId,
            tabindex: i === activeIndex ? "0" : "-1",
        };
        return h("button", attrs, optionLabels[i]);
    });
    yield serialize(
        h(
            "div",
            {
                role: "tablist",
                class: "sc-tabs",
                "aria-label": "Select variant",
            },
            ...tabButtons
        )
    );

    // Tab panel
    const panelOpen = h("div", {
        role: "tabpanel",
        id: panelId,
        "aria-labelledby": `sc-${path}-tab-${String(activeIndex)}`,
    });
    yield yieldOpen(panelOpen);

    // Active option content
    if (activeOption !== undefined) {
        const targetPath =
            typeof activeOption.meta.description === "string"
                ? activeOption.meta.description
                : "";
        yield* streamField(
            activeOption,
            value,
            mergedResolver,
            targetPath,
            rawResolver
        );
    }

    yield yieldClose(panelOpen);
    yield yieldClose(wrapper);
}
