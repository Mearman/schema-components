/**
 * OpenAPI document parser.
 *
 * Extracts schemas and operations from OpenAPI 3.x documents.
 * Resolves `$ref` pointers inline so consumers get complete schemas.
 *
 * The parser is a standalone utility — OpenAPI consumers can use it
 * directly without going through the adapter. The adapter handles
 * the simpler case of rendering a single schema from a ref string.
 *
 * All narrowing uses type guards — no type assertions.
 */

import type { JsonObject } from "../core/types.ts";
import { getProperty, isObject } from "../core/guards.ts";

// Type guards imported from core/guards.ts

function getString(value: unknown, key: string): string | undefined {
    const result = isObject(value) ? value[key] : undefined;
    return typeof result === "string" ? result : undefined;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OpenApiDocument {
    doc: JsonObject;
    schemas: Map<string, JsonObject>;
}

export interface OperationInfo {
    path: string;
    method: string;
    operationId: string | undefined;
    summary: string | undefined;
    description: string | undefined;
    deprecated: boolean;
    operation: JsonObject;
}

export type ParameterLocation = "query" | "path" | "header" | "cookie";

export interface ParameterInfo {
    name: string;
    location: ParameterLocation;
    required: boolean;
    deprecated: boolean;
    description: string | undefined;
    schema: JsonObject | undefined;
}

export interface ResponseInfo {
    statusCode: string;
    description: string | undefined;
    contentTypes: string[];
    schema: JsonObject | undefined;
}

export interface RequestBodyInfo {
    required: boolean;
    description: string | undefined;
    contentTypes: string[];
    schema: JsonObject | undefined;
}

function toParameterLocation(value: unknown): ParameterLocation {
    if (
        value === "query" ||
        value === "path" ||
        value === "header" ||
        value === "cookie"
    ) {
        return value;
    }
    return "query";
}

// ---------------------------------------------------------------------------
// Document parsing
// ---------------------------------------------------------------------------

export function parseOpenApiDocument(doc: JsonObject): OpenApiDocument {
    const schemas = new Map<string, JsonObject>();

    const components = getProperty(doc, "components");
    const componentSchemas = getProperty(components, "schemas");

    if (isObject(componentSchemas)) {
        for (const [name, schema] of Object.entries(componentSchemas)) {
            if (isObject(schema)) {
                schemas.set(`#/components/schemas/${name}`, schema);
            }
        }
    }

    return { doc, schemas };
}

export function getSchema(
    parsed: OpenApiDocument,
    ref: string
): JsonObject | undefined {
    const cached = parsed.schemas.get(ref);
    if (cached !== undefined) return cached;

    const resolved = resolveRefInDoc(parsed.doc, ref);
    if (resolved !== undefined) {
        parsed.schemas.set(ref, resolved);
        return resolved;
    }

    return undefined;
}

// ---------------------------------------------------------------------------
// Operation extraction
// ---------------------------------------------------------------------------

const METHODS = ["get", "post", "put", "patch", "delete"] as const;

export function listOperations(parsed: OpenApiDocument): OperationInfo[] {
    const operations: OperationInfo[] = [];
    const paths = getProperty(parsed.doc, "paths");

    if (!isObject(paths)) return operations;

    for (const [path, pathItem] of Object.entries(paths)) {
        if (!isObject(pathItem)) continue;

        for (const method of METHODS) {
            const operation = getProperty(pathItem, method);
            if (!isObject(operation)) continue;

            operations.push({
                path,
                method,
                operationId: getString(operation, "operationId"),
                summary: getString(operation, "summary"),
                description: getString(operation, "description"),
                deprecated: getProperty(operation, "deprecated") === true,
                operation,
            });
        }
    }

    return operations;
}

// ---------------------------------------------------------------------------
// Parameters
// ---------------------------------------------------------------------------

export function getParameters(
    parsed: OpenApiDocument,
    path: string,
    method: string
): ParameterInfo[] {
    const paths = getProperty(parsed.doc, "paths");
    const pathItem = getProperty(paths, path);
    if (!isObject(pathItem)) return [];

    const operation = getProperty(pathItem, method);
    if (!isObject(operation)) return [];

    // Merge path-level and operation-level parameters
    // Operation-level overrides path-level for same name+in
    const pathParams = extractParameterList(
        getProperty(pathItem, "parameters")
    );
    const opParams = extractParameterList(getProperty(operation, "parameters"));

    // Build map: name+in → ParameterInfo, operation-level wins
    const map = new Map<string, ParameterInfo>();
    for (const param of pathParams) {
        map.set(`${param.name}:${param.location}`, param);
    }
    for (const param of opParams) {
        map.set(`${param.name}:${param.location}`, param);
    }

    return [...map.values()];
}

function extractParameterList(parameters: unknown): ParameterInfo[] {
    if (!Array.isArray(parameters)) return [];

    const result: ParameterInfo[] = [];
    for (const param of parameters) {
        if (!isObject(param)) continue;

        const name = getProperty(param, "name");
        const location = getProperty(param, "in");
        if (typeof name !== "string" || typeof location !== "string") continue;

        // Resolve $ref on the parameter itself
        const resolved = resolveParam(param);

        // The schema might be a $ref too — leave it for the walker
        const schema = getProperty(resolved, "schema");

        result.push({
            name,
            location: toParameterLocation(location),
            required: getProperty(resolved, "required") === true,
            deprecated: getProperty(resolved, "deprecated") === true,
            description: getString(resolved, "description"),
            schema: isObject(schema) ? schema : undefined,
        });
    }
    return result;
}

function resolveParam(param: JsonObject): JsonObject {
    const ref = getProperty(param, "$ref");
    if (typeof ref === "string" && ref.startsWith("#/")) {
        // Resolve to components/parameters/Name
        const resolved = resolveRefInDoc(param, ref);
        if (resolved !== undefined) return resolved;
    }
    return param;
}

// ---------------------------------------------------------------------------
// Request body
// ---------------------------------------------------------------------------

export function getRequestBody(
    parsed: OpenApiDocument,
    path: string,
    method: string
): RequestBodyInfo | undefined {
    const paths = getProperty(parsed.doc, "paths");
    const pathItem = getProperty(paths, path);
    const operation = getProperty(pathItem, method);
    const requestBody = getProperty(operation, "requestBody");
    if (!isObject(requestBody)) return undefined;

    const content = getProperty(requestBody, "content");
    if (!isObject(content)) {
        return {
            required: getProperty(requestBody, "required") === true,
            description: getString(requestBody, "description"),
            contentTypes: [],
            schema: undefined,
        };
    }

    const contentTypes = Object.keys(content);
    const schema = extractSchemaFromContent(content);

    return {
        required: getProperty(requestBody, "required") === true,
        description: getString(requestBody, "description"),
        contentTypes,
        schema,
    };
}

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

export function getResponses(
    parsed: OpenApiDocument,
    path: string,
    method: string
): ResponseInfo[] {
    const paths = getProperty(parsed.doc, "paths");
    const pathItem = getProperty(paths, path);
    const operation = getProperty(pathItem, method);
    const responses = getProperty(operation, "responses");
    if (!isObject(responses)) return [];

    const result: ResponseInfo[] = [];
    for (const [statusCode, response] of Object.entries(responses)) {
        if (!isObject(response)) continue;

        const content = getProperty(response, "content");
        const contentTypes = isObject(content) ? Object.keys(content) : [];
        const schema = isObject(content)
            ? extractSchemaFromContent(content)
            : undefined;

        result.push({
            statusCode,
            description: getString(response, "description"),
            contentTypes,
            schema,
        });
    }
    return result;
}

// ---------------------------------------------------------------------------
// Content type → schema extraction
// ---------------------------------------------------------------------------

function extractSchemaFromContent(content: JsonObject): JsonObject | undefined {
    // Try application/json first
    const json = getProperty(content, "application/json");
    const jsonSchema = getProperty(json, "schema");
    if (isObject(jsonSchema)) return jsonSchema;

    // Fall back to first available content type
    for (const mediaType of Object.values(content)) {
        if (!isObject(mediaType)) continue;
        const schema = getProperty(mediaType, "schema");
        if (isObject(schema)) return schema;
    }

    return undefined;
}

// ---------------------------------------------------------------------------
// $ref resolution
// ---------------------------------------------------------------------------

function resolveRefInDoc(doc: JsonObject, ref: string): JsonObject | undefined {
    if (!ref.startsWith("#/")) return undefined;

    const parts = ref.slice(2).split("/");
    let current: unknown = doc;

    for (const part of parts) {
        if (!isObject(current)) return undefined;
        // JSON Pointer: ~1 → /, ~0 → ~
        const decoded = part.replace(/~1/g, "/").replace(/~0/g, "~");
        current = current[decoded];
    }

    return isObject(current) ? current : undefined;
}
