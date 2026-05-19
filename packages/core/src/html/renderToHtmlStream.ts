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

import { normaliseSchema, type SchemaIoSide } from "../core/adapter.ts";
import type { SchemaMeta, WalkedField } from "../core/types.ts";
import { walk } from "../core/walker.ts";
import type { WalkOptions } from "../core/walkBuilders.ts";
import { mergeHtmlResolvers } from "../core/renderer.ts";
import type { HtmlResolver } from "../core/renderer.ts";
import type { RejectUnrepresentableZod } from "../core/typeInference.ts";
import { toRecordOrUndefined } from "../core/guards.ts";
import type { InferFields, InferredValue } from "../core/inferValue.ts";
import { defaultHtmlResolver } from "./renderers.ts";
import { streamField } from "./streamRenderers.ts";

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

/**
 * Options accepted by the streaming HTML renderers
 * ({@link renderToHtmlChunks}, {@link renderToHtmlStream},
 * {@link renderToHtmlReadable}).
 *
 * The generic parameters mirror `<SchemaComponent>` so a typed
 * `schema` argument drives typed `value`, `ref`, and `fields` options.
 *
 * @group HTML
 */
export interface StreamRenderOptions<
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
// Sync chunk iterator
// ---------------------------------------------------------------------------

/**
 * Render a schema as a synchronous iterable of HTML string chunks. Each
 * chunk is a self-contained HTML fragment, ready to write to a stream
 * or concatenate into a single string. Use when the host can flush
 * output incrementally but does not need cooperative scheduling.
 *
 * @group HTML
 * @example
 * ```tsx
 * import { renderToHtmlChunks } from "schema-components/html/renderToHtmlStream";
 *
 * for (const chunk of renderToHtmlChunks(userSchema, { value: user })) {
 *   response.write(chunk);
 * }
 * ```
 */
export function renderToHtmlChunks<
    T = unknown,
    Ref extends string | undefined = undefined,
    Mode extends SchemaIoSide = "output",
>(
    schema: RejectUnrepresentableZod<T>,
    options: StreamRenderOptions<T, Ref, Mode> = {}
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
 * Render a schema as an async iterable of HTML string chunks. Yields
 * back to the event loop between chunks via a microtask so other tasks
 * (queued I/O, timers) can run between fragments.
 *
 * @group HTML
 */
export async function* renderToHtmlStream<
    T = unknown,
    Ref extends string | undefined = undefined,
    Mode extends SchemaIoSide = "output",
>(
    schema: RejectUnrepresentableZod<T>,
    options: StreamRenderOptions<T, Ref, Mode> = {}
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
 * Render a schema as a web `ReadableStream<string>` so it can be piped
 * into a `Response` body. Pulls chunks lazily from the synchronous
 * chunk iterator under the hood.
 *
 * @group HTML
 * @example
 * ```tsx
 * import { renderToHtmlReadable } from "schema-components/html/renderToHtmlStream";
 *
 * return new Response(renderToHtmlReadable(userSchema, { value: user }), {
 *   headers: { "content-type": "text/html" },
 * });
 * ```
 */
export function renderToHtmlReadable<
    T = unknown,
    Ref extends string | undefined = undefined,
    Mode extends SchemaIoSide = "output",
>(
    schema: RejectUnrepresentableZod<T>,
    options: StreamRenderOptions<T, Ref, Mode> = {}
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

/**
 * Internal shape passed to `prepareTree` — the loose runtime view of
 * `StreamRenderOptions<T, Ref, Mode>` after the generic parameters are
 * erased. Mirrors `StreamRenderOptions` but with the typed fields
 * widened to the underlying runtime types so the helper can accept any
 * specialisation produced by the public generic entry points.
 */
interface PrepareTreeOptions {
    value?: unknown;
    ref?: string | undefined;
    fields?: unknown;
    meta?: SchemaMeta;
    readOnly?: boolean;
    writeOnly?: boolean;
    description?: string;
    resolver?: HtmlResolver;
}

function prepareTree(
    schema: unknown,
    options: PrepareTreeOptions
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
        fieldOverrides: toRecordOrUndefined(options.fields),
        rootDocument,
    };

    const tree = walk(jsonSchema, walkOptions);
    const resolver = options.resolver ?? defaultHtmlResolver;

    return { tree, resolver };
}

// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------

/**
 * Cooperative scheduler yield used between async chunks. Resolves on the
 * next microtask so the event loop can process queued I/O and timers
 * without the four-millisecond clamp browsers apply to nested
 * `setTimeout(..., 0)` calls. The cumulative cost of `setTimeout`-based
 * yielding on a deep schema is measurable; the microtask form is free.
 */
function schedulerYield(): Promise<undefined> {
    return new Promise((resolve) => {
        queueMicrotask(() => {
            resolve(undefined);
        });
    });
}
