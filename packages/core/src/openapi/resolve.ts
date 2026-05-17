/**
 * OpenAPI document resolution and caching.
 *
 * Pure functions for looking up operations, parameters, request bodies,
 * and responses from parsed OpenAPI documents. Extracted from components
 * for testability without React.
 */

import {
    parseOpenApiDocument,
    listOperations,
    listWebhooks,
    getParameters,
    getRequestBody,
    getResponses,
    type OpenApiDocument,
    type OperationInfo,
    type ParameterInfo,
    type ResponseInfo,
} from "./parser.ts";
import { getProperty, isObject } from "../core/guards.ts";
import { MAX_PATH_ITEM_REF_HOPS } from "../core/limits.ts";
import { isPrototypePollutingKey } from "../core/uri.ts";
import { detectOpenApiVersion } from "../core/version.ts";
import { normaliseOpenApiSchemas } from "../core/normalise.ts";
import type { DiagnosticsOptions } from "../core/diagnostics.ts";
import { emitDiagnostic } from "../core/diagnostics.ts";

// ---------------------------------------------------------------------------
// Document caching
// ---------------------------------------------------------------------------

const docCache = new WeakMap<object, OpenApiDocument>();

/**
 * Parse and cache an OpenAPI document. Returns the cached parse for the
 * same object identity.
 *
 * Before parsing, the document is run through the version-aware
 * normalisation pipeline (`normaliseOpenApiSchemas`) so OpenAPI 3.0.x
 * keywords (`nullable`, `discriminator`, `example`), OpenAPI 3.1.x
 * `discriminator`, and Swagger 2.0 documents are all converted to
 * canonical Draft 2020-12 form. The parser and downstream extractors
 * (`getRequestBody`, `getResponses`, etc.) then observe schemas in the
 * same form `<SchemaComponent>` does, keeping the OpenAPI components on
 * the same pipeline as the top-level adapter.
 *
 * When `diagnostics` is supplied, normalisation events
 * (`duplicate-body-parameter`, `dropped-swagger-feature`,
 * `unknown-json-schema-dialect`, `divisible-by-conflict`,
 * `relative-ref-resolved`, etc.) are forwarded to the sink. Passing
 * diagnostics also bypasses the cache so each call observes the
 * normalisation pipeline running against the supplied sink — caching
 * would silently swallow every emission after the first.
 *
 * The cache is keyed by the caller-supplied document so subsequent
 * cache-eligible calls with the same input bypass both normalisation
 * and parsing.
 */
export function getParsed(
    doc: Record<string, unknown>,
    diagnostics?: DiagnosticsOptions
): OpenApiDocument {
    // The cache stores the result of a previous normalisation that did
    // not observe a diagnostics sink. Re-running normalisation is the
    // only way to surface diagnostics to a new sink, so callers that
    // supply diagnostics opt out of the cache entirely.
    if (diagnostics === undefined) {
        const cached = docCache.get(doc);
        if (cached !== undefined) return cached;
    }
    const version = detectOpenApiVersion(doc);
    // Detect OAS 3.0/3.1 `xml` Schema Object metadata before normalisation.
    // Swagger 2.0 already surfaces this from `swagger2.ts`; OAS 3.0 and 3.1
    // share the same Schema Object that includes the same `xml` keyword
    // and have no renderer surface for it. Emit a single diagnostic per
    // document so consumers can audit silent feature drops without spam.
    if (
        diagnostics !== undefined &&
        version?.major === 3 &&
        docHasXmlAnywhere(doc)
    ) {
        emitDiagnostic(diagnostics, {
            code: "dropped-swagger-feature",
            message: `OpenAPI ${String(version.major)}.${String(version.minor)} xml Schema Object metadata is not rendered and will be ignored`,
            pointer: "",
            detail: { feature: "xml", source: "openapi-3.x" },
        });
    }
    const normalisedDoc =
        version !== undefined
            ? normaliseOpenApiSchemas(doc, version, diagnostics)
            : doc;
    if (diagnostics !== undefined) {
        validateSecuritySchemeTypes(normalisedDoc, diagnostics);
        detectUnsupportedCrossSchemaRefs(normalisedDoc, diagnostics);
    }
    const parsed = parseOpenApiDocument(normalisedDoc);
    // Only populate the cache for the no-diagnostics path. Caching a
    // diagnostics-bearing parse would let later non-diagnostics callers
    // pick up a parse that already emitted into an unrelated sink — the
    // parse itself is fine, but the second cache lookup would skip
    // running diagnostics entirely if that later caller did supply one.
    if (diagnostics === undefined) {
        // Cache by both the caller-supplied input and the normalised
        // document. Components expose `parsed.doc` (the normalised
        // reference) as the resolution root passed back into `getParsed`
        // by nested calls; a second lookup with that reference must hit
        // the same parse result rather than re-running normalisation.
        docCache.set(doc, parsed);
        if (normalisedDoc !== doc) docCache.set(normalisedDoc, parsed);
    }
    return parsed;
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

/**
 * Recursively check whether any node in an OpenAPI document carries an
 * `xml` annotation. Walks both objects and arrays so the check works
 * for schemas in `components/schemas`, inline `paths`/`webhooks`
 * schemas, request bodies, responses, headers, and parameters. Used
 * by `getParsed` to surface the dropped-feature diagnostic for OAS
 * 3.0/3.1 — the Swagger 2.0 path has its own detection in
 * `swagger2.ts`.
 */
function docHasXmlAnywhere(node: unknown): boolean {
    if (Array.isArray(node)) {
        for (const item of node) {
            if (docHasXmlAnywhere(item)) return true;
        }
        return false;
    }
    if (!isObject(node)) return false;
    if ("xml" in node && isObject(node.xml)) return true;
    for (const value of Object.values(node)) {
        if (docHasXmlAnywhere(value)) return true;
    }
    return false;
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

export interface ResolvedOperation {
    operation: OperationInfo;
    pathItem: PathItemInfo;
    parameters: ParameterInfo[];
    requestBody: ReturnType<typeof getRequestBody>;
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
    const fromPaths = resolvePathItemNode(
        parsed,
        getProperty(paths, path),
        diagnostics
    );
    if (fromPaths !== undefined) return fromPaths;
    // OpenAPI 3.1 webhook fallback: identifiers without a leading `/`
    // can address `webhooks/<name>` directly, so the same accessors and
    // path-item metadata extractors work for both maps.
    const webhooks = getProperty(parsed.doc, "webhooks");
    return resolvePathItemNode(
        parsed,
        getProperty(webhooks, path),
        diagnostics
    );
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
    // `components/pathItems`, but allows chains of refs — a single-hop
    // resolver silently rendered nothing for chains of length > 1.
    const visited = new Set<string>();
    let current: Record<string, unknown> = pathItem;
    for (let hop = 0; hop < MAX_PATH_ITEM_REF_HOPS; hop++) {
        const ref = getProperty(current, "$ref");
        if (typeof ref !== "string") return current;
        if (!ref.startsWith("#/")) return current;
        if (visited.has(ref)) {
            emitDiagnostic(diagnostics, {
                code: "cyclic-path-item-ref",
                message: `Cyclic Path Item Object $ref "${ref}"`,
                pointer: ref,
                detail: { ref },
            });
            return undefined;
        }
        visited.add(ref);
        const parts = ref.slice(2).split("/");
        let node: unknown = parsed.doc;
        for (const part of parts) {
            if (!isObject(node)) return undefined;
            const decoded = part.replace(/~1/g, "/").replace(/~0/g, "~");
            // Reject prototype-polluting segments (`__proto__`,
            // `constructor`, `prototype`). Walking into any of these
            // reads `Object.prototype` and lets a crafted pathItems
            // `$ref` smuggle properties from the runtime prototype
            // chain into the resolved Path Item Object.
            if (isPrototypePollutingKey(decoded)) return undefined;
            node = node[decoded];
        }
        if (!isObject(node)) return current;
        current = node;
    }
    // Exceeded the hop cap — surface a diagnostic and bail.
    emitDiagnostic(diagnostics, {
        code: "path-item-ref-too-deep",
        message: `Path Item Object $ref chain exceeded ${String(MAX_PATH_ITEM_REF_HOPS)} hops`,
        pointer: "",
        detail: { maxHops: MAX_PATH_ITEM_REF_HOPS },
    });
    return undefined;
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
 * Resolve an operation against an already-parsed document. Throws if
 * the operation is not found.
 *
 * Used by callers that have already obtained a parsed document via
 * {@link getParsed} — most importantly the React components, which
 * supply `diagnostics` to `getParsed` and must avoid re-running the
 * normalisation pipeline (every re-run would emit each diagnostic
 * again into the sink).
 */
export function resolveOperationFromParsed(
    parsed: OpenApiDocument,
    path: string,
    method: string,
    diagnostics?: DiagnosticsOptions
): ResolvedOperation {
    // Run path-item lookup first so multi-hop diagnostics
    // (cyclic-path-item-ref, path-item-ref-too-deep) surface before
    // the operation-not-found error. Without this, a Path Item with a
    // broken ref chain throws Operation not found and the underlying
    // cause never reaches the diagnostic sink.
    const pathItemNode = lookupPathItemNode(parsed, path, diagnostics);

    // Match against both `paths` and OpenAPI 3.1 `webhooks` — every
    // downstream accessor (`getParameters`, `getRequestBody`,
    // `getResponses`) already resolves either through `lookupPathItem`,
    // so a single composed list keeps the failure-mode symmetrical.
    const operations = [
        ...listOperations(parsed),
        ...listWebhooks(parsed).flatMap((w) => w.operations),
    ];
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
        parameters: getParameters(parsed, path, method),
        requestBody: getRequestBody(parsed, path, method),
        responses: getResponses(parsed, path, method),
    };
}

/**
 * Resolve an operation from an OpenAPI document by path and method.
 * Throws if the operation is not found.
 *
 * `diagnostics` is forwarded to {@link getParsed} so normalisation
 * events surface to the caller's sink.
 */
export function resolveOperation(
    doc: Record<string, unknown>,
    path: string,
    method: string,
    diagnostics?: DiagnosticsOptions
): ResolvedOperation {
    const parsed = getParsed(doc, diagnostics);
    return resolveOperationFromParsed(parsed, path, method, diagnostics);
}

// ---------------------------------------------------------------------------
// Parameter resolution
// ---------------------------------------------------------------------------

/**
 * Resolve parameters against an already-parsed document. See
 * {@link resolveOperationFromParsed} for the rationale.
 */
export function resolveParametersFromParsed(
    parsed: OpenApiDocument,
    path: string,
    method: string
): ParameterInfo[] {
    return getParameters(parsed, path, method);
}

/**
 * Resolve parameters for an operation. Returns empty array if none.
 *
 * `diagnostics` is forwarded to {@link getParsed} so normalisation
 * events surface to the caller's sink.
 */
export function resolveParameters(
    doc: Record<string, unknown>,
    path: string,
    method: string,
    diagnostics?: DiagnosticsOptions
): ParameterInfo[] {
    return resolveParametersFromParsed(
        getParsed(doc, diagnostics),
        path,
        method
    );
}

// ---------------------------------------------------------------------------
// Request body resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a request body against an already-parsed document. See
 * {@link resolveOperationFromParsed} for the rationale.
 */
export function resolveRequestBodyFromParsed(
    parsed: OpenApiDocument,
    path: string,
    method: string
): ReturnType<typeof getRequestBody> {
    return getRequestBody(parsed, path, method);
}

/**
 * Resolve request body for an operation. Returns undefined if none.
 *
 * `diagnostics` is forwarded to {@link getParsed} so normalisation
 * events surface to the caller's sink.
 */
export function resolveRequestBody(
    doc: Record<string, unknown>,
    path: string,
    method: string,
    diagnostics?: DiagnosticsOptions
): ReturnType<typeof getRequestBody> {
    return resolveRequestBodyFromParsed(
        getParsed(doc, diagnostics),
        path,
        method
    );
}

// ---------------------------------------------------------------------------
// Response resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a specific response against an already-parsed document. See
 * {@link resolveOperationFromParsed} for the rationale.
 */
export function resolveResponseFromParsed(
    parsed: OpenApiDocument,
    path: string,
    method: string,
    statusCode: string
): ResponseInfo {
    const responses = getResponses(parsed, path, method);
    const response = responses.find((r) => r.statusCode === statusCode);

    if (response === undefined) {
        throw new Error(`Response not found: ${statusCode}`);
    }

    return response;
}

/**
 * Resolve a specific response by status code. Throws if not found.
 *
 * `diagnostics` is forwarded to {@link getParsed} so normalisation
 * events surface to the caller's sink.
 */
export function resolveResponse(
    doc: Record<string, unknown>,
    path: string,
    method: string,
    statusCode: string,
    diagnostics?: DiagnosticsOptions
): ResponseInfo {
    return resolveResponseFromParsed(
        getParsed(doc, diagnostics),
        path,
        method,
        statusCode
    );
}

/**
 * Resolve all responses for an operation.
 *
 * `diagnostics` is forwarded to {@link getParsed} so normalisation
 * events surface to the caller's sink.
 */
export function resolveResponses(
    doc: Record<string, unknown>,
    path: string,
    method: string,
    diagnostics?: DiagnosticsOptions
): ResponseInfo[] {
    const parsed = getParsed(doc, diagnostics);
    return getResponses(parsed, path, method);
}
