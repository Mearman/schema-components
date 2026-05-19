/**
 * Streaming HTML renderer functions — yields HTML chunks incrementally.
 *
 * Generator-based rendering that yields at natural boundaries:
 * - Object: opening tag, one chunk per field, closing tag
 * - Array: opening tag, one chunk per item, closing tag
 * - Record: opening tag, one chunk per entry, closing tag
 * - Union / DiscriminatedUnion: matched option content
 * - Leaf types: rendered entirely as one chunk
 *
 * All container generators thread `currentDepth` so cyclic walked-field
 * graphs (e.g. `z.lazy` schemas) terminate at `MAX_RENDER_DEPTH` with a
 * recursion sentinel rather than overflowing the stack. The cap is
 * shared with the synchronous renderer in `renderToHtml.ts`.
 *
 * Container generators also thread `diagnostics`. When a value's shape
 * disagrees with the field type (e.g. an object schema receives an
 * array value), a `type-mismatch` diagnostic is emitted and a visible
 * placeholder element is rendered in place — streaming never silently
 * coerces to `{}` / `[]` and never stops producing output.
 */

import type { WalkedField } from "../core/types.ts";
import { isObject } from "../core/guards.ts";
import { getHtmlRenderFn } from "../core/renderer.ts";
import type { HtmlRenderProps, HtmlResolver } from "../core/renderer.ts";
import {
    emitDiagnostic,
    type DiagnosticsOptions,
} from "../core/diagnostics.ts";
import {
    matchUnionOption,
    resolveDiscriminatedActive,
} from "../core/unionMatch.ts";
import { SC_CLASSES, EM_DASH } from "../core/cssClasses.ts";
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
    joinPath,
} from "./a11y.ts";
import { MAX_RENDER_DEPTH } from "../core/limits.ts";
import { recursionSentinelHtml } from "./renderToHtml.ts";
import { panelId, tabId } from "./renderers.ts";

// ---------------------------------------------------------------------------
// Yield helpers (passed from the parent module)
// ---------------------------------------------------------------------------

/**
 * Serialise the opening tag of an element so a generator can yield it
 * without the matching closing tag. Void elements (e.g. `input`) are
 * emitted self-closed so the chunk is structurally valid on its own.
 */
export function yieldOpen(el: HtmlElement): string {
    const attrStr = serializeAttributes(el.attributes);
    // Void elements (`input`, `br`, etc.) have no closing tag — emit a
    // self-closing form so a single `yieldOpen` chunk produces a complete,
    // structurally valid element rather than a dangling opening tag waiting
    // for a `yieldClose` that will never come.
    if (VOID_ELEMENTS.has(el.tag)) {
        return `<${el.tag}${attrStr} />`;
    }
    return `<${el.tag}${attrStr}>`;
}

/**
 * Serialise the closing tag of an element so a generator can yield it
 * after its children. Returns an empty string for void elements (their
 * opening tag was emitted self-closed by {@link yieldOpen}).
 */
export function yieldClose(el: HtmlElement): string {
    if (VOID_ELEMENTS.has(el.tag)) return "";
    return `</${el.tag}>`;
}

// ---------------------------------------------------------------------------
// Leaf rendering (sync — used for nested content within generators)
// ---------------------------------------------------------------------------

/**
 * Render a leaf {@link WalkedField} entirely as a single HTML chunk.
 * Used inside the streaming generators when descent into containers is
 * complete. Falls back to a `<span>`-wrapped value when no renderer is
 * registered for the field type.
 */
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
        return serialize(h("span", { class: SC_CLASSES.valueEmpty }, EM_DASH));
    }
    return serialize(
        h(
            "span",
            { class: SC_CLASSES.value },
            typeof value === "string" ? value : JSON.stringify(value)
        )
    );
}

// ---------------------------------------------------------------------------
// Sync field rendering (for nested content within generators)
// ---------------------------------------------------------------------------

/**
 * Drain {@link streamField} into a single string. Used when a streamed
 * sub-tree needs to be embedded inside a non-streaming chunk (e.g. as
 * children of a parent element).
 */
export function renderFieldSync(
    tree: WalkedField,
    value: unknown,
    mergedResolver: HtmlResolver,
    path: string,
    rawResolver: HtmlResolver,
    currentDepth: number,
    diagnostics: DiagnosticsOptions | undefined
): string {
    const chunks = [
        ...streamField(
            tree,
            value,
            mergedResolver,
            path,
            rawResolver,
            currentDepth,
            diagnostics
        ),
    ];
    return chunks.join("");
}

// ---------------------------------------------------------------------------
// Type-mismatch placeholder
// ---------------------------------------------------------------------------

/**
 * Build a visible placeholder element used when a value does not match
 * the shape implied by its field type. The expected-shape label is
 * passed verbatim into `h()` so the serialiser escapes it.
 *
 * Streaming must keep producing output, so we never throw here — the
 * diagnostic surfaces the problem to the caller (when a sink is wired)
 * while the rendered output remains structurally valid.
 */
function typeMismatchPlaceholder(expectedShape: string): string {
    return serialize(
        h(
            "span",
            { class: "sc-value sc-value--invalid", role: "alert" },
            `invalid value (expected ${expectedShape})`
        )
    );
}

// ---------------------------------------------------------------------------
// Chunked field rendering — yields at natural boundaries
// ---------------------------------------------------------------------------

/**
 * Render a {@link WalkedField} as a generator that yields HTML chunks
 * at natural boundaries (opening tag, one chunk per child, closing
 * tag). Threads `currentDepth` so cyclic walked-field graphs terminate
 * at `MAX_RENDER_DEPTH` with a recursion sentinel rather than
 * overflowing the stack.
 */
export function* streamField(
    tree: WalkedField,
    value: unknown,
    mergedResolver: HtmlResolver,
    path: string,
    rawResolver: HtmlResolver,
    currentDepth = 0,
    diagnostics?: DiagnosticsOptions
): Iterable<string, void, undefined> {
    // Recursion guard: cyclic walked-field graphs (z.lazy, mutually
    // recursive $ref) would otherwise overflow the stack. Mirrors the
    // sync renderer in `renderToHtml.ts`.
    if (currentDepth >= MAX_RENDER_DEPTH) {
        const label =
            typeof tree.meta.description === "string"
                ? tree.meta.description
                : "schema";
        yield recursionSentinelHtml(label);
        return;
    }

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
            rawResolver,
            currentDepth,
            diagnostics
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
            rawResolver,
            currentDepth,
            diagnostics
        );
        return;
    }

    // Object — chunk per field
    if (type === "object") {
        yield* streamObject(
            tree,
            value,
            mergedResolver,
            path,
            rawResolver,
            currentDepth,
            diagnostics
        );
        return;
    }

    // Array — chunk per item
    if (type === "array") {
        yield* streamArray(
            tree,
            value,
            mergedResolver,
            path,
            rawResolver,
            currentDepth,
            diagnostics
        );
        return;
    }

    // Record — chunk per entry
    if (type === "record") {
        yield* streamRecord(
            tree,
            value,
            mergedResolver,
            path,
            rawResolver,
            currentDepth,
            diagnostics
        );
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
    rawResolver: HtmlResolver,
    currentDepth: number,
    diagnostics: DiagnosticsOptions | undefined
): Iterable<string, void, undefined> {
    if (tree.type !== "object") return;
    const fields = tree.fields;

    // A defined value with the wrong shape is a real disagreement — surface
    // it via diagnostics and render a placeholder. An absent value (undefined
    // / null) is treated as "no data" and falls through to an empty object so
    // the structure still renders.
    if (value !== undefined && value !== null && !isObject(value)) {
        emitDiagnostic(diagnostics, {
            code: "type-mismatch",
            message:
                "Object schema received non-object value during streaming render",
            pointer: path === "" ? "/" : `/${path}`,
            detail: { expected: "object", actualType: typeof value, path },
        });
        yield typeMismatchPlaceholder("object");
        return;
    }
    const obj: Record<string, unknown> = isObject(value) ? value : {};
    const readOnly = tree.editability === "presentation";
    const descriptionText =
        typeof tree.meta.description === "string"
            ? tree.meta.description
            : undefined;

    const labelAttrs = ariaLabelAttrs(descriptionText);

    if (readOnly) {
        const dlAttrs: HtmlAttributes = { class: SC_CLASSES.object };
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
            const childPath = joinPath(path, key);
            const childHtml = renderFieldSync(
                field,
                childValue,
                mergedResolver,
                childPath,
                rawResolver,
                currentDepth + 1,
                diagnostics
            );
            const dt = serialize(h("dt", { class: SC_CLASSES.label }, label));
            const dd = serialize(
                h("dd", { class: SC_CLASSES.value }, raw(childHtml))
            );
            yield `${dt}${dd}`;
        }

        yield yieldClose(dl);
    } else {
        const fieldsetAttrs: HtmlAttributes = { class: SC_CLASSES.object };
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
            const childPath = joinPath(path, key);
            const childChunks = [
                ...streamField(
                    field,
                    childValue,
                    mergedResolver,
                    childPath,
                    rawResolver,
                    currentDepth + 1,
                    diagnostics
                ),
            ].join("");

            const required = requiredIndicator(field);

            const labelContent: HtmlNode[] = [label];
            if (required !== undefined) labelContent.push(required);

            const fieldChildren: HtmlNode[] = [
                h(
                    "label",
                    { class: SC_CLASSES.label, for: fieldId },
                    ...labelContent
                ),
                raw(childChunks),
            ];
            // Hint element id must derive from the already-prefixed input id
            // (`sc-…`) so the input's `aria-describedby` resolves correctly.
            // Passing the raw structural key here would emit `name-hint`
            // while the input's `aria-describedby` points at `sc-name-hint`.
            const hint = buildHintElement(fieldId, field.constraints);
            if (hint !== undefined) fieldChildren.push(hint);

            const fieldDiv = h(
                "div",
                { class: SC_CLASSES.field },
                ...fieldChildren
            );
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
    rawResolver: HtmlResolver,
    currentDepth: number,
    diagnostics: DiagnosticsOptions | undefined
): Iterable<string, void, undefined> {
    if (tree.type !== "array") return;
    const element = tree.element;
    if (element === undefined) return;

    // Defined-but-wrong-shape: emit diagnostic + placeholder. Absent
    // values fall through to an empty list so the container still renders.
    if (value !== undefined && value !== null && !Array.isArray(value)) {
        emitDiagnostic(diagnostics, {
            code: "type-mismatch",
            message:
                "Array schema received non-array value during streaming render",
            pointer: path === "" ? "/" : `/${path}`,
            detail: { expected: "array", actualType: typeof value, path },
        });
        yield typeMismatchPlaceholder("array");
        return;
    }
    // `Array.isArray` narrows to `any[]` rather than `unknown[]`, so type
    // the iterable explicitly to keep elements as `unknown`.
    const arr: readonly unknown[] = Array.isArray(value) ? value : [];

    const readOnly = tree.editability === "presentation";

    if (readOnly) {
        const ul = h("ul", { class: SC_CLASSES.array });
        yield yieldOpen(ul);
        for (const [i, item] of arr.entries()) {
            // Derive per-item path from the index, not from the element's
            // description. Description-as-path collides across items and
            // produces structurally invalid id segments when it contains
            // spaces or punctuation.
            const elementPath = joinPath(path, `[${String(i)}]`);
            const childHtml = renderFieldSync(
                element,
                item,
                mergedResolver,
                elementPath,
                rawResolver,
                currentDepth + 1,
                diagnostics
            );
            yield serialize(h("li", { class: "sc-item" }, raw(childHtml)));
        }
        yield yieldClose(ul);
    } else {
        const div = h("div", { class: SC_CLASSES.array });
        yield yieldOpen(div);
        for (const [i, item] of arr.entries()) {
            const elementPath = joinPath(path, `[${String(i)}]`);
            const childHtml = renderFieldSync(
                element,
                item,
                mergedResolver,
                elementPath,
                rawResolver,
                currentDepth + 1,
                diagnostics
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
    rawResolver: HtmlResolver,
    currentDepth: number,
    diagnostics: DiagnosticsOptions | undefined
): Iterable<string, void, undefined> {
    if (tree.type !== "record") return;
    const valueType = tree.valueType;

    // Defined-but-wrong-shape: emit diagnostic + placeholder. Absent
    // values fall through to an empty record so the container still renders.
    if (value !== undefined && value !== null && !isObject(value)) {
        emitDiagnostic(diagnostics, {
            code: "type-mismatch",
            message:
                "Record schema received non-object value during streaming render",
            pointer: path === "" ? "/" : `/${path}`,
            detail: { expected: "object", actualType: typeof value, path },
        });
        yield typeMismatchPlaceholder("object");
        return;
    }
    const obj: Record<string, unknown> = isObject(value) ? value : {};

    const readOnly = tree.editability === "presentation";
    const attrs: HtmlAttributes = { class: SC_CLASSES.record, role: "group" };

    if (readOnly) {
        const dl = h("dl", attrs);
        yield yieldOpen(dl);
        for (const [key, val] of Object.entries(obj)) {
            const childPath = joinPath(path, key);
            const childHtml = renderFieldSync(
                valueType,
                val,
                mergedResolver,
                childPath,
                rawResolver,
                currentDepth + 1,
                diagnostics
            );
            const dt = serialize(h("dt", { class: SC_CLASSES.label }, key));
            const dd = serialize(
                h("dd", { class: SC_CLASSES.value }, raw(childHtml))
            );
            yield `${dt}${dd}`;
        }
        yield yieldClose(dl);
    } else {
        const container = h("div", attrs);
        yield yieldOpen(container);
        for (const [key, val] of Object.entries(obj)) {
            const childPath = joinPath(path, key);
            const childHtml = renderFieldSync(
                valueType,
                val,
                mergedResolver,
                childPath,
                rawResolver,
                currentDepth + 1,
                diagnostics
            );
            yield serialize(
                h(
                    "div",
                    { class: SC_CLASSES.field },
                    h("label", { class: SC_CLASSES.label }, key),
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
    rawResolver: HtmlResolver,
    currentDepth: number,
    diagnostics: DiagnosticsOptions | undefined
): Iterable<string, void, undefined> {
    const options = tree.type === "union" ? tree.options : undefined;
    if (options === undefined || options.length === 0) {
        if (value === undefined || value === null) {
            yield serialize(
                h("span", { class: SC_CLASSES.valueEmpty }, EM_DASH)
            );
        } else {
            yield serialize(
                h("span", { class: SC_CLASSES.value }, JSON.stringify(value))
            );
        }
        return;
    }

    const matched = matchUnionOption(options, value);
    const target = matched ?? options[0];
    if (target !== undefined) {
        // Union options are transparent wrappers — inherit the parent path
        // so child input ids match the non-streaming renderer (which calls
        // `renderChild(target, value)` without a suffix, leaving the path
        // unchanged via `joinPath`).
        yield* streamField(
            target,
            value,
            mergedResolver,
            path,
            rawResolver,
            currentDepth + 1,
            diagnostics
        );
    } else {
        yield serialize(h("span", { class: SC_CLASSES.valueEmpty }, EM_DASH));
    }
}

function* streamDiscriminatedUnion(
    tree: WalkedField,
    value: unknown,
    mergedResolver: HtmlResolver,
    path: string,
    rawResolver: HtmlResolver,
    currentDepth: number,
    diagnostics: DiagnosticsOptions | undefined
): Iterable<string, void, undefined> {
    if (tree.type !== "discriminatedUnion") return;
    // Narrow once at the top — `discriminator` is `string` on every
    // `DiscriminatedUnionField`, so no `?? ""` empty fallback is needed.
    const { options, discriminator } = tree;
    if (options.length === 0) {
        if (value === undefined || value === null) {
            yield serialize(
                h("span", { class: SC_CLASSES.valueEmpty }, EM_DASH)
            );
        } else {
            yield serialize(
                h("span", { class: SC_CLASSES.value }, JSON.stringify(value))
            );
        }
        return;
    }

    const valueObject: Record<string, unknown> | undefined = isObject(value)
        ? value
        : undefined;
    const { optionLabels, activeIndex, activeOption } =
        resolveDiscriminatedActive(options, discriminator, valueObject);

    const isPresentation = tree.editability === "presentation";

    if (isPresentation) {
        if (activeOption !== undefined) {
            // Inherit parent path — see streamUnion comment above.
            yield* streamField(
                activeOption,
                value,
                mergedResolver,
                path,
                rawResolver,
                currentDepth + 1,
                diagnostics
            );
        }
        return;
    }

    // Editable: WAI-ARIA tabs pattern. Route ids through `panelId` /
    // `tabId` (from `./renderers.ts`) so the streaming and sync renderers
    // — and, through Agent G's parallel work, the React headless renderer
    // — produce structurally identical ids for the same path. Both
    // helpers delegate to the canonical `panelIdFor` / `tabIdFor` in
    // `core/idPath.ts` for non-empty paths so dots / brackets in nested
    // paths can no longer leak into the id and break CSS selectors or
    // the `aria-labelledby` ↔ tab `id` association.
    const tabPanelId = panelId(path);
    const wrapper = h("div", { class: SC_CLASSES.discriminatedUnion });
    yield yieldOpen(wrapper);

    // Tab bar
    const tabButtons = options.map((_opt: WalkedField, i: number) => {
        const attrs: HtmlAttributes = {
            type: "button",
            role: "tab",
            class: i === activeIndex ? SC_CLASSES.tabActive : SC_CLASSES.tab,
            id: tabId(path, i),
            "aria-selected": i === activeIndex ? "true" : undefined,
            "aria-controls": tabPanelId,
            tabindex: i === activeIndex ? "0" : "-1",
        };
        return h("button", attrs, optionLabels[i]);
    });
    yield serialize(
        h(
            "div",
            {
                role: "tablist",
                class: SC_CLASSES.tabs,
                "aria-label": "Select variant",
            },
            ...tabButtons
        )
    );

    // Tab panel
    const panelOpen = h("div", {
        role: "tabpanel",
        id: tabPanelId,
        "aria-labelledby": tabId(path, activeIndex),
    });
    yield yieldOpen(panelOpen);

    // Active option content
    if (activeOption !== undefined) {
        // Inherit parent path — see streamUnion comment above.
        yield* streamField(
            activeOption,
            value,
            mergedResolver,
            path,
            rawResolver,
            currentDepth + 1,
            diagnostics
        );
    }

    yield yieldClose(panelOpen);
    yield yieldClose(wrapper);
}
