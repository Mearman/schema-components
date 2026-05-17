/**
 * Schema adapter — normalises all inputs to JSON Schema.
 *
 * - Zod 4 schemas → converted via z.toJSONSchema()
 * - Zod 3 schemas → error (not yet supported)
 * - JSON Schema objects → passed through
 * - OpenAPI documents → schemas extracted and passed through
 *
 * The adapter preserves the original Zod schema for validation.
 * All narrowing uses type guards — no type assertions.
 */

import { z } from "zod";
import type { JsonObject, SchemaMeta } from "./types.ts";
import { hasProperty, isObject, getProperty } from "./guards.ts";
import { dereference } from "./ref.ts";
import type { DiagnosticsOptions } from "./diagnostics.ts";
import { emitDiagnostic } from "./diagnostics.ts";
import type { JsonSchemaDraft } from "./version.ts";
import {
    inferJsonSchemaDraftWithReason,
    matchJsonSchemaDraftUri,
    detectOpenApiVersion,
    isSwagger2,
} from "./version.ts";
import {
    normaliseJsonSchema as normaliseForDraft,
    normaliseOpenApiSchemas,
} from "./normalise.ts";

// ---------------------------------------------------------------------------
// Schema cache — avoids redundant z.toJSONSchema() calls
// ---------------------------------------------------------------------------

const schemaCache = new WeakMap<object, NormalisedSchema>();

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

export type { JsonObject, SchemaMeta };

export type SchemaInput = Record<string, unknown>;
export type SchemaKind = "zod4" | "zod3" | "jsonSchema" | "openapi";

// Type guards and safe access imported from core/guards.ts

// ---------------------------------------------------------------------------
// Schema detection
// ---------------------------------------------------------------------------

export function detectSchemaKind(input: unknown): SchemaKind {
    if (hasProperty(input, "_zod")) return "zod4";
    if (hasProperty(input, "_def") && !hasProperty(input, "_zod"))
        return "zod3";
    if (hasProperty(input, "openapi") || hasProperty(input, "swagger"))
        return "openapi";
    return "jsonSchema";
}

// ---------------------------------------------------------------------------
// Zod toJSONSchema wrapper
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Zod toJSONSchema wrapper
// ---------------------------------------------------------------------------

/**
 * Wraps z.toJSONSchema() for a runtime-validated Zod schema.
 *
 * The _zod guard in normaliseZod4 has confirmed this is a valid Zod schema,
 * but TypeScript cannot represent "has _zod.def" as the $ZodType parameter
 * that z.toJSONSchema expects. This is the library boundary equivalent of
 * object → Record<string, unknown> — the type mismatch is genuinely unavoidable.
 */
function callToJsonSchema(schema: unknown): unknown {
    // @ts-expect-error — Library boundary: z.toJSONSchema requires $ZodType
    // but we have unknown validated by _zod guard. See function JSDoc.
    return z.toJSONSchema(schema);
}

// ---------------------------------------------------------------------------
// Schema normalisation — synchronous
// ---------------------------------------------------------------------------

export interface NormalisedSchema {
    /** JSON Schema object — the authoritative schema for rendering. */
    jsonSchema: JsonObject;
    /** Original Zod schema, if input was Zod. Used for validation. */
    zodSchema?: unknown;
    /** Root-level metadata. */
    rootMeta: SchemaMeta | undefined;
    /** The root document for $ref resolution. */
    rootDocument: JsonObject;
}

export interface NormaliseOptions {
    /** Diagnostics channel for surfacing silent fallbacks. */
    diagnostics?: DiagnosticsOptions;
}

export function normaliseSchema(
    input: unknown,
    ref?: string,
    options?: NormaliseOptions
): NormalisedSchema {
    // Cache lookup for object identity (Zod schemas, JSON Schema objects)
    // Only cache when no ref is provided — refs produce different results
    if (ref === undefined && isObject(input)) {
        const cached = schemaCache.get(input);
        if (cached !== undefined) return cached;
    }

    const kind = detectSchemaKind(input);

    let result: NormalisedSchema;

    switch (kind) {
        case "zod4":
            result = normaliseZod4(input);
            break;
        case "zod3":
            result = normaliseZod3();
            break;
        case "openapi":
            if (!isObject(input)) throw new Error("Invalid OpenAPI document");
            result = normaliseOpenApi(input, ref, options);
            break;
        case "jsonSchema":
            if (!isObject(input)) throw new Error("Invalid JSON Schema");
            result = normaliseJsonSchema(input, options?.diagnostics);
            break;
    }

    // Cache for future calls (same object identity, no ref)
    if (ref === undefined && isObject(input)) {
        schemaCache.set(input, result);
    }

    return result;
}

function normaliseZod4(input: unknown): NormalisedSchema {
    // z.toJSONSchema() converts Zod → JSON Schema losslessly.
    // detectSchemaKind confirmed _zod is present.
    const zod = getProperty(input, "_zod");
    if (!isObject(zod)) {
        throw new Error("Invalid Zod 4 schema: missing _zod property");
    }
    if (!("def" in zod)) {
        throw new Error("Invalid Zod 4 schema: missing _zod.def");
    }

    // Call toJSONSchema with the validated schema.
    const jsonSchema: unknown = callToJsonSchema(input);
    if (!isObject(jsonSchema)) {
        throw new Error("z.toJSONSchema() did not produce an object");
    }

    return {
        jsonSchema,
        zodSchema: input,
        rootMeta: extractRootMetaFromJson(jsonSchema),
        rootDocument: jsonSchema,
    };
}

function normaliseJsonSchema(
    jsonSchema: JsonObject,
    diagnostics?: DiagnosticsOptions
): NormalisedSchema {
    let draft: JsonSchemaDraft;
    const $schema = jsonSchema.$schema;

    if (typeof $schema !== "string") {
        const inferred = inferJsonSchemaDraftWithReason(jsonSchema);
        draft = inferred.draft;
        emitDiagnostic(diagnostics, {
            code: "assumed-draft",
            message: `No $schema present; inferred ${inferred.draft} from keywords (${inferred.inferredFrom})`,
            pointer: "",
            detail: {
                inferredFrom: inferred.inferredFrom,
                draft: inferred.draft,
            },
        });
    } else {
        const matched = matchJsonSchemaDraftUri($schema);
        if (matched === undefined) {
            // `$schema` is present but unrecognised — fall back to the
            // 2020-12 normaliser (matching `detectJsonSchemaDraft`) and
            // surface the assumption so callers can act on it. Mirrors
            // the missing-$schema diagnostic path.
            draft = "draft-2020-12";
            emitDiagnostic(diagnostics, {
                code: "assumed-draft",
                message: `Unknown $schema URI "${$schema}"; assuming draft-2020-12`,
                pointer: "",
                detail: {
                    inferredFrom: "unknown-uri",
                    draft,
                    uri: $schema,
                },
            });
        } else {
            draft = matched;
        }
    }

    const normalised = normaliseForDraft(jsonSchema, draft);
    return {
        jsonSchema: normalised,
        rootMeta: extractRootMetaFromJson(normalised),
        rootDocument: normalised,
    };
}

function normaliseZod3(): never {
    throw new Error(
        "Zod 3 schemas are not supported. schema-components requires Zod 4. " +
            "Detected: Zod 3 (has _def without _zod). " +
            "See the Zod 4 migration guide at https://zod.dev/v4/migration or " +
            "run: pnpm add zod@^4"
    );
}

// ---------------------------------------------------------------------------
// Swagger 2.0 ref prefix rewrites (adapter layer)
// ---------------------------------------------------------------------------

/**
 * Mapping of Swagger 2.0 $ref prefixes to their OpenAPI 3.x equivalents.
 * Used by the adapter to rewrite user-provided ref strings so they
 * resolve correctly against the normalised document.
 */
const REF_REWRITES_ADAPTER: readonly [string, string][] = [
    ["#/definitions/", "#/components/schemas/"],
    ["#/parameters/", "#/components/parameters/"],
    ["#/responses/", "#/components/responses/"],
];

function normaliseOpenApi(
    doc: JsonObject,
    ref: string | undefined,
    options?: NormaliseOptions
): NormalisedSchema {
    const version = detectOpenApiVersion(doc);
    const normalisedDoc =
        version !== undefined
            ? normaliseOpenApiSchemas(doc, version, options?.diagnostics)
            : doc;

    // Rewrite Swagger 2.0 ref prefixes to match the normalised document
    // structure (definitions → components/schemas, etc.)
    let rewrittenRef = ref;
    if (
        rewrittenRef !== undefined &&
        version !== undefined &&
        isSwagger2(version)
    ) {
        for (const [from, to] of REF_REWRITES_ADAPTER) {
            if (rewrittenRef.startsWith(from)) {
                rewrittenRef = to + rewrittenRef.slice(from.length);
                break;
            }
        }
    }

    const resolved = resolveOpenApiRef(normalisedDoc, rewrittenRef);
    return {
        jsonSchema: resolved,
        rootMeta: extractRootMetaFromJson(resolved),
        rootDocument: normalisedDoc,
    };
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
        const multipart = getProperty(content, "multipart/form-data");
        const mediaType = isObject(json)
            ? json
            : isObject(multipart)
              ? multipart
              : undefined;
        if (mediaType === undefined) throw new Error(`No content for ${ref}`);
        const schema = getProperty(mediaType, "schema");
        if (!isObject(schema))
            throw new Error(`Could not resolve request body schema for ${ref}`);
        return schema;
    }

    // Fallback: try JSON Pointer dereference for any #/... ref
    if (ref.startsWith("#/")) {
        const resolved = dereference(ref, doc);
        if (resolved !== undefined) return resolved;
    }

    throw new Error(`Unsupported OpenAPI ref format: ${ref}`);
}

// ---------------------------------------------------------------------------
// Root meta extraction
// ---------------------------------------------------------------------------

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
