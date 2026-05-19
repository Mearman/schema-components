/**
 * OpenAPI document resolution and caching.
 *
 * Pure functions for looking up operations, parameters, request bodies,
 * and responses from parsed OpenAPI documents. Extracted from components
 * for testability without React.
 */

import {
    parseOpenApiDocument,
    listAllOperations,
    extractParameters,
    extractRequestBody,
    extractResponses,
    type OpenApiDocument,
    type OperationInfo,
    type ParameterInfo,
    type RequestBodyInfo,
    type ResponseInfo,
} from "./parser.ts";
import { getProperty, isObject } from "../core/guards.ts";
import { MAX_PATH_ITEM_REF_HOPS } from "../core/limits.ts";
import { isPrototypePollutingKey } from "../core/uri.ts";
import { detectOpenApiVersion } from "../core/version.ts";
import {
    documentContainsKeyword,
    normaliseOpenApiSchemas,
} from "../core/normalise.ts";
import type {
    Diagnostic,
    DiagnosticSink,
    DiagnosticsOptions,
} from "../core/diagnostics.ts";
import { emitDiagnostic } from "../core/diagnostics.ts";
import { resolveRefChain } from "../core/refChain.ts";

// ---------------------------------------------------------------------------
// Document caching
// ---------------------------------------------------------------------------

/**
 * A single cached parse of an OpenAPI document together with every
 * doc-level diagnostic that normalisation emitted while producing it.
 *
 * Diagnostics are captured once — at first parse — and then replayed
 * through whatever sink each subsequent caller supplies. The cache
 * additionally remembers which sink functions have already received
 * the replay, so a parent that fans out across N child components
 * sharing the same sink (for example `ApiWebhooks` rendering
 * `ApiWebhook` per webhook entry) sees each captured diagnostic at
 * cardinality 1 — never N.
 *
 * Strict mode is a per-call decision, not a sink property: the same
 * sink may appear in a non-strict call and then a strict one. The
 * `notifiedSinks` set therefore tracks the bare sink function and
 * the replay path consults strict from the caller-supplied options.
 */
interface CachedParse {
    readonly parsed: OpenApiDocument;
    readonly diagnostics: readonly Diagnostic[];
    readonly notifiedSinks: WeakSet<DiagnosticSink>;
}

const docCache = new WeakMap<object, CachedParse>();

/**
 * Parse and cache an OpenAPI document. Returns the cached parse for the
 * same object identity.
 *
 * Before parsing, the document is run through the version-aware
 * normalisation pipeline (`normaliseOpenApiSchemas`) so OpenAPI 3.0.x
 * keywords (`nullable`, `discriminator`, `example`), OpenAPI 3.1.x
 * `discriminator`, and Swagger 2.0 documents are all converted to
 * canonical Draft 2020-12 form. The parser and downstream extractors
 * (`extractRequestBody`, `extractResponses`, etc.) then observe schemas in the
 * same form `<SchemaComponent>` does, keeping the OpenAPI components on
 * the same pipeline as the top-level adapter.
 *
 * ### Caching and diagnostics
 *
 * Normalisation runs at most once per document identity. The full set
 * of doc-level diagnostics emitted during that single run is captured
 * into the cache alongside the parsed result. Each caller-supplied
 * sink receives the captured diagnostics exactly once per cached
 * entry, no matter how many times `getParsed` is called with that
 * `(doc, sink)` pair.
 *
 * The previous implementation bypassed the cache whenever
 * `diagnostics` was supplied and re-ran the entire normalisation
 * pipeline against the new sink. That fired every doc-level
 * diagnostic once per call, so a parent like `ApiWebhooks` that
 * renders `ApiWebhook` per webhook entry caused N-fold emission of a
 * single real cause. With the new strategy, cardinality stays at one
 * per real cause regardless of how many child renders share the
 * sink.
 *
 * Strict mode is treated as a per-call invariant — see the internal
 * `replayCapturedDiagnostics` helper below for the rationale.
 */
export function getParsed(
    doc: Record<string, unknown>,
    diagnostics?: DiagnosticsOptions
): OpenApiDocument {
    let cached = docCache.get(doc);
    if (cached === undefined) {
        cached = buildCachedParse(doc);
        docCache.set(doc, cached);
        // Components expose `parsed.doc` (the normalised reference) as
        // the resolution root passed back into `getParsed` by nested
        // calls; a second lookup with that reference must hit the same
        // entry rather than re-running normalisation against a fresh
        // capturing sink.
        if (cached.parsed.doc !== doc) {
            docCache.set(cached.parsed.doc, cached);
        }
    }
    if (
        diagnostics?.diagnostics !== undefined ||
        diagnostics?.strict === true
    ) {
        replayCapturedDiagnostics(cached, diagnostics);
    }
    return cached.parsed;
}

/**
 * Run the normalisation, validation, and parse pipeline against a doc
 * once, capturing every emitted diagnostic into a private array. The
 * private array becomes the source of truth for later replay through
 * caller-supplied sinks.
 *
 * The internal capturing sink does NOT set `strict`. Letting strict
 * mode throw mid-walk would leave the cache empty and force every
 * subsequent caller to re-run the pipeline from scratch — and the
 * defect this caching strategy fixes was precisely that kind of
 * re-running. Strict is enforced instead during replay
 * (see `replayCapturedDiagnostics`).
 */
function buildCachedParse(doc: Record<string, unknown>): CachedParse {
    const captured: Diagnostic[] = [];
    const captureOpts: DiagnosticsOptions = {
        diagnostics: (d) => captured.push(d),
    };
    const version = detectOpenApiVersion(doc);
    // Detect OAS 3.0/3.1 `xml` Schema Object metadata before normalisation.
    // Swagger 2.0 already surfaces this from `swagger2.ts`; OAS 3.0 and 3.1
    // share the same Schema Object that includes the same `xml` keyword
    // and have no renderer surface for it. `documentContainsKeyword` is the
    // canonical cycle-safe scanner (visited-set protected) shared with
    // the normalisation pipeline.
    if (version?.major === 3 && documentContainsKeyword(doc, "xml")) {
        emitDiagnostic(captureOpts, {
            code: "dropped-swagger-feature",
            message: `OpenAPI ${String(version.major)}.${String(version.minor)} xml Schema Object metadata is not rendered and will be ignored`,
            pointer: "",
            detail: { feature: "xml", source: "openapi-3.x" },
        });
    }
    const normalisedDoc =
        version !== undefined
            ? normaliseOpenApiSchemas(doc, version, captureOpts)
            : doc;
    validateSecuritySchemeTypes(normalisedDoc, captureOpts);
    detectUnsupportedCrossSchemaRefs(normalisedDoc, captureOpts);
    const parsed = parseOpenApiDocument(normalisedDoc);
    return {
        parsed,
        diagnostics: captured,
        notifiedSinks: new WeakSet<DiagnosticSink>(),
    };
}

/**
 * Replay each captured diagnostic through the caller-supplied options.
 *
 * Strict mode is treated as a per-call invariant: when `strict` is set
 * we always run the replay so the first captured diagnostic throws,
 * matching the historical fail-fast contract regardless of how many
 * times the cache has previously notified the sink.
 *
 * Non-strict, sink-bearing callers de-duplicate at the function-
 * identity boundary: a second call with the same `(doc, sink)` pair
 * short-circuits because the sink has already seen every captured
 * diagnostic. This is the cardinality-1 guarantee that fixes the
 * N-fold emission caused by parent-fans-out-into-children renders.
 *
 * The sink is only marked notified after a successful replay so a
 * strict throw mid-replay does not silence a follow-up non-strict
 * call that still wants the full captured set.
 */
function replayCapturedDiagnostics(
    cached: CachedParse,
    opts: DiagnosticsOptions
): void {
    const sink = opts.diagnostics;
    const strict = opts.strict === true;
    if (!strict && sink !== undefined && cached.notifiedSinks.has(sink)) {
        return;
    }
    for (const diagnostic of cached.diagnostics) {
        emitDiagnostic(opts, diagnostic);
    }
    if (sink !== undefined) cached.notifiedSinks.add(sink);
}

/**
 * Coerce an unknown value to a record, returning `undefined` when the
 * value is not a plain object. Callers MUST handle the `undefined` case
 * explicitly — typically by rendering a "doc not an object" diagnostic
 * and short-circuiting, never by silently substituting `{}`.
 *
 * A previous implementation fell back to `{}` for non-objects, which
 * masked configuration mistakes (passing a string, `null`, an array, or
 * `undefined` as the OpenAPI document) as an empty document with no
 * operations.
 */
export function toDoc(value: unknown): Record<string, unknown> | undefined {
    return isObject(value) ? value : undefined;
}

/**
 * Known security scheme types per the OpenAPI 3.0/3.1 specification.
 * `mutualTLS` was added in OpenAPI 3.1. Unknown values surface a
 * `unknown-security-scheme-type` diagnostic so authors notice typos
 * (e.g. `mutalTLS`) that would otherwise render with no warning.
 */
const KNOWN_SECURITY_SCHEME_TYPES = new Set([
    "apiKey",
    "http",
    "oauth2",
    "openIdConnect",
    "mutualTLS",
]);

/**
 * Validate every `components.securitySchemes.<name>.type` against the
 * canonical OpenAPI security scheme types and emit
 * `unknown-security-scheme-type` for each entry whose type is not
 * recognised. Runs after normalisation so Swagger 2.0 documents (which
 * are already translated to OAS 3.x shapes by `translateSwaggerSecurityScheme`)
 * are validated alongside native 3.x documents.
 */
function validateSecuritySchemeTypes(
    doc: Record<string, unknown>,
    diagnostics: DiagnosticsOptions
): void {
    const components = doc.components;
    if (!isObject(components)) return;
    const schemes = components.securitySchemes;
    if (!isObject(schemes)) return;
    for (const [name, scheme] of Object.entries(schemes)) {
        if (!isObject(scheme)) continue;
        const type = scheme.type;
        if (typeof type !== "string") {
            emitDiagnostic(diagnostics, {
                code: "unknown-security-scheme-type",
                message: `Security scheme "${name}" has no type or a non-string type`,
                pointer: `/components/securitySchemes/${name}/type`,
                detail: { name, type },
            });
            continue;
        }
        if (!KNOWN_SECURITY_SCHEME_TYPES.has(type)) {
            emitDiagnostic(diagnostics, {
                code: "unknown-security-scheme-type",
                message: `Security scheme "${name}" declares unknown type "${type}"`,
                pointer: `/components/securitySchemes/${name}/type`,
                detail: { name, type },
            });
        }
    }
}

/**
 * Detect any `$ref` strings that survived normalisation in a non-
 * fragment shape (anything not starting with `#/` or `#`). After
 * `normaliseOpenApiSchemas` runs `resolveRelativeRefs`, every relative
 * `$ref` within a Schema Object is rewritten to an absolute fragment.
 * Refs that *cross* Schema Object boundaries — for example, a relative
 * ref inside one component schema pointing into another via a sibling
 * `$id` — cannot be resolved by the current pipeline (this is a
 * documented limitation; see the JSDoc on this function).
 *
 * Emit a single diagnostic per offending ref so consumers notice
 * silently broken references rather than discovering them only when
 * the walker fails to render the target.
 *
 * NOTE: We can't determine "crossing" cleanly from the parser alone —
 * doing so would require modelling every Schema Object's $id scope.
 * As a pragmatic approximation, any surviving non-`#`-prefixed `$ref`
 * is treated as cross-Schema-Object unsupported. False positives
 * (legitimate external refs that the consumer planned to bundle later)
 * are still useful — they confirm an unresolved reference is present.
 */
function detectUnsupportedCrossSchemaRefs(
    doc: Record<string, unknown>,
    diagnostics: DiagnosticsOptions
): void {
    const seenRefs = new Set<string>();
    const walk = (node: unknown, pointer: string): void => {
        if (Array.isArray(node)) {
            for (const [index, item] of node.entries()) {
                walk(item, `${pointer}/${String(index)}`);
            }
            return;
        }
        if (!isObject(node)) return;
        const ref = node.$ref;
        if (
            typeof ref === "string" &&
            !ref.startsWith("#") &&
            !seenRefs.has(ref)
        ) {
            seenRefs.add(ref);
            emitDiagnostic(diagnostics, {
                code: "cross-schema-relative-ref-unsupported",
                message: `Relative \`$ref\` "${ref}" was not resolved during normalisation; cross-Schema-Object relative refs are not currently supported`,
                pointer,
                detail: { ref },
            });
            return;
        }
        for (const [key, value] of Object.entries(node)) {
            walk(value, `${pointer}/${key}`);
        }
    };
    walk(doc, "");
}

// ---------------------------------------------------------------------------
// Operation resolution
// ---------------------------------------------------------------------------

/**
 * Path-Item-level metadata. OpenAPI 3.1 added `summary` and `description`
 * to Path Item Objects alongside the existing operation-level fields.
 * Both are plain strings (no Markdown rendering at this layer).
 */
export interface PathItemInfo {
    summary: string | undefined;
    description: string | undefined;
}

/**
 * Aggregate view of a single OpenAPI operation: the operation itself,
 * its Path Item Object context, merged parameters, request body, and
 * responses. Produced by {@link resolveOperation} for rendering and
 * inspection.
 */
export interface ResolvedOperation {
    operation: OperationInfo;
    pathItem: PathItemInfo;
    parameters: ParameterInfo[];
    requestBody: RequestBodyInfo | undefined;
    responses: ResponseInfo[];
}

/**
 * Look up a Path Item Object on the (already-normalised) parsed document,
 * following a single `$ref` hop into `components/pathItems` (OpenAPI 3.1)
 * if present. Returns `undefined` when the path is not present or the
 * value is not an object.
 *
 * Implemented inside `resolve.ts` to avoid touching `parser.ts` while
 * still surfacing path-item-level metadata to the React layer.
 */
function lookupPathItemNode(
    parsed: OpenApiDocument,
    path: string,
    diagnostics?: DiagnosticsOptions
): Record<string, unknown> | undefined {
    const paths = getProperty(parsed.doc, "paths");
    const webhooks = getProperty(parsed.doc, "webhooks");
    const pathsEntry = getProperty(paths, path);
    const webhooksEntry = getProperty(webhooks, path);
    // When the same identifier addresses an entry in both `paths` and
    // `webhooks`, the previous implementation silently picked the path
    // and discarded the webhook. Surface the collision so authors
    // notice the ambiguity, then keep `paths` as the deterministic
    // winner (matching the prior behaviour so existing renders are
    // stable).
    if (isObject(pathsEntry) && isObject(webhooksEntry)) {
        emitDiagnostic(diagnostics, {
            code: "path-webhook-name-collision",
            message: `Identifier "${path}" appears in both \`paths\` and \`webhooks\`; \`paths\` takes precedence`,
            pointer: `/paths/${path.replace(/~/g, "~0").replace(/\//g, "~1")}`,
            detail: { name: path },
        });
    }
    const fromPaths = resolvePathItemNode(parsed, pathsEntry, diagnostics);
    if (fromPaths !== undefined) return fromPaths;
    // OpenAPI 3.1 webhook fallback: identifiers without a leading `/`
    // can address `webhooks/<name>` directly, so the same accessors and
    // path-item metadata extractors work for both maps.
    return resolvePathItemNode(parsed, webhooksEntry, diagnostics);
}

/**
 * Resolve a fragment `$ref` (must start with `#/`) against the parsed
 * document by walking the JSON Pointer one segment at a time. Returns
 * the resolved node only when every segment lands on a plain object;
 * returns `undefined` when any intermediate segment is missing or
 * non-object, or when the final node is not an object.
 *
 * Rejects `__proto__`, `constructor`, `prototype` segments — walking
 * into any of these reads `Object.prototype` and would let a crafted
 * pathItems `$ref` smuggle properties from the runtime prototype
 * chain into the resolved Path Item Object.
 */
function lookupFragmentRef(
    parsed: OpenApiDocument,
    ref: string
): Record<string, unknown> | undefined {
    if (!ref.startsWith("#/")) return undefined;
    const parts = ref.slice(2).split("/");
    let node: unknown = parsed.doc;
    for (const part of parts) {
        if (!isObject(node)) return undefined;
        const decoded = part.replace(/~1/g, "/").replace(/~0/g, "~");
        if (isPrototypePollutingKey(decoded)) return undefined;
        node = node[decoded];
    }
    return isObject(node) ? node : undefined;
}

function resolvePathItemNode(
    parsed: OpenApiDocument,
    pathItem: unknown,
    diagnostics?: DiagnosticsOptions
): Record<string, unknown> | undefined {
    if (!isObject(pathItem)) return undefined;

    // Multi-hop `$ref` resolution: follow each `$ref` until we land on
    // a non-ref Path Item Object, detect a cycle, or hit the depth cap.
    // OpenAPI 3.1 explicitly permits `pathItems` references through
    // `components/pathItems` and allows chains of refs — a single-hop
    // resolver silently rendered nothing for chains of length > 1.
    //
    // Delegated to the canonical `resolveRefChain` helper so cycle
    // detection, depth tracking, and the lookup boundary follow the
    // same discipline as every other multi-hop ref site in the library.
    return resolveRefChain<Record<string, unknown>>(pathItem, {
        lookup: (ref) => lookupFragmentRef(parsed, ref),
        extractRef: (node) => {
            const ref = getProperty(node, "$ref");
            if (typeof ref !== "string") return undefined;
            // Only fragment refs participate in the chain. Anything
            // else (absolute URIs, relative refs that survived
            // normalisation) is treated as the terminal value and
            // returned to the caller unchanged.
            if (!ref.startsWith("#/")) return undefined;
            return ref;
        },
        onCycle: (ref) => {
            emitDiagnostic(diagnostics, {
                code: "cyclic-path-item-ref",
                message: `Cyclic Path Item Object $ref "${ref}"`,
                pointer: ref,
                detail: { ref },
            });
            return undefined;
        },
        onDepthExceeded: () => {
            emitDiagnostic(diagnostics, {
                code: "path-item-ref-too-deep",
                message: `Path Item Object $ref chain exceeded ${String(MAX_PATH_ITEM_REF_HOPS)} hops`,
                pointer: "",
                detail: { maxHops: MAX_PATH_ITEM_REF_HOPS },
            });
            return undefined;
        },
        maxHops: MAX_PATH_ITEM_REF_HOPS,
    });
}

function extractPathItemInfo(pathItem: Record<string, unknown>): PathItemInfo {
    const summary = pathItem.summary;
    const description = pathItem.description;
    return {
        summary: typeof summary === "string" ? summary : undefined,
        description: typeof description === "string" ? description : undefined,
    };
}

/**
 * Resolve an operation from an OpenAPI document by path and method.
 * Throws if the operation is not found.
 *
 * Accepts either a raw document (parsed lazily via {@link getParsed}'s
 * WeakMap cache) or an already-parsed {@link OpenApiDocument}. Callers
 * that have a parsed document at hand can pass it directly to avoid
 * an extra cache lookup; everyone else trusts the cache.
 *
 * `diagnostics` is forwarded to {@link getParsed} so normalisation
 * events surface to the caller's sink exactly once per `(doc, sink)`
 * pair, no matter how many times this function is called.
 */
export function resolveOperation(
    doc: Record<string, unknown> | OpenApiDocument,
    path: string,
    method: string,
    diagnostics?: DiagnosticsOptions
): ResolvedOperation {
    const parsed = ensureParsed(doc, diagnostics);

    // Run path-item lookup first so multi-hop diagnostics
    // (cyclic-path-item-ref, path-item-ref-too-deep) surface before
    // the operation-not-found error. Without this, a Path Item with a
    // broken ref chain throws Operation not found and the underlying
    // cause never reaches the diagnostic sink.
    const pathItemNode = lookupPathItemNode(parsed, path, diagnostics);

    // Match against both `paths` and OpenAPI 3.1 `webhooks` — every
    // downstream accessor (`extractParameters`, `extractRequestBody`,
    // `extractResponses`) already resolves either through `lookupPathItem`,
    // so a single composed list keeps the failure-mode symmetrical.
    const operations = listAllOperations(parsed);
    const operation = operations.find(
        (op) => op.path === path && op.method === method
    );

    if (operation === undefined) {
        throw new Error(`Operation not found: ${method.toUpperCase()} ${path}`);
    }

    if (pathItemNode === undefined) {
        // listOperations / listWebhooks found the operation by iterating
        // the document, so the path or webhook entry must exist and
        // resolve to an object. Reaching this branch means an upstream
        // invariant has broken (or a multi-hop ref chain was rejected,
        // which already emitted a diagnostic above).
        throw new Error(
            `Path item missing for ${method.toUpperCase()} ${path}`
        );
    }

    return {
        operation,
        pathItem: extractPathItemInfo(pathItemNode),
        parameters: extractParameters(parsed, path, method),
        requestBody: extractRequestBody(parsed, path, method),
        responses: extractResponses(parsed, path, method),
    };
}

/**
 * Coerce the first argument of every `resolveX` function — either a
 * raw OpenAPI document or an already-parsed {@link OpenApiDocument} —
 * into a parsed view. Distinguishes the two by the presence of the
 * `schemas` map on the parsed shape; falls through to {@link getParsed}
 * for raw documents (which itself short-circuits on a WeakMap cache).
 */
function ensureParsed(
    doc: Record<string, unknown> | OpenApiDocument,
    diagnostics: DiagnosticsOptions | undefined
): OpenApiDocument {
    if (isParsedDocument(doc)) {
        // Already parsed — replay captured diagnostics through the
        // caller's sink if one was supplied, mirroring `getParsed`.
        const cached = docCache.get(doc.doc);
        if (
            cached !== undefined &&
            (diagnostics?.diagnostics !== undefined ||
                diagnostics?.strict === true)
        ) {
            replayCapturedDiagnostics(cached, diagnostics);
        }
        return doc;
    }
    return getParsed(doc, diagnostics);
}

/**
 * Decide whether `value` is an already-parsed {@link OpenApiDocument}.
 * The parsed shape carries a `schemas` Map alongside the raw `doc`
 * object; a raw OpenAPI document has neither — its keys are
 * `openapi`/`swagger`, `info`, `paths`, etc.
 */
function isParsedDocument(
    value: Record<string, unknown> | OpenApiDocument
): value is OpenApiDocument {
    return isObject(value.doc) && value.schemas instanceof Map;
}

// ---------------------------------------------------------------------------
// Parameter resolution
// ---------------------------------------------------------------------------

/**
 * Resolve parameters for an operation. Returns an empty array if none.
 *
 * Accepts either a raw document or an already-parsed
 * {@link OpenApiDocument}. `diagnostics` is forwarded to
 * {@link getParsed} so normalisation events surface to the caller's
 * sink.
 */
export function resolveParameters(
    doc: Record<string, unknown> | OpenApiDocument,
    path: string,
    method: string,
    diagnostics?: DiagnosticsOptions
): ParameterInfo[] {
    return extractParameters(ensureParsed(doc, diagnostics), path, method);
}

// ---------------------------------------------------------------------------
// Request body resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the request body for an operation. Returns `undefined` if
 * the operation declares no request body.
 *
 * Accepts either a raw document or an already-parsed
 * {@link OpenApiDocument}. `diagnostics` is forwarded to
 * {@link getParsed} so normalisation events surface to the caller's
 * sink.
 */
export function resolveRequestBody(
    doc: Record<string, unknown> | OpenApiDocument,
    path: string,
    method: string,
    diagnostics?: DiagnosticsOptions
): RequestBodyInfo | undefined {
    return extractRequestBody(ensureParsed(doc, diagnostics), path, method);
}

// ---------------------------------------------------------------------------
// Response resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a specific response by status code. Throws if not found.
 *
 * Accepts either a raw document or an already-parsed
 * {@link OpenApiDocument}. `diagnostics` is forwarded to
 * {@link getParsed} so normalisation events surface to the caller's
 * sink.
 */
export function resolveResponse(
    doc: Record<string, unknown> | OpenApiDocument,
    path: string,
    method: string,
    statusCode: string,
    diagnostics?: DiagnosticsOptions
): ResponseInfo {
    const responses = extractResponses(
        ensureParsed(doc, diagnostics),
        path,
        method
    );
    const response = responses.find((r) => r.statusCode === statusCode);

    if (response === undefined) {
        throw new Error(`Response not found: ${statusCode}`);
    }

    return response;
}

/**
 * Resolve all responses for an operation.
 *
 * Accepts either a raw document or an already-parsed
 * {@link OpenApiDocument}. `diagnostics` is forwarded to
 * {@link getParsed} so normalisation events surface to the caller's
 * sink.
 */
export function resolveResponses(
    doc: Record<string, unknown> | OpenApiDocument,
    path: string,
    method: string,
    diagnostics?: DiagnosticsOptions
): ResponseInfo[] {
    return extractResponses(ensureParsed(doc, diagnostics), path, method);
}
