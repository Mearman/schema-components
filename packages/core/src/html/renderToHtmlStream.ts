/**
 * Streaming HTML renderer — yields HTML chunks incrementally.
 *
 * Same rendering pipeline as `renderToHtml` but yields string fragments
 * as each field/element is produced instead of building the entire string
 * in memory. Use for server-side rendering where you want to start
 * flushing the response before the full schema is rendered.
 *
 * Three output formats:
 *
 * - `renderToHtmlChunks(schema, options)` → sync `Iterable<string>`
 * - `renderToHtmlStream(schema, options)` → async `AsyncIterable<string>`
 * - `renderToHtmlReadable(schema, options)` → web `ReadableStream<string>`
 *
 * Chunk boundaries:
 * - Object: opening tag, one chunk per field, closing tag
 * - Array: opening tag, one chunk per item, closing tag
 * - Record: opening tag, one chunk per entry, closing tag
 * - Leaf types (string, number, boolean, enum, literal, unknown):
 *   rendered entirely as one chunk
 *
 * All HTML construction uses `h()` from `html.ts` — the streaming module
 * manually yields the opening tag, then children, then the closing tag.
 */

import { normaliseSchema } from "../core/adapter.ts";
import type { SchemaMeta, WalkedField } from "../core/types.ts";
import { walk, type WalkOptions } from "../core/walker.ts";
import { getHtmlRenderFn, mergeHtmlResolvers } from "../core/renderer.ts";
import type { HtmlRenderProps, HtmlResolver } from "../core/renderer.ts";
import { defaultHtmlResolver } from "./renderToHtml.ts";
import { isObject } from "../core/guards.ts";
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
// Shared options
// ---------------------------------------------------------------------------

export type StreamRenderOptions =
    import("./renderToHtml.ts").RenderToHtmlOptions;

// ---------------------------------------------------------------------------
// Helpers for streaming h() nodes
// ---------------------------------------------------------------------------

/**
 * Yield the opening tag of an element (e.g. `<fieldset class="sc-object">`).
 * For void elements, yields the complete self-closing tag.
 */
function yieldOpen(el: HtmlElement): string {
    const attrs = serializeAttributes(el.attributes);
    return `<${el.tag}${attrs}>`;
}

/**
 * Yield the closing tag of an element (e.g. `</fieldset>`).
 * Returns empty string for void elements.
 */
function yieldClose(el: HtmlElement): string {
    if (VOID_ELEMENTS.has(el.tag)) return "";
    return `</${el.tag}>`;
}

// ---------------------------------------------------------------------------
// Chunked rendering — sync generator (foundation)
// ---------------------------------------------------------------------------

/**
 * Render a schema to HTML string chunks, yielded incrementally.
 *
 * Each yielded chunk is a self-contained HTML fragment. Concatenating
 * all chunks produces the same output as `renderToHtml`.
 *
 * @returns Sync iterable of HTML string chunks
 */
export function* renderToHtmlChunks(
    schema: unknown,
    options: StreamRenderOptions = {}
): Iterable<string, void, undefined> {
    const tree = prepareTree(schema, options);
    const resolver = options.resolver ?? defaultHtmlResolver;
    const mergedResolver = mergeHtmlResolvers(resolver, defaultHtmlResolver);

    const effectiveValue = options.value ?? tree.defaultValue;
    yield* streamField(tree, effectiveValue, mergedResolver, "", resolver);
}

// ---------------------------------------------------------------------------
// Async streaming — async generator
// ---------------------------------------------------------------------------

/**
 * Render a schema to HTML string chunks asynchronously.
 *
 * Identical chunk boundaries to `renderToHtmlChunks` but yields via
 * an async generator. Use with `for await...of` or pipe to a response.
 *
 * @returns Async iterable of HTML string chunks
 */
export async function* renderToHtmlStream(
    schema: unknown,
    options: StreamRenderOptions = {}
): AsyncIterable<string, void, undefined> {
    const tree = prepareTree(schema, options);
    const resolver = options.resolver ?? defaultHtmlResolver;
    const mergedResolver = mergeHtmlResolvers(resolver, defaultHtmlResolver);

    for (const chunk of streamField(
        tree,
        options.value,
        mergedResolver,
        "",
        resolver
    )) {
        yield chunk;
        await schedulerYield();
    }
}

/**
 * No-op await that yields control to the event loop.
 */
function schedulerYield(): Promise<undefined> {
    return Promise.resolve(undefined);
}

// ---------------------------------------------------------------------------
// Web ReadableStream
// ---------------------------------------------------------------------------

/**
 * Render a schema to a web `ReadableStream<string>`.
 *
 * ```ts
 * return new Response(renderToHtmlReadable(schema, { value }), {
 *     headers: { "Content-Type": "text/html" },
 * });
 * ```
 */
export function renderToHtmlReadable(
    schema: unknown,
    options: StreamRenderOptions = {}
): ReadableStream<string> {
    const chunks = renderToHtmlChunks(schema, options);
    const iterator = chunks[Symbol.iterator]();

    return new ReadableStream<string>({
        pull(controller) {
            const result = iterator.next();
            if (result.done) {
                controller.close();
            } else {
                controller.enqueue(result.value);
            }
        },
        cancel() {
            if (iterator.return !== undefined) {
                iterator.return();
            }
        },
    });
}

// ---------------------------------------------------------------------------
// Tree preparation — shared between all output formats
// ---------------------------------------------------------------------------

function prepareTree(
    schema: unknown,
    options: StreamRenderOptions
): WalkedField {
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

    return walk(jsonSchema, walkOptions);
}

// ---------------------------------------------------------------------------
// Chunked field rendering — yields at natural boundaries
// ---------------------------------------------------------------------------

function* streamField(
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
    const fields = tree.fields;
    if (fields === undefined) return;

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
    const valueType = tree.valueType;
    if (valueType === undefined) return;

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
    const options = tree.options;
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
    const options = tree.options;
    const discriminator = tree.discriminator;
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

    const optionLabels = options.map((opt) => {
        const discriminatorField = opt.fields?.[discKey];
        if (discriminatorField !== undefined) {
            const constVal = discriminatorField.literalValues?.[0];
            if (typeof constVal === "string") return constVal;
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
    const tabButtons = options.map((_opt, i) => {
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

function renderLeaf(
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

/**
 * Render a field synchronously to a string, recursively streaming children.
 */
function renderFieldSync(
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
// Union matching — same heuristic as renderToHtml.ts
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
