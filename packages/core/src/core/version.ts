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
 * Detect the JSON Schema draft version from a schema's `$schema` URI.
 * Returns `"draft-2020-12"` as the default when `$schema` is absent —
 * this is the most compatible assumption for modern schemas.
 */
export function detectJsonSchemaDraft(
    schema: Record<string, unknown>
): JsonSchemaDraft {
    const $schema = schema.$schema;
    if (typeof $schema !== "string") return "draft-2020-12";

    // Exact match first
    const exact = DRAFT_URIS.get($schema);
    if (exact !== undefined) return exact;

    // Prefix match for variations (trailing #, with/without fragment)
    for (const [uri, draft] of DRAFT_URIS) {
        if ($schema.startsWith(uri) || $schema === uri) {
            return draft;
        }
    }

    // Known prefix patterns
    if ($schema.includes("/draft/2020-12/")) return "draft-2020-12";
    if ($schema.includes("/draft/2019-09/")) return "draft-2019-09";
    if ($schema.includes("/draft-07")) return "draft-07";
    if ($schema.includes("/draft-06")) return "draft-06";
    if ($schema.includes("/draft-04")) return "draft-04";

    return "draft-2020-12";
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
