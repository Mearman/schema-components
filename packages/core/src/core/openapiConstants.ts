/**
 * Shared OpenAPI / Swagger constants and helpers.
 *
 * Single source of truth for HTTP method tuples, default content types, and
 * the Swagger 2.0 → OpenAPI 3.x reference-prefix rewriting table. Consumers
 * import the named exports rather than hand-maintaining sibling copies that
 * silently drift when methods or prefixes change.
 */

/**
 * Canonical OpenAPI 3.x HTTP method tuple in path-item iteration order.
 * Spec: https://spec.openapis.org/oas/v3.1.1#path-item-object
 */
export const HTTP_METHODS = [
    "get",
    "put",
    "post",
    "delete",
    "options",
    "head",
    "patch",
    "trace",
] as const;

/** Canonical OpenAPI 3.x HTTP method literal, derived from {@link HTTP_METHODS}. */
export type HttpMethod = (typeof HTTP_METHODS)[number];

/**
 * Swagger 2.0 omits `trace` — the keyword was introduced in OpenAPI 3.0.
 * Derived from `HTTP_METHODS` so adding a method to the canonical tuple
 * automatically propagates here (after which the filter may need updating).
 */
export const SWAGGER_2_METHODS: readonly Exclude<HttpMethod, "trace">[] =
    HTTP_METHODS.filter(
        (m): m is Exclude<HttpMethod, "trace"> => m !== "trace"
    );

/**
 * Default media type used when an OpenAPI document elides `consumes` /
 * `produces` or a Schema Object stands alone (no parent Media Type).
 */
export const DEFAULT_OPENAPI_CONTENT_TYPE = "application/json";

/**
 * Canonical `$ref` prefix table for the JSON Pointer locations used by
 * OpenAPI 3.x and Swagger 2.0 documents.
 */
export const REF_PREFIXES = {
    /** OpenAPI 3.x — most schemas live under `components.schemas`. */
    components: {
        schemas: "#/components/schemas/",
        parameters: "#/components/parameters/",
        responses: "#/components/responses/",
        requestBodies: "#/components/requestBodies/",
        headers: "#/components/headers/",
        examples: "#/components/examples/",
        links: "#/components/links/",
        callbacks: "#/components/callbacks/",
        securitySchemes: "#/components/securitySchemes/",
        pathItems: "#/components/pathItems/",
    },
    /** Swagger 2.0 legacy prefixes. */
    swagger2: {
        definitions: "#/definitions/",
        parameters: "#/parameters/",
        responses: "#/responses/",
    },
} as const;

/**
 * Swagger 2.0 → OpenAPI 3.x `$ref` prefix mapping. Applied during the
 * 2.0 → 3.x lift to rewrite legacy pointer prefixes onto their components
 * counterparts. Order matters: longer prefixes first prevents `#/parameters/`
 * from shadowing `#/components/parameters/` during a partial migration.
 */
export const REF_REWRITES: readonly {
    readonly from: string;
    readonly to: string;
}[] = [
    {
        from: REF_PREFIXES.swagger2.definitions,
        to: REF_PREFIXES.components.schemas,
    },
    {
        from: REF_PREFIXES.swagger2.parameters,
        to: REF_PREFIXES.components.parameters,
    },
    {
        from: REF_PREFIXES.swagger2.responses,
        to: REF_PREFIXES.components.responses,
    },
];

/**
 * Rewrite a Swagger 2.0 ref prefix onto the equivalent OpenAPI 3.x location.
 * Returns the ref unchanged when no prefix matches. Pure string operation —
 * does not validate that the target exists.
 */
export function rewriteSwaggerRefPrefix(ref: string): string {
    for (const { from, to } of REF_REWRITES) {
        if (ref.startsWith(from)) {
            return `${to}${ref.slice(from.length)}`;
        }
    }
    return ref;
}
