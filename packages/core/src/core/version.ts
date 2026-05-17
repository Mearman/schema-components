/**
 * JSON Schema draft and OpenAPI version detection.
 *
 * Detects the version from `$schema` URIs and OpenAPI `openapi`/`swagger`
 * fields. Used by the normaliser to apply version-specific transformations
 * before the walker processes the schema.
 */

// ---------------------------------------------------------------------------
// JSON Schema draft versions
// ---------------------------------------------------------------------------

export type JsonSchemaDraft =
    | "draft-04"
    | "draft-06"
    | "draft-07"
    | "draft-2019-09"
    | "draft-2020-12";

/**
 * $schema URI prefixes mapped to their draft version.
 * Draft 04–07 use `http://json-schema.org/draft-XX/schema#`.
 * Draft 2019-09 and 2020-12 use `https://json-schema.org/draft/YYYY-MM/schema`.
 */
const DRAFT_URIS: ReadonlyMap<string, JsonSchemaDraft> = new Map([
    // Draft 2020-12
    ["https://json-schema.org/draft/2020-12/schema", "draft-2020-12"],
    // Draft 2019-09
    ["https://json-schema.org/draft/2019-09/schema", "draft-2019-09"],
    // Draft 07
    ["http://json-schema.org/draft-07/schema#", "draft-07"],
    ["https://json-schema.org/draft-07/schema#", "draft-07"],
    // Draft 06
    ["http://json-schema.org/draft-06/schema#", "draft-06"],
    ["https://json-schema.org/draft-06/schema#", "draft-06"],
    // Draft 04
    ["http://json-schema.org/draft-04/schema#", "draft-04"],
    ["https://json-schema.org/draft-04/schema#", "draft-04"],
]);

/**
 * Match a `$schema` URI string to a known draft. Returns `undefined`
 * when the URI matches none of the documented Draft 04 – Draft 2020-12
 * schema URIs (including the known prefix patterns) — callers can use
 * this to distinguish an authoritative match from a silent fallback.
 */
export function matchJsonSchemaDraftUri(
    uri: string
): JsonSchemaDraft | undefined {
    // Exact match first
    const exact = DRAFT_URIS.get(uri);
    if (exact !== undefined) return exact;

    // Prefix match for variations (trailing #, with/without fragment)
    for (const [draftUri, draft] of DRAFT_URIS) {
        if (uri.startsWith(draftUri) || uri === draftUri) {
            return draft;
        }
    }

    // Known prefix patterns embedded in custom meta-schema URIs
    if (uri.includes("/draft/2020-12/")) return "draft-2020-12";
    if (uri.includes("/draft/2019-09/")) return "draft-2019-09";
    if (uri.includes("/draft-07")) return "draft-07";
    if (uri.includes("/draft-06")) return "draft-06";
    if (uri.includes("/draft-04")) return "draft-04";

    return undefined;
}

/**
 * Detect the JSON Schema draft version from a schema's `$schema` URI.
 * When `$schema` is absent, uses heuristic keyword detection via
 * `inferJsonSchemaDraft` to guess the draft version.
 * Returns `"draft-2020-12"` as the final fallback when no heuristic
 * matches either.
 */
export function detectJsonSchemaDraft(
    schema: Record<string, unknown>
): JsonSchemaDraft {
    const $schema = schema.$schema;
    if (typeof $schema === "string") {
        const matched = matchJsonSchemaDraftUri($schema);
        if (matched !== undefined) return matched;
        return "draft-2020-12";
    }

    // No $schema — use heuristic keyword detection
    return inferJsonSchemaDraft(schema);
}

// ---------------------------------------------------------------------------
// Heuristic draft inference (when $schema is absent)
// ---------------------------------------------------------------------------

/**
 * Inference result carrying the detected draft and the heuristic
 * that triggered it.
 */
export interface InferredDraft {
    draft: JsonSchemaDraft;
    inferredFrom: string;
}

/**
 * Infer the JSON Schema draft from keyword presence when `$schema`
 * is absent. Examined from highest-confidence to lowest.
 *
 * Heuristics:
 * 1. `$dynamicRef` / `$dynamicAnchor` / `prefixItems` → Draft 2020-12
 * 2. `$recursiveRef` / `$recursiveAnchor` / `unevaluatedProperties` /
 *    `dependentSchemas` → Draft 2019-09
 * 3. `if` / `then` / `else`, `contentEncoding` / `contentMediaType` → Draft 07
 * 4. `const`, `examples` (array), `propertyNames` → Draft 06
 * 5. Boolean `exclusiveMinimum`, `id` (no `$`), `definitions` only → Draft 04
 * 6. No signal → Draft 2020-12
 */
export function inferJsonSchemaDraft(
    schema: Record<string, unknown>
): JsonSchemaDraft {
    // Draft 2020-12 keywords
    if (
        "$dynamicRef" in schema ||
        "$dynamicAnchor" in schema ||
        "prefixItems" in schema
    ) {
        return "draft-2020-12";
    }

    // Draft 2019-09 keywords
    if (
        "$recursiveRef" in schema ||
        "$recursiveAnchor" in schema ||
        "unevaluatedProperties" in schema ||
        "unevaluatedItems" in schema
    ) {
        return "draft-2019-09";
    }

    // Draft 07 keywords (if/then/else, contentEncoding, contentMediaType)
    if ("if" in schema || "then" in schema || "else" in schema) {
        return "draft-07";
    }
    if ("contentEncoding" in schema || "contentMediaType" in schema) {
        return "draft-07";
    }

    // Draft 06 keywords (const, examples as array, propertyNames)
    if ("const" in schema || "propertyNames" in schema) {
        return "draft-06";
    }
    const examples = schema.examples;
    if (Array.isArray(examples)) {
        return "draft-06";
    }

    // Draft 04 signals: boolean exclusiveMinimum/Maximum, bare `id`,
    // `definitions` without `$defs`
    if (
        typeof schema.exclusiveMinimum === "boolean" ||
        typeof schema.exclusiveMaximum === "boolean"
    ) {
        return "draft-04";
    }
    if ("id" in schema && !("$id" in schema)) {
        return "draft-04";
    }

    // No signal — default to Draft 2020-12
    return "draft-2020-12";
}

/**
 * Like `inferJsonSchemaDraft` but also returns the heuristic that
 * triggered the inference, for diagnostic emission.
 */
export function inferJsonSchemaDraftWithReason(
    schema: Record<string, unknown>
): InferredDraft {
    // Draft 2020-12 keywords
    if (
        "$dynamicRef" in schema ||
        "$dynamicAnchor" in schema ||
        "prefixItems" in schema
    ) {
        return {
            draft: "draft-2020-12",
            inferredFrom: "dynamic-ref-or-anchor-or-prefixItems",
        };
    }

    // Draft 2019-09 keywords
    if (
        "$recursiveRef" in schema ||
        "$recursiveAnchor" in schema ||
        "unevaluatedProperties" in schema ||
        "unevaluatedItems" in schema
    ) {
        return {
            draft: "draft-2019-09",
            inferredFrom: "recursive-ref-or-anchor-or-unevaluated",
        };
    }

    // Draft 07 keywords
    if ("if" in schema || "then" in schema || "else" in schema) {
        return {
            draft: "draft-07",
            inferredFrom: "if-then-else",
        };
    }
    if ("contentEncoding" in schema || "contentMediaType" in schema) {
        return {
            draft: "draft-07",
            inferredFrom: "content-encoding-or-media-type",
        };
    }

    // Draft 06 keywords
    if ("const" in schema || "propertyNames" in schema) {
        return {
            draft: "draft-06",
            inferredFrom: "const-or-propertyNames",
        };
    }
    const examples = schema.examples;
    if (Array.isArray(examples)) {
        return { draft: "draft-06", inferredFrom: "examples" };
    }

    // Draft 04 signals
    if (
        typeof schema.exclusiveMinimum === "boolean" ||
        typeof schema.exclusiveMaximum === "boolean"
    ) {
        return { draft: "draft-04", inferredFrom: "boolean-exclusive-min-max" };
    }
    if ("id" in schema && !("$id" in schema)) {
        return { draft: "draft-04", inferredFrom: "id-without-dollar" };
    }

    return { draft: "draft-2020-12", inferredFrom: "no-signal" };
}

// ---------------------------------------------------------------------------
// OpenAPI versions
// ---------------------------------------------------------------------------

export interface OpenApiVersionInfo {
    major: number;
    minor: number;
    patch: number;
}

/**
 * Detect the OpenAPI/Swagger version from a document.
 * Returns `undefined` for documents that are not OpenAPI or Swagger.
 */
export function detectOpenApiVersion(
    doc: Record<string, unknown>
): OpenApiVersionInfo | undefined {
    // Swagger 2.0
    const swagger = doc.swagger;
    if (typeof swagger === "string") {
        const parts = swagger.split(".").map(Number);
        return {
            major: parts[0] ?? 2,
            minor: parts[1] ?? 0,
            patch: parts[2] ?? 0,
        };
    }

    // OpenAPI 3.x
    const openapi = doc.openapi;
    if (typeof openapi === "string") {
        const parts = openapi.split(".").map(Number);
        return {
            major: parts[0] ?? 3,
            minor: parts[1] ?? 0,
            patch: parts[2] ?? 0,
        };
    }

    return undefined;
}

/**
 * Check if an OpenAPI version is 3.0.x (uses modified Draft 04 schemas
 * with `nullable` instead of `anyOf [T, null]`).
 */
export function isOpenApi30(version: OpenApiVersionInfo): boolean {
    return version.major === 3 && version.minor === 0;
}

/**
 * Check if an OpenAPI version is 3.1.x (uses standard Draft 2020-12).
 */
export function isOpenApi31(version: OpenApiVersionInfo): boolean {
    return version.major === 3 && version.minor === 1;
}

/**
 * Check if a document is Swagger 2.0.
 */
export function isSwagger2(version: OpenApiVersionInfo): boolean {
    return version.major === 2;
}
