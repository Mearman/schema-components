/**
 * Schema adapter — normalises all inputs to Zod schemas.
 *
 * - Zod 4 schemas → used directly
 * - Zod 3 schemas → error (not yet supported)
 * - JSON Schema objects → converted via z.fromJSONSchema()
 * - OpenAPI documents → schemas extracted then converted via z.fromJSONSchema()
 *
 * This module is the boundary between untrusted input (JSON objects, unknown
 * schema formats) and the typed internals. All narrowing uses type guards —
 * no type assertions.
 */

import { z } from "zod";
import type { ZodSchema, JsonObject, SchemaMeta } from "./types.ts";

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

export type { ZodSchema, JsonObject, SchemaMeta };

export type SchemaInput = ZodSchema | JsonObject;
export type SchemaKind = "zod4" | "zod3" | "jsonSchema" | "openapi";

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

function isObject(value: unknown): value is JsonObject {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCallable(value: unknown): value is (...args: unknown[]) => unknown {
    return typeof value === "function";
}

function hasProperty(value: unknown, key: string): boolean {
    return isObject(value) && key in value;
}

function getProperty(value: unknown, key: string): unknown {
    if (!isObject(value)) return undefined;
    return value[key];
}

// ---------------------------------------------------------------------------
// Schema detection
// ---------------------------------------------------------------------------

export function detectSchemaKind(input: unknown): SchemaKind {
    if (hasProperty(input, "_zod")) return "zod4";
    if (hasProperty(input, "_def") && !hasProperty(input, "_zod"))
        return "zod3";
    if (hasProperty(input, "openapi")) return "openapi";
    return "jsonSchema";
}

// ---------------------------------------------------------------------------
// Schema normalisation — synchronous
// ---------------------------------------------------------------------------

export interface NormalisedSchema {
    /** The normalised Zod schema — a full Zod type object, not a plain record. */
    schema: unknown;
    rootMeta: SchemaMeta | undefined;
}

export function normaliseSchema(
    input: unknown,
    ref?: string
): NormalisedSchema {
    const kind = detectSchemaKind(input);

    switch (kind) {
        case "zod4":
            if (!isObject(input)) throw new Error("Invalid Zod 4 schema");
            return { schema: input, rootMeta: extractRootMeta(input) };
        case "zod3":
            return normaliseZod3();
        case "openapi":
            if (!isObject(input)) throw new Error("Invalid OpenAPI document");
            return normaliseOpenApi(input, ref);
        case "jsonSchema":
            if (!isObject(input)) throw new Error("Invalid JSON Schema");
            return normaliseJsonSchema(input);
    }
}

function normaliseJsonSchema(jsonSchema: JsonObject): NormalisedSchema {
    const result: unknown = z.fromJSONSchema(jsonSchema);
    return { schema: result, rootMeta: extractRootMetaFromJson(jsonSchema) };
}

function normaliseZod3(): never {
    throw new Error(
        "Zod 3 schemas are not yet supported. Convert to Zod 4 or provide JSON Schema directly."
    );
}

function normaliseOpenApi(
    doc: JsonObject,
    ref: string | undefined
): NormalisedSchema {
    const resolved = resolveOpenApiRef(doc, ref);
    const result: unknown = z.fromJSONSchema(resolved);
    return { schema: result, rootMeta: extractRootMetaFromJson(resolved) };
}

// ---------------------------------------------------------------------------
// OpenAPI ref resolution
// ---------------------------------------------------------------------------

function resolveOpenApiRef(
    doc: JsonObject,
    ref: string | undefined
): JsonObject {
    if (ref === undefined) {
        const components = getProperty(doc, "components");
        const schemas = getProperty(components, "schemas");
        if (!isObject(schemas)) {
            throw new Error(
                "OpenAPI document has no components/schemas and no ref was provided."
            );
        }
        const keys = Object.keys(schemas);
        const firstKey = keys[0];
        if (firstKey === undefined)
            throw new Error("OpenAPI document has empty components/schemas.");
        const first = schemas[firstKey];
        if (!isObject(first)) throw new Error("Schema is not an object.");
        return first;
    }

    // #/components/schemas/Name
    if (ref.startsWith("#/components/schemas/")) {
        const name = ref.slice("#/components/schemas/".length);
        const components = getProperty(doc, "components");
        const schemas = getProperty(components, "schemas");
        if (!isObject(schemas))
            throw new Error(`OpenAPI ref not found: ${ref}`);
        const resolved = schemas[name];
        if (!isObject(resolved))
            throw new Error(`OpenAPI ref not found: ${ref}`);
        return resolved;
    }

    // /path/method — extract request body schema
    const pathMatch = /^\/(.+)\/(get|post|put|patch|delete)$/.exec(ref);
    if (pathMatch?.[1] !== undefined && pathMatch[2] !== undefined) {
        const pathStr = pathMatch[1];
        const method = pathMatch[2];
        const paths = getProperty(doc, "paths");
        if (!isObject(paths)) throw new Error("OpenAPI document has no paths.");
        const pathObj = paths[`/${pathStr}`];
        if (!isObject(pathObj)) throw new Error(`Path not found: /${pathStr}`);
        const operation = pathObj[method];
        if (!isObject(operation))
            throw new Error(`Method ${method} not found on /${pathStr}`);
        const requestBody = getProperty(operation, "requestBody");
        if (!isObject(requestBody))
            throw new Error(`No requestBody for ${ref}`);
        const content = getProperty(requestBody, "content");
        if (!isObject(content)) throw new Error(`No content for ${ref}`);
        const json = getProperty(content, "application/json");
        if (!isObject(json)) throw new Error(`No application/json for ${ref}`);
        const schema = getProperty(json, "schema");
        if (!isObject(schema))
            throw new Error(`Could not resolve request body schema for ${ref}`);
        return schema;
    }

    throw new Error(`Unsupported OpenAPI ref format: ${ref}`);
}

// ---------------------------------------------------------------------------
// Root meta extraction
// ---------------------------------------------------------------------------

function extractRootMeta(schema: unknown): SchemaMeta | undefined {
    if (!isObject(schema)) return undefined;
    if (!("meta" in schema)) return undefined;
    const metaFn = schema.meta;
    if (!isCallable(metaFn)) return undefined;
    const result: unknown = metaFn();
    if (!isObject(result)) return undefined;
    const keys = Object.keys(result);
    if (keys.length === 0) return undefined;
    return spreadIntoSchemaMeta(result);
}

function spreadIntoSchemaMeta(obj: JsonObject): SchemaMeta {
    const meta: SchemaMeta = {};
    for (const [key, value] of Object.entries(obj)) {
        meta[key] = value;
    }
    return meta;
}

function extractRootMetaFromJson(
    jsonSchema: JsonObject
): SchemaMeta | undefined {
    const meta: SchemaMeta = {};
    if (jsonSchema.readOnly === true) meta.readOnly = true;
    if (jsonSchema.writeOnly === true) meta.writeOnly = true;
    if (typeof jsonSchema.description === "string")
        meta.description = jsonSchema.description;
    if (typeof jsonSchema.title === "string") meta.title = jsonSchema.title;
    if (typeof jsonSchema.deprecated === "boolean")
        meta.deprecated = jsonSchema.deprecated;
    return Object.keys(meta).length > 0 ? meta : undefined;
}
