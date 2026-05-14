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
import { isObject } from "../core/guards.ts";

// ---------------------------------------------------------------------------
// Document caching
// ---------------------------------------------------------------------------

const docCache = new WeakMap<object, OpenApiDocument>();

/**
 * Parse and cache an OpenAPI document. Returns cached version if
 * the same object identity has been seen before.
 */
export function getParsed(doc: Record<string, unknown>): OpenApiDocument {
    const cached = docCache.get(doc);
    if (cached !== undefined) return cached;
    const parsed = parseOpenApiDocument(doc);
    docCache.set(doc, parsed);
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

export interface ResolvedOperation {
    operation: OperationInfo;
    parameters: ParameterInfo[];
    requestBody: ReturnType<typeof getRequestBody>;
    responses: ResponseInfo[];
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
