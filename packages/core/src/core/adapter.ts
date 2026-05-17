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
import { SchemaNormalisationError } from "./errors.ts";
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
 *
 * Any exception thrown by z.toJSONSchema is classified into a
 * SchemaNormalisationError so the caller does not have to re-parse error
 * message strings. The classification covers:
 *
 * - Nested Zod 3 schemas inside a Zod 4 tree (which surface as
 *   "Cannot read properties of undefined (reading 'def')") → zod3-unsupported
 * - Transforms ("Transforms cannot be represented") → zod-transform-unsupported
 * - Dynamic catch values whose handler throws ("Dynamic catch values are not
 *   supported") → zod-type-unrepresentable with zodType "dynamic-catch"
 * - Unrepresentable types — bigint, date, map, set, symbol, function, custom,
 *   undefined, void, NaN, and the literal-only forms `z.literal(undefined)`
 *   ("undefined-literal") and `z.literal(<bigint>)` ("bigint-literal") →
 *   zod-type-unrepresentable
 * - The catch-all "Non-representable type encountered: <type>" fallback Zod
 *   emits for any new schema kind without a registered processor →
 *   zod-type-unrepresentable with zodType set to the offending def.type
 * - Anything else → zod-conversion-failed
 *
 * The original error is preserved on each classified error via the `cause`
 * field so consumers can still inspect the Zod stack trace.
 */
function callToJsonSchema(schema: unknown): unknown {
    try {
        // @ts-expect-error — Library boundary: z.toJSONSchema requires $ZodType
        // but we have unknown validated by _zod guard. See function JSDoc.
        return z.toJSONSchema(schema);
    } catch (err) {
        throw classifyZodConversionError(err, schema);
    }
}

/**
 * Error messages emitted by Zod 4's z.toJSONSchema for unrepresentable types.
 * Mapping is exact-prefix on the message and the corresponding Zod type name
 * surfaced to the consumer via SchemaNormalisationError.zodType.
 *
 * Sources (verbatim message prefixes):
 * - zod/src/v4/core/json-schema-processors.ts L104 (bigint), L110 (symbol),
 *   L126 (undefined), L132 (void), L150 (date), L169 (literal-undefined),
 *   L175 (literal-bigint), L204 (NaN), L246 (custom), L252 (function),
 *   L264 (map), L270 (set), L521 (dynamic catch).
 * - zod/src/v4/core/to-json-schema.ts L182 (non-representable type fallback).
 *
 * The kept message prefix is the shortest substring that uniquely identifies
 * the source — the test in tests/zod-error-wording-contract.unit.test.ts
 * asserts each prefix is still present in the live Zod output so a Zod
 * patch upgrade that changes wording fails the build.
 *
 * Note: the more specific literal-* prefixes precede the generic "BigInt"
 * prefix so the literal classifications win. JavaScript object iteration
 * order preserves insertion order, and the loop short-circuits on first
 * match, so ordering here is load-bearing.
 */
const UNREPRESENTABLE_ZOD_TYPES: readonly (readonly [string, string])[] = [
    // Literal-only forms must precede the broader "BigInt" / "Undefined"
    // prefixes so `z.literal(undefined)` reports as "undefined-literal" rather
    // than "undefined".
    ["Literal `undefined` cannot be represented", "undefined-literal"],
    ["BigInt literals cannot be represented", "bigint-literal"],
    ["BigInt cannot be represented", "bigint"],
    ["Date cannot be represented", "date"],
    ["Map cannot be represented", "map"],
    ["Set cannot be represented", "set"],
    ["Symbols cannot be represented", "symbol"],
    ["Function types cannot be represented", "function"],
    ["Custom types cannot be represented", "custom"],
    ["Undefined cannot be represented", "undefined"],
    ["Void cannot be represented", "void"],
    ["NaN cannot be represented", "nan"],
];

/**
 * Marker for Zod's catch-all message when a brand-new schema type has no
 * registered processor (e.g. ahead of a Zod patch adding a new schema kind).
 *
 * Source: zod/src/v4/core/to-json-schema.ts L182
 *   `[toJSONSchema]: Non-representable type encountered: ${def.type}`
 */
const NON_REPRESENTABLE_TYPE_MARKER =
    "[toJSONSchema]: Non-representable type encountered:";

/**
 * Marker for dynamic catch failures — Zod throws when `def.catchValue(...)`
 * itself throws while building the JSON Schema default.
 *
 * Source: zod/src/v4/core/json-schema-processors.ts L521
 */
const DYNAMIC_CATCH_MARKER = "Dynamic catch values are not supported";

/**
 * The cryptic error produced when z.toJSONSchema encounters a nested Zod 3
 * schema (one without `_zod.def`). Reproduced verbatim from Node's TypeError
 * for property access on undefined.
 */
const NESTED_ZOD3_MARKER = "Cannot read properties of undefined";

function classifyZodConversionError(
    err: unknown,
    schema: unknown
): SchemaNormalisationError {
    const message = err instanceof Error ? err.message : String(err);

    // Nested Zod 3 schema inside a Zod 4 tree.
    if (message.includes(NESTED_ZOD3_MARKER)) {
        return new SchemaNormalisationError(
            "A nested Zod 3 schema was found inside a Zod 4 schema. " +
                "schema-components requires Zod 4 throughout the schema tree. " +
                "See the Zod 4 migration guide at https://zod.dev/v4/migration " +
                "or run: pnpm add zod@^4",
            schema,
            "zod3-unsupported",
            undefined,
            err
        );
    }

    // Transforms — emitted as "Transforms cannot be represented in JSON Schema".
    if (message.includes("Transforms cannot be represented")) {
        return new SchemaNormalisationError(
            "Zod transforms cannot be represented in JSON Schema. " +
                "Remove the .transform() call, or pre-transform the input before " +
                "passing it to the component.",
            schema,
            "zod-transform-unsupported",
            undefined,
            err
        );
    }

    // Dynamic catch — the catch value function itself threw.
    if (message.includes(DYNAMIC_CATCH_MARKER)) {
        return new SchemaNormalisationError(
            "Zod catch values that depend on runtime computation cannot be " +
                "represented in JSON Schema. Provide a static catch value or " +
                "remove the .catch() call.",
            schema,
            "zod-type-unrepresentable",
            "dynamic-catch",
            err
        );
    }

    // Unrepresentable Zod 4 types — bigint, date, map, set, symbol, function, etc.
    for (const [prefix, typeName] of UNREPRESENTABLE_ZOD_TYPES) {
        if (message.includes(prefix)) {
            return new SchemaNormalisationError(
                `Zod type ${typeName} cannot be represented in JSON Schema and is not supported by schema-components. ` +
                    `Original message: ${message}`,
                schema,
                "zod-type-unrepresentable",
                typeName,
                err
            );
        }
    }

    // Catch-all "Non-representable type encountered: <type>" — capture the
    // `def.type` value so consumers see which schema kind tripped the fallback.
    const nonReprIndex = message.indexOf(NON_REPRESENTABLE_TYPE_MARKER);
    if (nonReprIndex !== -1) {
        const trailing = message
            .slice(nonReprIndex + NON_REPRESENTABLE_TYPE_MARKER.length)
            .trim();
        // The message ends with the type name, but be defensive: only keep
        // the first whitespace-delimited token in case Zod ever appends
        // additional context.
        const typeName =
            trailing.length > 0 ? trailing.split(/\s+/)[0] : undefined;
        return new SchemaNormalisationError(
            `Zod encountered a schema kind${typeName !== undefined ? ` "${typeName}"` : ""} ` +
                `with no JSON Schema processor registered. ` +
                `This usually means Zod added a new schema type that schema-components ` +
                `does not yet support. Original message: ${message}`,
            schema,
            "zod-type-unrepresentable",
            typeName,
            err
        );
    }

    // Anything else — preserve the original message but classify it.
    return new SchemaNormalisationError(
        `z.toJSONSchema() failed: ${message}`,
        schema,
        "zod-conversion-failed",
        undefined,
        err
    );
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
            result = normaliseZod3(input);
            break;
        case "openapi":
            if (!isObject(input)) {
                throw new SchemaNormalisationError(
                    "Invalid OpenAPI document",
                    input,
                    "openapi-invalid"
                );
            }
            result = normaliseOpenApi(input, ref, options);
            break;
        case "jsonSchema":
            if (!isObject(input)) {
                throw new SchemaNormalisationError(
                    "Invalid JSON Schema",
                    input,
                    "invalid-json-schema"
                );
            }
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
        throw new SchemaNormalisationError(
            "Invalid Zod 4 schema: missing _zod property",
            input,
            "invalid-zod"
        );
    }
    if (!("def" in zod)) {
        throw new SchemaNormalisationError(
            "Invalid Zod 4 schema: missing _zod.def",
            input,
            "invalid-zod"
        );
    }

    // Call toJSONSchema with the validated schema.
    // callToJsonSchema classifies any thrown exception into a
    // SchemaNormalisationError before it leaves this function.
    const jsonSchema: unknown = callToJsonSchema(input);
    if (!isObject(jsonSchema)) {
        throw new SchemaNormalisationError(
            "z.toJSONSchema() did not produce an object",
            input,
            "invalid-zod"
        );
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

    const normalised = normaliseForDraft(jsonSchema, draft, diagnostics);
    return {
        jsonSchema: normalised,
        rootMeta: extractRootMetaFromJson(normalised),
        rootDocument: normalised,
    };
}

function normaliseZod3(input: unknown): never {
    throw new SchemaNormalisationError(
        "Zod 3 schemas are not supported. schema-components requires Zod 4. " +
            "Detected: Zod 3 (has _def without _zod). " +
            "See the Zod 4 migration guide at https://zod.dev/v4/migration or " +
            "run: pnpm add zod@^4",
        input,
        "zod3-unsupported"
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
