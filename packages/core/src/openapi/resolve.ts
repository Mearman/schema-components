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
    getParameters,
    getRequestBody,
    getResponses,
    type OpenApiDocument,
    type OperationInfo,
    type ParameterInfo,
    type ResponseInfo,
} from "./parser.ts";
import { getProperty, isObject } from "../core/guards.ts";
import { detectOpenApiVersion } from "../core/version.ts";
import { normaliseOpenApiSchemas } from "../core/normalise.ts";

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
 * The cache is keyed by the caller-supplied document so subsequent calls
 * with the same input bypass both normalisation and parsing.
 */
export function getParsed(doc: Record<string, unknown>): OpenApiDocument {
    const cached = docCache.get(doc);
    if (cached !== undefined) return cached;
    const version = detectOpenApiVersion(doc);
    const normalisedDoc =
        version !== undefined ? normaliseOpenApiSchemas(doc, version) : doc;
    const parsed = parseOpenApiDocument(normalisedDoc);
    // Cache by both the caller-supplied input and the normalised document.
    // Components expose `parsed.doc` (the normalised reference) as the
    // resolution root passed back into `getParsed` by nested calls; a
    // second lookup with that reference must hit the same parse result
    // rather than re-running normalisation.
    docCache.set(doc, parsed);
    if (normalisedDoc !== doc) docCache.set(normalisedDoc, parsed);
    return parsed;
}

/**
 * Coerce an unknown value to a record, returning an empty record
 * for non-objects.
 */
export function toDoc(value: unknown): Record<string, unknown> {
    return isObject(value) ? value : {};
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
    path: string
): Record<string, unknown> | undefined {
    const paths = getProperty(parsed.doc, "paths");
    const direct = getProperty(paths, path);
    const resolved = resolvePathItemNode(parsed, direct);
    if (resolved !== undefined) return resolved;
    // OpenAPI 3.1 webhook fallback — identifiers without a leading `/`
    // can address `webhooks/<name>`. Mirrors the parser's behaviour.
    const webhooks = getProperty(parsed.doc, "webhooks");
    return resolvePathItemNode(parsed, getProperty(webhooks, path));
}

function resolvePathItemNode(
    parsed: OpenApiDocument,
    pathItem: unknown
): Record<string, unknown> | undefined {
    if (!isObject(pathItem)) return undefined;
    const ref = getProperty(pathItem, "$ref");
    if (typeof ref !== "string") return pathItem;
    // Single hop into `components/pathItems/<Name>` — multi-step
    // resolution is the parser's responsibility for schemas.
    if (!ref.startsWith("#/")) return pathItem;
    const parts = ref.slice(2).split("/");
    let current: unknown = parsed.doc;
    for (const part of parts) {
        if (!isObject(current)) return undefined;
        const decoded = part.replace(/~1/g, "/").replace(/~0/g, "~");
        current = current[decoded];
    }
    return isObject(current) ? current : pathItem;
}

function extractPathItemInfo(
    pathItem: Record<string, unknown> | undefined
): PathItemInfo {
    if (pathItem === undefined) {
        return { summary: undefined, description: undefined };
    }
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
 */
export function resolveOperation(
    doc: Record<string, unknown>,
    path: string,
    method: string
): ResolvedOperation {
    const parsed = getParsed(doc);
    const operations = listOperations(parsed);
    const operation = operations.find(
        (op) => op.path === path && op.method === method
    );

    if (operation === undefined) {
        throw new Error(`Operation not found: ${method.toUpperCase()} ${path}`);
    }

    return {
        operation,
        pathItem: extractPathItemInfo(lookupPathItemNode(parsed, path)),
        parameters: getParameters(parsed, path, method),
        requestBody: getRequestBody(parsed, path, method),
        responses: getResponses(parsed, path, method),
    };
}

// ---------------------------------------------------------------------------
// Parameter resolution
// ---------------------------------------------------------------------------

/**
 * Resolve parameters for an operation. Returns empty array if none.
 */
export function resolveParameters(
    doc: Record<string, unknown>,
    path: string,
    method: string
): ParameterInfo[] {
    const parsed = getParsed(doc);
    return getParameters(parsed, path, method);
}

// ---------------------------------------------------------------------------
// Request body resolution
// ---------------------------------------------------------------------------

/**
 * Resolve request body for an operation. Returns undefined if none.
 */
export function resolveRequestBody(
    doc: Record<string, unknown>,
    path: string,
    method: string
): ReturnType<typeof getRequestBody> {
    const parsed = getParsed(doc);
    return getRequestBody(parsed, path, method);
}

// ---------------------------------------------------------------------------
// Response resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a specific response by status code. Throws if not found.
 */
export function resolveResponse(
    doc: Record<string, unknown>,
    path: string,
    method: string,
    statusCode: string
): ResponseInfo {
    const parsed = getParsed(doc);
    const responses = getResponses(parsed, path, method);
    const response = responses.find((r) => r.statusCode === statusCode);

    if (response === undefined) {
        throw new Error(`Response not found: ${statusCode}`);
    }

    return response;
}

/**
 * Resolve all responses for an operation.
 */
export function resolveResponses(
    doc: Record<string, unknown>,
    path: string,
    method: string
): ResponseInfo[] {
    const parsed = getParsed(doc);
    return getResponses(parsed, path, method);
}
