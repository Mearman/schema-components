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
 */

import { normaliseSchema } from "../core/adapter.ts";
import type { SchemaMeta, WalkedField } from "../core/types.ts";
import { walk } from "../core/walker.ts";
import type { WalkOptions } from "../core/walkBuilders.ts";
import { mergeHtmlResolvers } from "../core/renderer.ts";
import type { HtmlResolver } from "../core/renderer.ts";
import { defaultHtmlResolver } from "./renderers.ts";
import { streamField } from "./streamRenderers.ts";

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface StreamRenderOptions {
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
// Sync chunk iterator
// ---------------------------------------------------------------------------

/**
 * Render a schema as an iterable of HTML string chunks.
 * Each chunk is a self-contained HTML fragment.
 */
export function renderToHtmlChunks(
    schema: unknown,
    options: StreamRenderOptions = {}
): Iterable<string> {
    const { tree, resolver } = prepareTree(schema, options);
    const effectiveValue = options.value ?? tree.defaultValue;
    const mergedResolver = mergeHtmlResolvers(resolver, defaultHtmlResolver);

    return streamField(tree, effectiveValue, mergedResolver, "", resolver);
}

// ---------------------------------------------------------------------------
// Async chunk iterator
// ---------------------------------------------------------------------------

/**
 * Render a schema as an async iterable of HTML string chunks.
 * Yields `undefined` between chunks to allow the event loop to process
 * other tasks (cooperative scheduling).
 */
export async function* renderToHtmlStream(
    schema: unknown,
    options: StreamRenderOptions = {}
): AsyncIterable<string> {
    const { tree, resolver } = prepareTree(schema, options);
    const effectiveValue = options.value ?? tree.defaultValue;
    const mergedResolver = mergeHtmlResolvers(resolver, defaultHtmlResolver);

    for (const chunk of streamField(
        tree,
        effectiveValue,
        mergedResolver,
        "",
        resolver
    )) {
        yield chunk;
        await schedulerYield();
    }
}

// ---------------------------------------------------------------------------
// Web ReadableStream
// ---------------------------------------------------------------------------

/**
 * Render a schema as a web `ReadableStream<string>`.
 * Uses the async rendering pipeline internally.
 */
export function renderToHtmlReadable(
    schema: unknown,
    options: StreamRenderOptions = {}
): ReadableStream<string> {
    const { tree, resolver } = prepareTree(schema, options);
    const effectiveValue = options.value ?? tree.defaultValue;
    const mergedResolver = mergeHtmlResolvers(resolver, defaultHtmlResolver);

    const generator = streamField(
        tree,
        effectiveValue,
        mergedResolver,
        "",
        resolver
    );

    const iterator = generator[Symbol.iterator]();

    return new ReadableStream<string>({
        pull(controller) {
            const { value, done } = iterator.next();
            if (done) {
                controller.close();
            } else {
                controller.enqueue(value);
            }
        },
    });
}

// ---------------------------------------------------------------------------
// Tree preparation (shared across all output formats)
// ---------------------------------------------------------------------------

function prepareTree(
    schema: unknown,
    options: StreamRenderOptions
): { tree: WalkedField; resolver: HtmlResolver } {
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

    return { tree, resolver };
}

// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------

function schedulerYield(): Promise<undefined> {
    return new Promise((resolve) => setTimeout(resolve, 0));
}
