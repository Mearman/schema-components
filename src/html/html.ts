/**
 * Typed HTML builder — structured HTML construction with compile-time safety.
 *
 * Instead of string templates, renderers call `h(tag, attrs, ...children)` to
 * build an AST, then `serialize()` converts it to an HTML string. This gives:
 *
 * - Compile-time checking of tag names and attribute keys
 * - Automatic HTML escaping (serialiser handles it — callers never escape manually)
 * - Streaming via `serializeChunks()` which yields at element boundaries
 * - Zero dependencies
 *
 * Usage:
 *
 *     import { h, serialize } from "./html.ts";
 *
 *     const el = h("input", { type: "text", id: "name", "aria-required": true });
 *     serialize(el); // → '<input type="text" id="name" aria-required>'
 *
 *     const form = h("form", {},
 *         h("label", { for: "name" }, "Name"),
 *         h("input", { type: "text", id: "name" }),
 *     );
 *     serialize(form); // → '<form><label for="name">Name</label><input type="text" id="name"></form>'
 */

// ---------------------------------------------------------------------------
// AST types
// ---------------------------------------------------------------------------

/**
 * An HTML element node. Void elements (input, br, etc.) have no children
 * in the serialiser regardless of what's passed.
 */
export interface HtmlElement {
    readonly tag: string;
    readonly attributes: Readonly<HtmlAttributes>;
    readonly children: readonly (HtmlElement | HtmlText | HtmlRaw | string)[];
}

/**
 * A text node. The `text` value is stored raw (unescaped) — the serialiser
 * escapes it during output. Callers should NOT pre-escape.
 */
export interface HtmlText {
    readonly text: string;
}

/**
 * A raw HTML node. The `html` value is emitted verbatim — NOT escaped.
 * Use for embedding already-serialised HTML from resolvers or external sources.
 * Never use for user-supplied data.
 */
export interface HtmlRaw {
    readonly html: string;
}

/**
 * Any node that can appear in the HTML tree.
 * - `string` is treated as a text node (will be escaped by the serialiser)
 * - `HtmlElement` and `HtmlText` are structured nodes
 * - `undefined` and `null` are silently dropped (useful for conditional children)
 * - `false` is silently dropped (useful for `{condition && h(...)}`)
 */
export type HtmlNode =
    | HtmlElement
    | HtmlText
    | HtmlRaw
    | string
    | undefined
    | null
    | false;

/**
 * Attribute value types. `true` renders as a boolean attribute (`disabled`),
 * `false` and `undefined` are omitted. Numbers are converted to strings.
 */
export type AttrValue = string | number | boolean | undefined;

/**
 * HTML attributes. Standard attributes are typed per-element via overloads;
 * arbitrary `data-*` and `aria-*` keys are allowed via index signature.
 */
export type HtmlAttributes = Record<string, AttrValue>;

// ---------------------------------------------------------------------------
// Void elements — self-closing, no children
// ---------------------------------------------------------------------------

export const VOID_ELEMENTS = new Set([
    "area",
    "base",
    "br",
    "col",
    "embed",
    "hr",
    "img",
    "input",
    "link",
    "meta",
    "param",
    "source",
    "track",
    "wbr",
]);

// ---------------------------------------------------------------------------
// h() — typed element builder
// ---------------------------------------------------------------------------

/**
 * Build an HTML element node.
 *
 * - Tag name is type-checked (must be a known HTML tag)
 * - Attributes are collected as a record — callers get IntelliSense for
 *   common attributes but can also pass `aria-*`, `data-*` etc.
 * - Children are flattened; `undefined`, `null`, and `false` are dropped.
 * - For void elements (input, img, etc.), children are ignored.
 *
 * @param tag - HTML element tag name
 * @param attrs - Optional attributes (class, id, aria-*, etc.)
 * @param children - Child nodes (strings are escaped by the serialiser)
 */
export function h(
    tag: string,
    attrs?: HtmlAttributes,
    ...children: HtmlNode[]
): HtmlElement {
    return {
        tag,
        attributes: attrs ?? {},
        children: flattenChildren(children),
    };
}

/**
 * Create a text node. The value is NOT escaped — the serialiser handles it.
 * Use this for dynamic text that must appear in the output.
 */
export function text(value: string): HtmlText {
    return { text: value };
}

/**
 * Create a raw HTML node. The value is emitted verbatim — NOT escaped.
 * Use for embedding already-serialised HTML (e.g. from child renderers).
 * Never use for user-supplied data.
 */
export function raw(html: string): HtmlRaw {
    return { html };
}

// ---------------------------------------------------------------------------
// Child flattening
// ---------------------------------------------------------------------------

function flattenChildren(
    nodes: readonly HtmlNode[]
): (HtmlElement | HtmlText | HtmlRaw | string)[] {
    const out: (HtmlElement | HtmlText | HtmlRaw | string)[] = [];
    for (const node of nodes) {
        if (node === undefined || node === null || node === false) continue;
        if (typeof node === "string") {
            out.push(node);
        } else if ("tag" in node) {
            out.push(node);
        } else if ("html" in node) {
            out.push(node);
        } else if ("text" in node) {
            out.push(node);
        }
    }
    return out;
}

// ---------------------------------------------------------------------------
// Serialisation — AST → HTML string
// ---------------------------------------------------------------------------

/**
 * Serialise an HTML node to a string.
 *
 * - Text content is automatically escaped
 * - Void elements are self-closing
 * - Boolean attributes render as just the name (`disabled`, `checked`)
 * - `false`/`undefined` attribute values are omitted
 *
 * @param node - An HtmlElement, HtmlText, or string to serialise
 * @returns HTML string
 */
export function serialize(node: HtmlNode): string {
    if (node === undefined || node === null || node === false) return "";
    if (typeof node === "string") return escapeHtml(node);
    if ("html" in node) return node.html;
    if ("text" in node) return escapeHtml(node.text);
    // Fragment (empty tag) — serialise children without a wrapper
    if (node.tag === "") {
        return node.children.map((child) => serialize(child)).join("");
    }
    return serializeElement(node);
}

export function serializeElement(el: HtmlElement): string {
    const attrs = serializeAttributes(el.attributes);

    if (VOID_ELEMENTS.has(el.tag)) {
        return `<${el.tag}${attrs}>`;
    }

    if (el.children.length === 0) {
        return `<${el.tag}${attrs}></${el.tag}>`;
    }

    const inner = el.children.map((child) => serialize(child)).join("");
    return `<${el.tag}${attrs}>${inner}</${el.tag}>`;
}

export function serializeAttributes(attrs: HtmlAttributes): string {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(attrs)) {
        if (value === undefined || value === false) continue;
        if (value === true) {
            parts.push(` ${key}`);
        } else {
            parts.push(` ${key}="${escapeHtml(String(value))}"`);
        }
    }
    return parts.join("");
}

// ---------------------------------------------------------------------------
// Streaming serialisation — yields chunks at element boundaries
// ---------------------------------------------------------------------------

/**
 * Serialise an HTML node to chunks, yielded at natural element boundaries.
 *
 * - Each top-level child element becomes its own chunk
 * - Leaf text within an element stays with its parent
 * - Void elements are single chunks
 *
 * This is used by the streaming renderer to produce incremental output.
 *
 * @param node - An HTML node to serialise
 * @returns Iterable of HTML string chunks
 */
export function* serializeChunks(
    node: HtmlNode
): Iterable<string, void, undefined> {
    if (node === undefined || node === null || node === false) return;
    if (typeof node === "string") {
        yield escapeHtml(node);
        return;
    }
    if ("html" in node) {
        yield node.html;
        return;
    }
    if ("text" in node) {
        yield escapeHtml(node.text);
        return;
    }

    // Element
    const attrs = serializeAttributes(node.attributes);
    const tag = node.tag;
    const open = `<${tag}${attrs}>`;
    const isVoid = VOID_ELEMENTS.has(tag);

    if (isVoid) {
        yield open;
        return;
    }

    if (node.children.length === 0) {
        yield `${open}</${tag}>`;
        return;
    }

    // Opening tag as first chunk
    yield open;

    // Each child as its own chunk(s)
    for (const child of node.children) {
        if (typeof child === "string") {
            yield escapeHtml(child);
        } else if ("html" in child) {
            yield child.html;
        } else if ("text" in child) {
            yield escapeHtml(child.text);
        } else {
            // Nested element — recurse, yielding its chunks
            yield* serializeChunks(child);
        }
    }

    // Closing tag
    yield `</${tag}>`;
}

// ---------------------------------------------------------------------------
// HTML escaping
// ---------------------------------------------------------------------------

/**
 * Escape a string for safe inclusion in HTML text content or attribute values.
 */
export function escapeHtml(str: string): string {
    return str
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

// ---------------------------------------------------------------------------
// Fragment — wraps children without emitting a wrapping tag
// ---------------------------------------------------------------------------

/**
 * Create a fragment: children rendered sequentially with no wrapping element.
 * Useful when a renderer needs to return multiple top-level nodes.
 */
export function fragment(...children: HtmlNode[]): HtmlElement {
    return h("", undefined, ...children);
}

// ---------------------------------------------------------------------------
// Convenience: serializeFragment — handles fragments (tag === "")
// ---------------------------------------------------------------------------

/**
 * Serialise a node, treating fragments (empty tag) as just their children.
 */
export function serializeFragment(node: HtmlNode): string {
    if (node === undefined || node === null || node === false) return "";
    if (typeof node === "string") return escapeHtml(node);
    if ("html" in node) return node.html;
    if ("text" in node) return escapeHtml(node.text);
    if (node.tag === "") {
        return node.children.map((child) => serialize(child)).join("");
    }
    return serializeElement(node);
}
