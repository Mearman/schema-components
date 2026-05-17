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
 * - Nested Zod 3 schemas inside a Zod 4 tree → zod3-unsupported.
 *   Detected structurally (presence of `_def.typeName` markers anywhere
 *   in the schema tree) so the check works across V8, JavaScriptCore,
 *   and SpiderMonkey, none of which agree on the wording of
 *   "Cannot read properties of undefined".
 * - Transforms → zod-transform-unsupported. This also catches `z.codec(…)`
 *   because Zod implements codecs as a pipe + transform internally, so
 *   they trip the same processor when round-tripping is forced. (Plain
 *   `z.toJSONSchema(codec)` itself does NOT throw because Zod picks one
 *   side of the codec; the static rejection in `typeInference.ts` is the
 *   compile-time guard.)
 * - Dynamic catch values whose handler throws → zod-type-unrepresentable
 *   with zodType "dynamic-catch".
 * - Unrepresentable types — bigint, date, map, set, symbol, function, custom,
 *   undefined, void, NaN, and the literal-only forms `z.literal(undefined)`
 *   ("undefined-literal") and `z.literal(<bigint>)` ("bigint-literal") →
 *   zod-type-unrepresentable.
 * - The catch-all "Non-representable type encountered: <type>" fallback Zod
 *   emits for any new schema kind without a registered processor →
 *   zod-type-unrepresentable with zodType set to the offending def.type.
 * - Cycle detected (`cycles: "throw"`) → zod-cycle-detected.
 * - Duplicate schema id → zod-duplicate-id.
 * - "Unprocessed schema. This is a bug in Zod." → zod-conversion-bug.
 * - "Error converting schema to JSON." → zod-conversion-failed (explicit
 *   classification rather than the generic fallback so the contract test
 *   protects the prefix from drift).
 * - Anything else → zod-conversion-failed.
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

// ---------------------------------------------------------------------------
// Classifier rules — anchored regex matching against the live Zod wording.
// ---------------------------------------------------------------------------

/**
 * A single classifier rule. `prefix` is the verbatim wording from Zod that
 * uniquely identifies a thrown error. The classifier matches against the
 * start of the message using an anchored regex so an accidental rewording
 * by Zod (e.g. adding a leading namespace tag) fails loudly rather than
 * matching a different rule by substring overlap.
 *
 * `build` produces the structured SchemaNormalisationError for the rule.
 * The Zod-extracted captures (e.g. cycle path, duplicate id, def.type) are
 * passed through `match` so each rule can shape its message richly.
 */
interface ClassifierRule {
    readonly prefix: string;
    readonly kind: SchemaNormalisationError["kind"];
    readonly zodType?: string;
    readonly build: (
        match: RegExpExecArray,
        cause: unknown,
        schema: unknown,
        fullMessage: string
    ) => SchemaNormalisationError;
}

/**
 * Escape a string for inclusion in a `RegExp`. Required because Zod
 * messages contain `[`, `]`, `.`, `(`, and `)` characters which have regex
 * meaning. The set covers every character with special meaning in a
 * JavaScript regular-expression source — RegExp.escape is not yet widely
 * available so we escape manually.
 */
function escapeRegExp(literal: string): string {
    return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Compile a prefix into an anchored regex that captures any trailing text
 * (used by rules that need to extract dynamic data such as the duplicate id
 * or the def.type that tripped the non-representable fallback).
 */
function anchored(prefix: string): RegExp {
    return new RegExp(`^${escapeRegExp(prefix)}(.*)$`, "s");
}

/**
 * Build the message body shared by every unrepresentable-type rule.
 */
function unrepresentableMessage(typeName: string, fullMessage: string): string {
    return (
        `Zod type ${typeName} cannot be represented in JSON Schema and is not supported by schema-components. ` +
        `Original message: ${fullMessage}`
    );
}

/**
 * Classifier rules ordered most-specific first. Order is load-bearing:
 * `Literal \`undefined\` cannot be represented` must precede the broader
 * `Undefined cannot be represented` so the literal classification wins
 * even when both share a leading word. A consistency check in the unit
 * test suite asserts no two `prefix` values are prefixes of each other —
 * any future rule that breaks the invariant fails the build.
 *
 * Verbatim sources (kept aligned with `tests/zod-error-wording-contract.unit.test.ts`):
 * - zod/src/v4/core/json-schema-processors.ts L104 (bigint), L110 (symbol),
 *   L126 (undefined), L132 (void), L150 (date), L169 (literal-undefined),
 *   L175 (literal-bigint), L204 (NaN), L246 (custom), L252 (function),
 *   L258 (transforms), L264 (map), L270 (set), L521 (dynamic catch).
 * - zod/src/v4/core/to-json-schema.ts L182 (non-representable type fallback),
 *   L225 + L364 (unprocessed schema), L235 (duplicate id), L307 (cycle),
 *   L522 (error converting).
 */
const CLASSIFIER_RULES: readonly ClassifierRule[] = [
    // Literal-only forms must precede their broader counterparts.
    {
        prefix: "Literal `undefined` cannot be represented",
        kind: "zod-type-unrepresentable",
        zodType: "undefined-literal",
        build: (_m, cause, schema, full) =>
            new SchemaNormalisationError(
                unrepresentableMessage("undefined-literal", full),
                schema,
                "zod-type-unrepresentable",
                "undefined-literal",
                cause
            ),
    },
    {
        prefix: "BigInt literals cannot be represented",
        kind: "zod-type-unrepresentable",
        zodType: "bigint-literal",
        build: (_m, cause, schema, full) =>
            new SchemaNormalisationError(
                unrepresentableMessage("bigint-literal", full),
                schema,
                "zod-type-unrepresentable",
                "bigint-literal",
                cause
            ),
    },
    {
        prefix: "BigInt cannot be represented",
        kind: "zod-type-unrepresentable",
        zodType: "bigint",
        build: (_m, cause, schema, full) =>
            new SchemaNormalisationError(
                unrepresentableMessage("bigint", full),
                schema,
                "zod-type-unrepresentable",
                "bigint",
                cause
            ),
    },
    {
        prefix: "Date cannot be represented",
        kind: "zod-type-unrepresentable",
        zodType: "date",
        build: (_m, cause, schema, full) =>
            new SchemaNormalisationError(
                unrepresentableMessage("date", full),
                schema,
                "zod-type-unrepresentable",
                "date",
                cause
            ),
    },
    {
        prefix: "Map cannot be represented",
        kind: "zod-type-unrepresentable",
        zodType: "map",
        build: (_m, cause, schema, full) =>
            new SchemaNormalisationError(
                unrepresentableMessage("map", full),
                schema,
                "zod-type-unrepresentable",
                "map",
                cause
            ),
    },
    {
        prefix: "Set cannot be represented",
        kind: "zod-type-unrepresentable",
        zodType: "set",
        build: (_m, cause, schema, full) =>
            new SchemaNormalisationError(
                unrepresentableMessage("set", full),
                schema,
                "zod-type-unrepresentable",
                "set",
                cause
            ),
    },
    {
        prefix: "Symbols cannot be represented",
        kind: "zod-type-unrepresentable",
        zodType: "symbol",
        build: (_m, cause, schema, full) =>
            new SchemaNormalisationError(
                unrepresentableMessage("symbol", full),
                schema,
                "zod-type-unrepresentable",
                "symbol",
                cause
            ),
    },
    {
        prefix: "Function types cannot be represented",
        kind: "zod-type-unrepresentable",
        zodType: "function",
        build: (_m, cause, schema, full) =>
            new SchemaNormalisationError(
                unrepresentableMessage("function", full),
                schema,
                "zod-type-unrepresentable",
                "function",
                cause
            ),
    },
    {
        prefix: "Custom types cannot be represented",
        kind: "zod-type-unrepresentable",
        zodType: "custom",
        build: (_m, cause, schema, full) =>
            new SchemaNormalisationError(
                unrepresentableMessage("custom", full),
                schema,
                "zod-type-unrepresentable",
                "custom",
                cause
            ),
    },
    {
        prefix: "Undefined cannot be represented",
        kind: "zod-type-unrepresentable",
        zodType: "undefined",
        build: (_m, cause, schema, full) =>
            new SchemaNormalisationError(
                unrepresentableMessage("undefined", full),
                schema,
                "zod-type-unrepresentable",
                "undefined",
                cause
            ),
    },
    {
        prefix: "Void cannot be represented",
        kind: "zod-type-unrepresentable",
        zodType: "void",
        build: (_m, cause, schema, full) =>
            new SchemaNormalisationError(
                unrepresentableMessage("void", full),
                schema,
                "zod-type-unrepresentable",
                "void",
                cause
            ),
    },
    {
        prefix: "NaN cannot be represented",
        kind: "zod-type-unrepresentable",
        zodType: "nan",
        build: (_m, cause, schema, full) =>
            new SchemaNormalisationError(
                unrepresentableMessage("nan", full),
                schema,
                "zod-type-unrepresentable",
                "nan",
                cause
            ),
    },
    {
        prefix: "Transforms cannot be represented",
        kind: "zod-transform-unsupported",
        build: (_m, cause, schema) =>
            new SchemaNormalisationError(
                "Zod transforms cannot be represented in JSON Schema. " +
                    "Remove the .transform() call, or pre-transform the input before " +
                    "passing it to the component. (Note: z.codec(...) is implemented " +
                    "as a transform internally — codecs that force round-tripping trip " +
                    "this same rule.)",
                schema,
                "zod-transform-unsupported",
                undefined,
                cause
            ),
    },
    {
        prefix: "Dynamic catch values are not supported",
        kind: "zod-type-unrepresentable",
        zodType: "dynamic-catch",
        build: (_m, cause, schema) =>
            new SchemaNormalisationError(
                "Zod catch values that depend on runtime computation cannot be " +
                    "represented in JSON Schema. Provide a static catch value or " +
                    "remove the .catch() call.",
                schema,
                "zod-type-unrepresentable",
                "dynamic-catch",
                cause
            ),
    },
    {
        // `[toJSONSchema]: Non-representable type encountered: ${def.type}`
        prefix: "[toJSONSchema]: Non-representable type encountered:",
        kind: "zod-type-unrepresentable",
        build: (match, cause, schema, full) => {
            // The captured group contains everything after the colon. Trim
            // and keep the first whitespace-delimited token so additional
            // context appended in future Zod versions does not bleed into
            // the zodType field.
            const trailing = match[1]?.trim() ?? "";
            const typeName =
                trailing.length > 0 ? trailing.split(/\s+/)[0] : undefined;
            return new SchemaNormalisationError(
                `Zod encountered a schema kind${typeName !== undefined ? ` "${typeName}"` : ""} ` +
                    `with no JSON Schema processor registered. ` +
                    `This usually means Zod added a new schema type that schema-components ` +
                    `does not yet support. Original message: ${full}`,
                schema,
                "zod-type-unrepresentable",
                typeName,
                cause
            );
        },
    },
    {
        // `Cycle detected: #/...\n\nSet the cycles parameter to "ref" ...`
        prefix: "Cycle detected: ",
        kind: "zod-cycle-detected",
        build: (match, cause, schema, full) => {
            const trailing = match[1] ?? "";
            // Path is the first whitespace-delimited token (the JSON Pointer
            // up to the trailing newline that Zod inserts before the advice).
            const path = trailing.split(/\s+/)[0] ?? "";
            return new SchemaNormalisationError(
                `Zod detected a cycle in the schema graph at ${path}. ` +
                    `Cycles can only be converted when z.toJSONSchema is called with ` +
                    `{ cycles: "ref" } — schema-components calls it without options ` +
                    `for cache safety, so the cycle surfaces as an error. ` +
                    `Restructure the schema to break the cycle, or use a $ref-based ` +
                    `definition. Original message: ${full}`,
                schema,
                "zod-cycle-detected",
                undefined,
                cause
            );
        },
    },
    {
        // `Duplicate schema id "${id}" detected during JSON Schema conversion. ...`
        prefix: 'Duplicate schema id "',
        kind: "zod-duplicate-id",
        build: (match, cause, schema, full) => {
            const trailing = match[1] ?? "";
            // The id is delimited by the closing double-quote that follows.
            const closing = trailing.indexOf('"');
            const id = closing === -1 ? trailing : trailing.slice(0, closing);
            return new SchemaNormalisationError(
                `Two different Zod schemas share the same id "${id}". ` +
                    `JSON Schema requires distinct ids when multiple schemas are ` +
                    `bundled together. Give each schema its own .meta({ id: ... }) ` +
                    `or remove the duplicate. Original message: ${full}`,
                schema,
                "zod-duplicate-id",
                undefined,
                cause
            );
        },
    },
    {
        // `Unprocessed schema. This is a bug in Zod.`
        prefix: "Unprocessed schema. This is a bug in Zod.",
        kind: "zod-conversion-bug",
        build: (_m, cause, schema, full) =>
            new SchemaNormalisationError(
                "Zod failed to process this schema during JSON Schema conversion " +
                    "and reports it as an internal bug. File an issue on the Zod " +
                    "tracker with a reproduction. " +
                    `Original message: ${full}`,
                schema,
                "zod-conversion-bug",
                undefined,
                cause
            ),
    },
    {
        // `Error converting schema to JSON.`
        prefix: "Error converting schema to JSON.",
        kind: "zod-conversion-failed",
        build: (_m, cause, schema, full) =>
            new SchemaNormalisationError(
                `z.toJSONSchema() failed to produce a Standard Schema payload. ` +
                    `Inspect the underlying cause for the original error. ` +
                    `Original message: ${full}`,
                schema,
                "zod-conversion-failed",
                undefined,
                cause
            ),
    },
];

/**
 * Compiled regex form of {@link CLASSIFIER_RULES} — built once at module
 * load. Avoids per-error compilation.
 */
const COMPILED_CLASSIFIER_RULES: readonly {
    readonly rule: ClassifierRule;
    readonly pattern: RegExp;
}[] = CLASSIFIER_RULES.map((rule) => ({
    rule,
    pattern: anchored(rule.prefix),
}));

/**
 * Walk an arbitrary value looking for Zod 3 markers (`_def.typeName`).
 * Zod 4 schemas always carry a `_zod.def`; Zod 3 schemas carry `_def`
 * with a `typeName` field. Presence of the latter anywhere in the tree
 * means a Zod 3 schema was nested inside a Zod 4 input, which is what
 * trips the V8 `"Cannot read properties of undefined"` failure.
 *
 * Engine-agnostic by construction — the detector inspects schema shape
 * instead of pattern-matching against the runtime's TypeError message,
 * so it works equivalently under V8, JavaScriptCore (Bun/Safari), and
 * SpiderMonkey (Firefox) — none of which agree on the wording.
 *
 * The walk is bounded by an explicit `visited` set so cyclical references
 * cannot cause stack overflow. The recursion follows both array elements
 * and own enumerable properties of every object encountered.
 */
function containsNestedZod3(value: unknown, visited: Set<object>): boolean {
    if (value === null || typeof value !== "object") return false;
    if (visited.has(value)) return false;
    visited.add(value);

    if (Array.isArray(value)) {
        for (const item of value) {
            if (containsNestedZod3(item, visited)) return true;
        }
        return false;
    }

    // After the array check, narrow to the indexable record form so we can
    // probe `_def` / `_zod` without cast. `isObject` rejects arrays and
    // `null` and produces `Record<string, unknown>`.
    if (!isObject(value)) return false;

    const def = value._def;
    const zod = value._zod;
    if (
        zod === undefined &&
        isObject(def) &&
        typeof def.typeName === "string"
    ) {
        return true;
    }

    for (const key of Object.keys(value)) {
        if (containsNestedZod3(value[key], visited)) return true;
    }
    return false;
}

function classifyZodConversionError(
    err: unknown,
    schema: unknown
): SchemaNormalisationError {
    const message = err instanceof Error ? err.message : String(err);

    // Nested Zod 3 — detected structurally on the input schema so the
    // detection works across JavaScript engines whose TypeError wording
    // differs (V8 says "Cannot read properties of undefined", Bun/JSC
    // says "undefined is not an object", SpiderMonkey says "undefined
    // has no properties"). Match on the input rather than the message
    // and the classification holds on every runtime.
    if (containsNestedZod3(schema, new Set())) {
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

    // Anchored regex match — the first rule whose prefix matches wins.
    // Because the rules are pre-sorted most-specific first AND the unit
    // test asserts no two prefixes are prefixes of each other, the match
    // is unambiguous.
    for (const { rule, pattern } of COMPILED_CLASSIFIER_RULES) {
        const match = pattern.exec(message);
        if (match !== null) {
            return rule.build(match, err, schema, message);
        }
    }

    // Anything else — preserve the original message but classify it as a
    // generic conversion failure.
    return new SchemaNormalisationError(
        `z.toJSONSchema() failed: ${message}`,
        schema,
        "zod-conversion-failed",
        undefined,
        err
    );
}

/**
 * Exposed for unit testing — lets the contract test enumerate every rule's
 * `prefix` value and assert mutual non-prefixing.
 */
export const __CLASSIFIER_RULES_FOR_TEST: readonly {
    readonly prefix: string;
}[] = CLASSIFIER_RULES;

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
    // Cache lookup for object identity (Zod schemas, JSON Schema objects).
    // Only cache when no ref is provided — refs produce different results.
    //
    // When a `diagnostics` sink is supplied we bypass the cache entirely
    // (mirroring `getParsed` in `openapi/resolve.ts`). The cached result
    // captured a previous normalisation that did not observe the new sink;
    // returning it would silently swallow every diagnostic the consumer
    // expects to see. Re-running normalisation is the only way to surface
    // diagnostics to a new sink.
    const usesDiagnostics = options?.diagnostics !== undefined;
    const cacheEligible =
        ref === undefined && isObject(input) && !usesDiagnostics;
    if (cacheEligible) {
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

    // Cache for future calls (same object identity, no ref, no sink).
    // Cache population deliberately mirrors the eligibility check above —
    // diagnostics-bearing parses are never cached for the same reason
    // they bypass the lookup.
    if (cacheEligible) {
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
    const pathMatch =
        /^\/(.+)\/(get|post|put|patch|delete|head|options|trace)$/.exec(ref);
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
