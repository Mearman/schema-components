/**
 * OpenAPI document parser.
 *
 * Extracts schemas from OpenAPI 3.x documents, resolves $ref pointers,
 * and produces the structure needed for rendering operations and components.
 *
 * All narrowing uses type guards — no type assertions.
 */

import type { JsonObject } from "../core/types.ts";

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

function isObject(value: unknown): value is JsonObject {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getProperty(value: unknown, key: string): unknown {
    if (!isObject(value)) return undefined;
    return value[key];
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
    operation: JsonObject;
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
                schemas.set(
                    `#/components/schemas/${name}`,
                    resolveRefs(schema, doc)
                );
            }
        }
    }

    return { doc, schemas };
}

export function getSchema(
    doc: OpenApiDocument,
    ref: string
): JsonObject | undefined {
    const cached = doc.schemas.get(ref);
    if (cached) return cached;

    const resolved = resolveRef(doc.doc, ref);
    if (resolved !== undefined) {
        const resolvedWithRefs = resolveRefs(resolved, doc.doc);
        doc.schemas.set(ref, resolvedWithRefs);
        return resolvedWithRefs;
    }

    return undefined;
}

// ---------------------------------------------------------------------------
// Operation extraction
// ---------------------------------------------------------------------------

const METHODS = ["get", "post", "put", "patch", "delete"];

export function listOperations(doc: OpenApiDocument): OperationInfo[] {
    const operations: OperationInfo[] = [];
    const paths = getProperty(doc.doc, "paths");

    if (!isObject(paths)) return operations;

    for (const [path, pathItem] of Object.entries(paths)) {
        if (!isObject(pathItem)) continue;

        for (const method of METHODS) {
            const operation = getProperty(pathItem, method);
            if (isObject(operation)) {
                operations.push({ path, method, operation });
            }
        }
    }

    return operations;
}

export function getRequestBodySchema(
    doc: OpenApiDocument,
    path: string,
    method: string
): JsonObject | undefined {
    const paths = getProperty(doc.doc, "paths");
    const pathItem = getProperty(paths, path);
    const operation = getProperty(pathItem, method);
    const requestBody = getProperty(operation, "requestBody");
    const content = getProperty(requestBody, "content");

    // Try application/json first
    const json = getProperty(content, "application/json");
    const jsonSchema = getProperty(json, "schema");
    if (isObject(jsonSchema)) return jsonSchema;

    // Fall back to first available content type
    if (isObject(content)) {
        for (const mediaType of Object.values(content)) {
            const schema = getProperty(mediaType, "schema");
            if (isObject(schema)) return schema;
        }
    }

    return undefined;
}

export function getResponseSchema(
    doc: OpenApiDocument,
    path: string,
    method: string,
    status: string
): JsonObject | undefined {
    const paths = getProperty(doc.doc, "paths");
    const pathItem = getProperty(paths, path);
    const operation = getProperty(pathItem, method);
    const responses = getProperty(operation, "responses");
    const response = getProperty(responses, status);
    const content = getProperty(response, "content");
    const json = getProperty(content, "application/json");
    const schema = getProperty(json, "schema");
    if (isObject(schema)) return schema;
    return undefined;
}

// ---------------------------------------------------------------------------
// $ref resolution
// ---------------------------------------------------------------------------

function resolveRef(doc: JsonObject, ref: string): JsonObject | undefined {
    if (!ref.startsWith("#/")) return undefined;

    const parts = ref.slice(2).split("/");
    let current: unknown = doc;

    for (const part of parts) {
        current = getProperty(current, part);
    }

    if (isObject(current)) return current;
    return undefined;
}

function resolveRefs(schema: JsonObject, doc: JsonObject): JsonObject {
    const result: JsonObject = {};

    for (const [key, value] of Object.entries(schema)) {
        if (key === "$ref" && typeof value === "string") {
            const resolved = resolveRef(doc, value);
            if (resolved !== undefined) {
                const resolvedDeep = resolveRefs(resolved, doc);
                for (const [rKey, rValue] of Object.entries(resolvedDeep)) {
                    result[rKey] = rValue;
                }
            }
        } else if (isObject(value)) {
            result[key] = resolveRefs(value, doc);
        } else {
            result[key] = value;
        }
    }

    return result;
}
