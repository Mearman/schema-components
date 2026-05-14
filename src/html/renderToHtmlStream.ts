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
 */

import { normaliseSchema } from "../core/adapter.ts";
import type { SchemaMeta, WalkedField } from "../core/types.ts";
import { walk, type WalkOptions } from "../core/walker.ts";
import { getHtmlRenderFn, mergeHtmlResolvers } from "../core/renderer.ts";
import type { HtmlRenderProps, HtmlResolver } from "../core/renderer.ts";
import { defaultHtmlResolver } from "./renderToHtml.ts";
import { isObject } from "../core/guards.ts";

// ---------------------------------------------------------------------------
// Shared options
// ---------------------------------------------------------------------------

export type StreamRenderOptions =
    import("./renderToHtml.ts").RenderToHtmlOptions;

// ---------------------------------------------------------------------------
// HTML escaping (re-export from renderToHtml — kept private there,
// duplicated here for the streaming renderers)
// ---------------------------------------------------------------------------

function escapeHtml(str: string): string {
    return str
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
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

    yield* streamField(tree, options.value, mergedResolver, "", resolver);
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

    // Yield each chunk with an await to give the event loop a chance
    // between fields. This is the key difference from the sync version —
    // it allows the runtime to flush network buffers between chunks.
    for (const chunk of streamField(
        tree,
        options.value,
        mergedResolver,
        "",
        resolver
    )) {
        yield chunk;
        // Yield control back to the event loop so that the runtime can
        // flush any pending I/O (e.g. HTTP response buffers) before
        // continuing with the next field.
        await schedulerYield();
    }
}

/**
 * No-op await that yields control to the event loop.
 * `await undefined` resolves on the next microtask.
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
 * Use with `Response`, `TransformStream`, or any web streams API consumer.
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
        yield renderLeaf(tree, value, mergedResolver, path);
        return;
    }

    // Union — render matched option
    if (type === "union" || type === "discriminatedUnion") {
        yield* streamUnion(tree, value, mergedResolver, path, rawResolver);
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
    const description =
        typeof tree.meta.description === "string"
            ? `<legend>${escapeHtml(tree.meta.description)}</legend>`
            : "";

    if (readOnly) {
        yield `<dl class="sc-object">${description}`;
        for (const [key, field] of Object.entries(fields)) {
            const label =
                typeof field.meta.description === "string"
                    ? escapeHtml(field.meta.description)
                    : escapeHtml(key);
            const childValue = obj[key];
            const childHtml = renderFieldSync(
                field,
                childValue,
                mergedResolver,
                path ? `${path}.${key}` : key,
                rawResolver
            );
            yield `<dt class="sc-label">${label}</dt><dd class="sc-value">${childHtml}</dd>`;
        }
        yield `</dl>`;
    } else {
        yield `<fieldset class="sc-object">${description}`;
        for (const [key, field] of Object.entries(fields)) {
            const label =
                typeof field.meta.description === "string"
                    ? escapeHtml(field.meta.description)
                    : escapeHtml(key);
            const inputId = `sc-${escapeHtml(path ? `${path}-${key}` : key)}`;
            const childValue = obj[key];
            const childChunks = [
                ...streamField(
                    field,
                    childValue,
                    mergedResolver,
                    path ? `${path}.${key}` : key,
                    rawResolver
                ),
            ].join("");
            yield `<div class="sc-field"><label class="sc-label" for="${inputId}">${label}</label>${childChunks}</div>`;
        }
        yield `</fieldset>`;
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

    if (readOnly) {
        yield `<ul class="sc-array">`;
        for (const item of arr) {
            const childHtml = renderFieldSync(
                element,
                item,
                mergedResolver,
                path,
                rawResolver
            );
            yield `<li class="sc-item">${childHtml}</li>`;
        }
        yield `</ul>`;
    } else {
        yield `<div class="sc-array">`;
        for (const item of arr) {
            const childHtml = renderFieldSync(
                element,
                item,
                mergedResolver,
                path,
                rawResolver
            );
            yield `<div>${childHtml}</div>`;
        }
        yield `</div>`;
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

    if (readOnly) {
        yield `<dl class="sc-record">`;
        for (const [key, val] of Object.entries(obj)) {
            const childHtml = renderFieldSync(
                valueType,
                val,
                mergedResolver,
                path,
                rawResolver
            );
            yield `<dt class="sc-label">${escapeHtml(key)}</dt><dd class="sc-value">${childHtml}</dd>`;
        }
        yield `</dl>`;
    } else {
        yield `<div class="sc-record">`;
        for (const [key, val] of Object.entries(obj)) {
            const childHtml = renderFieldSync(
                valueType,
                val,
                mergedResolver,
                path,
                rawResolver
            );
            yield `<div class="sc-field"><label class="sc-label">${escapeHtml(key)}</label>${childHtml}</div>`;
        }
        yield `</div>`;
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
            yield '<span class="sc-value sc-value--empty">—</span>';
        } else {
            yield `<span class="sc-value">${escapeHtml(JSON.stringify(value))}</span>`;
        }
        return;
    }

    const matched = matchUnionOption(options, value);
    const target = matched ?? options[0];
    if (target !== undefined) {
        yield* streamField(target, value, mergedResolver, path, rawResolver);
    } else {
        yield '<span class="sc-value sc-value--empty">—</span>';
    }
}

// ---------------------------------------------------------------------------
// Leaf rendering — delegates to resolver, returns single string
// ---------------------------------------------------------------------------

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
        return '<span class="sc-value sc-value--empty">—</span>';
    }
    return `<span class="sc-value">${escapeHtml(typeof value === "string" ? value : JSON.stringify(value))}</span>`;
}

/**
 * Render a field synchronously to a string, recursively streaming children.
 * Used for children of object/array/record that are yielded as part of
 * their parent's chunk.
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
