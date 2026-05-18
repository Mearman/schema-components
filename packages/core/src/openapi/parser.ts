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
import type { DiagnosticsOptions } from "../core/diagnostics.ts";
import { emitDiagnostic } from "../core/diagnostics.ts";
import { getProperty, isObject } from "../core/guards.ts";
import { MAX_PATH_ITEM_REF_HOPS } from "../core/limits.ts";
import { HTTP_METHODS } from "../core/openapiConstants.ts";
import { resolveRefChain } from "../core/refChain.ts";
import { isPrototypePollutingKey } from "../core/uri.ts";
import { detectOpenApiVersion } from "../core/version.ts";

// Type guards imported from core/guards.ts

function getString(value: unknown, key: string): string | undefined {
    const result = isObject(value) ? value[key] : undefined;
    return typeof result === "string" ? result : undefined;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Parsed OpenAPI document: the raw root JSON plus a cache of resolved
 * `#/components/schemas/*` (or Swagger 2.0 `#/definitions/*`) entries.
 * Produced by {@link parseOpenApiDocument} and consumed by every other
 * parser/resolver helper in this module.
 */
export interface OpenApiDocument {
    doc: JsonObject;
    schemas: Map<string, JsonObject>;
}

/**
 * Lightweight summary of an OpenAPI operation: its location, identity,
 * description fields, deprecation flag, and the underlying Operation
 * Object. Returned by {@link listOperations} / {@link listAllOperations}.
 */
export interface OperationInfo {
    path: string;
    method: string;
    operationId: string | undefined;
    summary: string | undefined;
    description: string | undefined;
    deprecated: boolean;
    operation: JsonObject;
}

/** Canonical four-value OpenAPI parameter `in` location. */
export type ParameterLocation = "query" | "path" | "header" | "cookie";

/**
 * Parsed view of an OpenAPI Parameter Object — name, location,
 * required flag, deprecation flag, description, and resolved schema.
 */
export interface ParameterInfo {
    name: string;
    location: ParameterLocation;
    required: boolean;
    deprecated: boolean;
    description: string | undefined;
    schema: JsonObject | undefined;
}

/**
 * Parsed view of an OpenAPI Response Object — status code, description,
 * declared content types, response schema, and resolved headers.
 */
export interface ResponseInfo {
    statusCode: string;
    description: string | undefined;
    contentTypes: string[];
    schema: JsonObject | undefined;
    headers: Map<string, HeaderInfo>;
}

/**
 * Parsed view of an OpenAPI Request Body Object — required flag,
 * description, declared content types, and the request body schema.
 */
export interface RequestBodyInfo {
    required: boolean;
    description: string | undefined;
    contentTypes: string[];
    schema: JsonObject | undefined;
}

/**
 * A single entry in an OpenAPI Security Requirement Object — the name
 * of a security scheme paired with its list of required scopes.
 */
export interface SecurityRequirement {
    name: string;
    scopes: string[];
}

/**
 * Parsed view of an OpenAPI Security Scheme Object covering every
 * field defined for `apiKey`, `http`, `oauth2`, `openIdConnect`, and
 * `mutualTLS` schemes.
 */
export interface SecurityScheme {
    type: string | undefined;
    description: string | undefined;
    name: string | undefined;
    location: string | undefined;
    scheme: string | undefined;
    bearerFormat: string | undefined;
    flows: JsonObject | undefined;
    openIdConnectUrl: string | undefined;
}

/**
 * Parsed view of an OpenAPI Header Object — name, description, required
 * and deprecated flags, and resolved schema.
 */
export interface HeaderInfo {
    name: string;
    description: string | undefined;
    required: boolean;
    deprecated: boolean;
    schema: JsonObject | undefined;
}

/**
 * Parsed view of a single OpenAPI 3.1 webhook entry: its name and the
 * operations declared on its Path Item Object.
 */
export interface WebhookInfo {
    name: string;
    operations: OperationInfo[];
}

/** Parsed view of an OpenAPI External Documentation Object. */
export interface ExternalDocs {
    url: string;
    description: string | undefined;
}

/**
 * Parsed view of an OpenAPI XML Object — controls how a schema field
 * is serialised in an XML payload.
 */
export interface XmlInfo {
    name: string | undefined;
    namespace: string | undefined;
    prefix: string | undefined;
    attribute: boolean;
    wrapped: boolean;
}

/**
 * Parsed view of a single OpenAPI Callback Object: its name and the
 * operations declared on every callback path.
 */
export interface CallbackInfo {
    name: string;
    operations: OperationInfo[];
}

/**
 * Parsed view of an OpenAPI Link Object — name, target operation
 * (`operationId` or `operationRef`), description, parameter mappings,
 * and the optional request body expression.
 */
export interface LinkInfo {
    name: string;
    operationId: string | undefined;
    operationRef: string | undefined;
    description: string | undefined;
    parameters: Map<string, string>;
    requestBody: string | undefined;
}

/**
 * Narrow an OpenAPI parameter `in` value to the canonical four-value
 * `ParameterLocation` union. Returns `undefined` for any other value
 * (including the Swagger 2.0 `body`/`formData` locations, which the
 * Swagger 2.0 → OpenAPI 3.x normaliser is expected to have already
 * lifted out of the parameter array). When `diagnostics` is supplied,
 * emits an `unknown-parameter-location` diagnostic so the caller can
 * audit silent drops; without a sink the function still returns
 * `undefined` rather than coercing the value, so the parameter is
 * excluded from the operation's parameter list either way.
 */
function toParameterLocation(
    value: unknown,
    parameterName: string | undefined,
    pointer: string,
    diagnostics: DiagnosticsOptions | undefined
): ParameterLocation | undefined {
    if (
        value === "query" ||
        value === "path" ||
        value === "header" ||
        value === "cookie"
    ) {
        return value;
    }
    emitDiagnostic(diagnostics, {
        code: "unknown-parameter-location",
        message:
            parameterName !== undefined
                ? `Parameter "${parameterName}" declares unknown \`in\` value ${JSON.stringify(value)}; expected one of query, path, header, cookie`
                : `Parameter declares unknown \`in\` value ${JSON.stringify(value)}; expected one of query, path, header, cookie`,
        pointer,
        detail: { name: parameterName, in: value },
    });
    return undefined;
}

// ---------------------------------------------------------------------------
// Document parsing
// ---------------------------------------------------------------------------

/**
 * Build an {@link OpenApiDocument} from a raw OpenAPI JSON object.
 *
 * Eagerly indexes the document's `#/components/schemas/*` entries and
 * lazily caches any other `$ref` lookup on first request. Used by
 * every other helper in this module as the single entry point for
 * structured access to an OpenAPI document.
 */
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

/**
 * Resolve a `$ref` string against a parsed OpenAPI document. Returns
 * the cached entry for `#/components/schemas/*` refs (or the lazily
 * resolved value for arbitrary fragment refs), or `undefined` when the
 * ref cannot be resolved.
 */
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

/**
 * Follow Path Item Object `$ref` chains (up to MAX_PATH_ITEM_REF_HOPS).
 * Returns the resolved Path Item, or `undefined` when the chain cycles,
 * exceeds the cap, or any intermediate ref fails to resolve.
 *
 * When `diagnostics` is supplied, cycle and depth-cap conditions emit
 * `cyclic-path-item-ref` and `path-item-ref-too-deep` respectively. When
 * `diagnostics` is omitted, the resolver still rejects cycles and
 * over-deep chains silently — callers that wire their own resolver
 * (notably `resolve.ts:resolvePathItemNode`) supply diagnostics to
 * mirror this behaviour with full pointer information.
 */
function resolvePathItem(
    parsed: OpenApiDocument,
    pathItem: unknown,
    diagnostics?: DiagnosticsOptions
): JsonObject | undefined {
    if (!isObject(pathItem)) return undefined;
    return resolveRefChain<JsonObject>(pathItem, {
        lookup: (ref) =>
            ref.startsWith("#/") ? resolveRefInDoc(parsed.doc, ref) : undefined,
        maxHops: MAX_PATH_ITEM_REF_HOPS,
        onCycle: (ref) => {
            emitDiagnostic(diagnostics, {
                code: "cyclic-path-item-ref",
                message: `Cyclic Path Item Object $ref "${ref}"`,
                pointer: ref,
                detail: { ref },
            });
            return undefined;
        },
        onDepthExceeded: (ref) => {
            emitDiagnostic(diagnostics, {
                code: "path-item-ref-too-deep",
                message: `Path Item Object $ref chain exceeded ${String(MAX_PATH_ITEM_REF_HOPS)} hops`,
                pointer: ref,
                detail: { maxHops: MAX_PATH_ITEM_REF_HOPS, ref },
            });
            return undefined;
        },
    });
}

function lookupPathItem(
    parsed: OpenApiDocument,
    path: string
): JsonObject | undefined {
    const paths = getProperty(parsed.doc, "paths");
    const resolved = resolvePathItem(parsed, getProperty(paths, path));
    if (resolved !== undefined) return resolved;
    // OpenAPI 3.1 webhook fallback: identifiers without a leading `/` can
    // address `webhooks/<name>` directly, allowing the same accessors
    // (getRequestBody, getResponses, etc.) to work for both paths and
    // webhooks.
    const webhooks = getProperty(parsed.doc, "webhooks");
    return resolvePathItem(parsed, getProperty(webhooks, path));
}

/**
 * Record an `operationId` against a shared `seenIds` map and emit a
 * `duplicate-operation-id` diagnostic when a subsequent location reuses
 * the same identifier. Returns the original `operationId` so the caller
 * can pass the value straight onto its `OperationInfo`.
 *
 * When the same map is threaded through `listOperations` and
 * `listWebhooks` (see `listAllOperations`), cross-list collisions
 * between a path operation and a webhook operation surface as the same
 * diagnostic class as same-list collisions.
 */
function recordOperationId(
    operationId: string | undefined,
    location: string,
    pointer: string,
    seenIds: Map<string, string>,
    diagnostics: DiagnosticsOptions | undefined
): void {
    if (operationId === undefined) return;
    const firstSeenAt = seenIds.get(operationId);
    if (firstSeenAt !== undefined) {
        emitDiagnostic(diagnostics, {
            code: "duplicate-operation-id",
            message: `operationId "${operationId}" is declared more than once (first at ${firstSeenAt}, again at ${location})`,
            pointer,
            detail: {
                operationId,
                firstSeenAt,
                duplicateAt: location,
            },
        });
        return;
    }
    seenIds.set(operationId, location);
}

/**
 * List every operation declared under the document's `paths` map.
 * Follows Path Item `$ref` chains internally; cycles and over-deep
 * chains surface as diagnostics when a sink is supplied.
 */
export function listOperations(
    parsed: OpenApiDocument,
    diagnostics?: DiagnosticsOptions,
    seenIds = new Map<string, string>()
): OperationInfo[] {
    const operations: OperationInfo[] = [];
    const paths = getProperty(parsed.doc, "paths");

    if (!isObject(paths)) return operations;

    for (const [path, rawPathItem] of Object.entries(paths)) {
        const pathItem = resolvePathItem(parsed, rawPathItem, diagnostics);
        if (pathItem === undefined) continue;

        for (const method of HTTP_METHODS) {
            const operation = getProperty(pathItem, method);
            if (!isObject(operation)) continue;

            const operationId = getString(operation, "operationId");
            recordOperationId(
                operationId,
                `${method.toUpperCase()} ${path}`,
                `/paths/${jsonPointerEscape(path)}/${method}/operationId`,
                seenIds,
                diagnostics
            );

            operations.push({
                path,
                method,
                operationId,
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

/**
 * Resolve the parameters of a single operation, merging path-level
 * parameters with operation-level overrides and following any
 * Parameter Object `$ref` chains.
 */
export function getParameters(
    parsed: OpenApiDocument,
    path: string,
    method: string,
    diagnostics?: DiagnosticsOptions
): ParameterInfo[] {
    const pathItem = lookupPathItem(parsed, path);
    if (pathItem === undefined) return [];

    const operation = getProperty(pathItem, method);
    if (!isObject(operation)) return [];

    // Merge path-level and operation-level parameters
    // Operation-level overrides path-level for same name+in
    const pathParams = extractParameterList(
        parsed.doc,
        getProperty(pathItem, "parameters"),
        `/paths/${jsonPointerEscape(path)}/parameters`,
        diagnostics
    );
    const opParams = extractParameterList(
        parsed.doc,
        getProperty(operation, "parameters"),
        `/paths/${jsonPointerEscape(path)}/${method}/parameters`,
        diagnostics
    );

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

function extractParameterList(
    doc: JsonObject,
    parameters: unknown,
    pointerBase: string,
    diagnostics: DiagnosticsOptions | undefined
): ParameterInfo[] {
    if (!Array.isArray(parameters)) return [];

    const result: ParameterInfo[] = [];
    for (const [index, param] of parameters.entries()) {
        if (!isObject(param)) continue;

        const entryPointer = `${pointerBase}/${String(index)}`;

        // Resolve $ref on the parameter first — a $ref'd entry has no
        // `name`/`in` of its own; those live on the referenced component.
        const resolved = resolveParam(doc, param, diagnostics);
        if (resolved === undefined) continue;

        const name = getProperty(resolved, "name");
        const rawLocation = getProperty(resolved, "in");
        if (typeof name !== "string" || typeof rawLocation !== "string") {
            continue;
        }

        const location = toParameterLocation(
            rawLocation,
            name,
            `${entryPointer}/in`,
            diagnostics
        );
        if (location === undefined) continue;

        // The schema might be a $ref too — leave it for the walker
        const schema = getProperty(resolved, "schema");

        result.push({
            name,
            location,
            required: getProperty(resolved, "required") === true,
            deprecated: getProperty(resolved, "deprecated") === true,
            description: getString(resolved, "description"),
            schema: isObject(schema) ? schema : undefined,
        });
    }
    return result;
}

/**
 * Resolve a Reference Object chain on a non-Path-Item OpenAPI node
 * (Parameter, Header, Link, etc.). Single-hop resolution is insufficient
 * because OAS 3.x permits chains of Reference Objects of arbitrary
 * length — a Reference Object whose target is itself a Reference Object
 * is legal. `resolveRefChain` centralises cycle and depth-cap protection.
 *
 * Cycles and over-deep chains emit a dedicated diagnostic code per node
 * kind (`cyclic-parameter-ref`, `parameter-ref-too-deep`, and the
 * `header` / `link` equivalents), mirroring the existing
 * `swagger-cyclic-parameter-ref` precedent so consumers can pattern-match
 * directly on the code instead of filtering by `detail.kind`.
 */
function resolveReferenceObjectChain(
    doc: JsonObject,
    node: JsonObject,
    kind: "parameter" | "header" | "link",
    diagnostics: DiagnosticsOptions | undefined
): JsonObject | undefined {
    const kindLabel =
        kind === "parameter"
            ? "Parameter Object"
            : kind === "header"
              ? "Header Object"
              : "Link Object";
    const cyclicCode =
        kind === "parameter"
            ? "cyclic-parameter-ref"
            : kind === "header"
              ? "cyclic-header-ref"
              : "cyclic-link-ref";
    const tooDeepCode =
        kind === "parameter"
            ? "parameter-ref-too-deep"
            : kind === "header"
              ? "header-ref-too-deep"
              : "link-ref-too-deep";
    return resolveRefChain<JsonObject>(node, {
        lookup: (ref) =>
            ref.startsWith("#/") ? resolveRefInDoc(doc, ref) : undefined,
        onCycle: (ref) => {
            emitDiagnostic(diagnostics, {
                code: cyclicCode,
                message: `Cyclic ${kindLabel} $ref "${ref}"`,
                pointer: ref,
                detail: { ref, kind },
            });
            return undefined;
        },
        onDepthExceeded: (ref) => {
            emitDiagnostic(diagnostics, {
                code: tooDeepCode,
                message: `${kindLabel} $ref chain exceeded the hop cap starting from "${ref}"`,
                pointer: ref,
                detail: { ref, kind },
            });
            return undefined;
        },
    });
}

/**
 * Resolve a Parameter Object `$ref` chain. See
 * `resolveReferenceObjectChain` for the resolution contract.
 */
function resolveParam(
    doc: JsonObject,
    param: JsonObject,
    diagnostics: DiagnosticsOptions | undefined
): JsonObject | undefined {
    return resolveReferenceObjectChain(doc, param, "parameter", diagnostics);
}

/**
 * Encode a path segment for embedding in a JSON Pointer (RFC 6901).
 * `~` → `~0`, `/` → `~1`. Used to build pointer fragments for diagnostics
 * — the diagnostics layer does not currently re-encode segments inserted
 * via template strings.
 */
function jsonPointerEscape(segment: string): string {
    return segment.replace(/~/g, "~0").replace(/\//g, "~1");
}

// ---------------------------------------------------------------------------
// Request body
// ---------------------------------------------------------------------------

/**
 * Resolve the request body of a single operation, including its
 * declared content types and schema. Returns `undefined` when the
 * operation declares no request body.
 */
export function getRequestBody(
    parsed: OpenApiDocument,
    path: string,
    method: string
): RequestBodyInfo | undefined {
    const pathItem = lookupPathItem(parsed, path);
    const operation = getProperty(pathItem, method);
    const requestBodyRaw = getProperty(operation, "requestBody");
    if (!isObject(requestBodyRaw)) return undefined;

    // OAS 3.0/3.1 allow `requestBody: { $ref: "#/components/requestBodies/X" }`.
    // Resolve a single hop against the document root before reading
    // `content`/`required`/`description`, otherwise the referenced
    // request body's fields would be silently ignored.
    const requestBody = resolveWrapperRef(parsed.doc, requestBodyRaw);
    if (requestBody === undefined) return undefined;

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

/**
 * Resolve the responses of a single operation, returning one
 * {@link ResponseInfo} per declared status code (including class
 * wildcards and `default`).
 */
export function getResponses(
    parsed: OpenApiDocument,
    path: string,
    method: string,
    diagnostics?: DiagnosticsOptions
): ResponseInfo[] {
    const pathItem = lookupPathItem(parsed, path);
    const operation = getProperty(pathItem, method);
    const responses = getProperty(operation, "responses");
    if (!isObject(responses)) return [];

    const result: ResponseInfo[] = [];
    for (const [statusCode, responseRaw] of Object.entries(responses)) {
        if (!isObject(responseRaw)) continue;

        // OAS 3.0/3.1 allow `responses["200"]: { $ref: "#/components/responses/X" }`.
        // Resolve a single hop against the document root before reading
        // `content`/`description`/`headers`, otherwise the referenced
        // response's fields would be silently ignored. On OAS 3.1,
        // `resolveWrapperRef` also merges Reference Object
        // `summary`/`description` siblings on top of the target.
        const response = resolveWrapperRef(parsed.doc, responseRaw);
        if (response === undefined) continue;

        const content = getProperty(response, "content");
        const contentTypes = isObject(content) ? Object.keys(content) : [];
        const schema = isObject(content)
            ? extractSchemaFromContent(content)
            : undefined;
        const headers = getResponseHeaders(response, parsed.doc, diagnostics);

        result.push({
            statusCode,
            description: getString(response, "description"),
            contentTypes,
            schema,
            headers,
        });
    }
    return result;
}

/**
 * Resolve a single-hop `$ref` on a wrapper object — Response Object,
 * Request Body Object, etc. — against the document root. Returns the
 * referenced node when the wrapper is a `$ref`, the wrapper itself when
 * it has no `$ref`, or `undefined` when the `$ref` is malformed or
 * cannot be resolved (so the caller skips the entry rather than reading
 * stale fields from the bare `{ $ref }` envelope).
 *
 * OpenAPI 3.1 Reference Object — sibling merge. OAS 3.1 explicitly
 * permits `summary` and `description` siblings of `$ref`; the wrapper's
 * siblings override the corresponding fields on the referenced node
 * (spec: "If the property is present on both the Reference Object and
 * the referenced node, the value on the Reference Object overrides the
 * value of the referenced node"). OAS 3.0 forbids siblings, so the merge
 * is gated on the document version. The gating is best-effort — if no
 * recognisable `openapi`/`swagger` field is present we err on the side
 * of NOT merging siblings to avoid changing behaviour for ambiguous or
 * partially-built documents.
 */
function resolveWrapperRef(
    doc: JsonObject,
    wrapper: JsonObject
): JsonObject | undefined {
    const ref = getString(wrapper, "$ref");
    if (ref === undefined) return wrapper;
    const target = resolveRefInDoc(doc, ref);
    if (target === undefined) return undefined;
    if (!documentAllowsReferenceSiblings(doc)) return target;
    return mergeReferenceSiblings(wrapper, target);
}

/**
 * OAS 3.1 admits `summary` and `description` siblings on a Reference
 * Object; OAS 3.0 does not. Detect the document version once per call
 * — `detectOpenApiVersion` reads the top-level `openapi`/`swagger` field
 * and is cheap enough to call on every resolution without caching.
 */
function documentAllowsReferenceSiblings(doc: JsonObject): boolean {
    const version = detectOpenApiVersion(doc);
    if (version === undefined) return false;
    return version.major === 3 && version.minor >= 1;
}

/**
 * Per OAS 3.1, only `summary` and `description` siblings on a Reference
 * Object are permitted and they override the referenced node. Any other
 * sibling is ignored (spec: "Any properties of a Reference Object other
 * than those described above SHALL be ignored"). The returned object is
 * a fresh shallow merge — the input wrapper and target are not mutated.
 */
const REFERENCE_OBJECT_SIBLING_KEYS = ["summary", "description"] as const;

function mergeReferenceSiblings(
    wrapper: JsonObject,
    target: JsonObject
): JsonObject {
    const merged: JsonObject = { ...target };
    for (const key of REFERENCE_OBJECT_SIBLING_KEYS) {
        const siblingValue = wrapper[key];
        if (typeof siblingValue === "string") {
            merged[key] = siblingValue;
        }
    }
    return merged;
}

// ---------------------------------------------------------------------------
// Content type → schema extraction
// ---------------------------------------------------------------------------

function extractSchemaFromContent(content: JsonObject): JsonObject | undefined {
    // Prefer the literal `application/json` content type — the most common
    // JSON representation in OAS documents. Iterate keys so a registered
    // media-type carrying RFC 7231 parameters (`application/json;
    // charset=utf-8`, `application/json; profile=...`) matches the same
    // base type — `getProperty` would otherwise miss it entirely and fall
    // through to a non-JSON entry.
    for (const [mediaType, mediaObj] of Object.entries(content)) {
        if (mediaTypeBase(mediaType) !== "application/json") continue;
        if (!isObject(mediaObj)) continue;
        const schema = getProperty(mediaObj, "schema");
        if (isObject(schema)) return schema;
    }

    // Fall back to any `application/*+json` structured-syntax-suffix
    // variant (RFC 6839): `application/vnd.api+json`,
    // `application/problem+json`, `application/hal+json`, etc. These are
    // all JSON-encoded payloads and the walker treats them identically
    // to `application/json`. Iterating in declaration order keeps the
    // choice stable for callers who declare a single `+json` content
    // type alongside non-JSON alternatives.
    for (const [mediaType, mediaObj] of Object.entries(content)) {
        if (!isJsonSuffixMediaType(mediaType)) continue;
        if (!isObject(mediaObj)) continue;
        const schema = getProperty(mediaObj, "schema");
        if (isObject(schema)) return schema;
    }

    // Last resort: the first content entry that carries a schema. This
    // preserves the historical behaviour for `multipart/form-data`,
    // `application/xml`, and other non-JSON content types — the walker
    // renders the schema regardless of media type.
    for (const mediaType of Object.values(content)) {
        if (!isObject(mediaType)) continue;
        const schema = getProperty(mediaType, "schema");
        if (isObject(schema)) return schema;
    }

    return undefined;
}

/**
 * Return the lowercased media-type base — the type/subtype with any
 * RFC 7231 parameters (`; charset=...`, `; profile=...`, etc.) stripped
 * and surrounding whitespace trimmed. Returns the empty string when the
 * input has no recognisable base (defensive against malformed entries).
 */
function mediaTypeBase(mediaType: string): string {
    const lower = mediaType.toLowerCase();
    return lower.split(";", 1)[0]?.trim() ?? "";
}

/**
 * Detect RFC 6839 structured-syntax-suffix media types that encode JSON.
 * Matches `application/<anything>+json`, optionally with parameters
 * (`; charset=utf-8`). Excludes the literal `application/json`, which
 * the caller checks separately to preserve preference order.
 */
function isJsonSuffixMediaType(mediaType: string): boolean {
    const base = mediaTypeBase(mediaType);
    if (base === "application/json") return false;
    return base.startsWith("application/") && base.endsWith("+json");
}

// ---------------------------------------------------------------------------
// $ref resolution
// ---------------------------------------------------------------------------

/**
 * Resolve an in-document `$ref` against the supplied doc root.
 *
 * Limitation — cross-Schema-Object relative refs: refs that do NOT
 * start with `#/` are not resolved here. The `normaliseOpenApiSchemas`
 * pipeline (see `resolveRelativeRefs` in `core/normalise.ts`) rewrites
 * relative refs WITHIN a Schema Object using that schema's `$id` base
 * URI, but it does not currently model `$id` scopes that span Schema
 * Object boundaries (e.g. a sibling component schema with its own
 * `$id` that another schema's relative ref targets). Such refs survive
 * normalisation unchanged and fall through this function returning
 * `undefined`. `resolve.ts:detectUnsupportedCrossSchemaRefs` walks the
 * normalised doc and emits `cross-schema-relative-ref-unsupported` per
 * offending ref so consumers notice the silent failure.
 */
function resolveRefInDoc(doc: JsonObject, ref: string): JsonObject | undefined {
    if (!ref.startsWith("#/")) return undefined;

    const parts = ref.slice(2).split("/");
    let current: unknown = doc;

    for (const part of parts) {
        if (!isObject(current)) return undefined;
        // JSON Pointer: ~1 → /, ~0 → ~
        const decoded = part.replace(/~1/g, "/").replace(/~0/g, "~");
        // Reject prototype-polluting segments (`__proto__`, `constructor`,
        // `prototype`). Walking into any of these reads `Object.prototype`
        // and lets a crafted `$ref` smuggle properties from the runtime
        // prototype chain into the resolved schema.
        if (isPrototypePollutingKey(decoded)) return undefined;
        current = current[decoded];
    }

    return isObject(current) ? current : undefined;
}

// ---------------------------------------------------------------------------
// Security requirements and schemes
// ---------------------------------------------------------------------------

/**
 * Resolve the effective security requirements for a single operation.
 * Operation-level requirements override the document-level defaults
 * when present.
 */
export function getSecurityRequirements(
    parsed: OpenApiDocument,
    path: string,
    method: string
): SecurityRequirement[] {
    const pathItem = lookupPathItem(parsed, path);
    const operation = getProperty(pathItem, method);

    // Operation-level security overrides global
    const opSecurity = getProperty(operation, "security");
    const globalSecurity = getProperty(parsed.doc, "security");
    const securityArray: unknown[] = Array.isArray(opSecurity)
        ? opSecurity
        : Array.isArray(globalSecurity)
          ? globalSecurity
          : [];

    const result: SecurityRequirement[] = [];
    for (const entry of securityArray) {
        if (!isObject(entry)) continue;
        for (const [name, scopes] of Object.entries(entry)) {
            result.push({
                name,
                scopes: Array.isArray(scopes)
                    ? scopes.filter((s): s is string => typeof s === "string")
                    : [],
            });
        }
    }
    return result;
}

/**
 * Read the document's `components.securitySchemes` map as a map of
 * scheme names to {@link SecurityScheme} entries.
 */
export function getSecuritySchemes(
    parsed: OpenApiDocument
): Map<string, SecurityScheme> {
    const result = new Map<string, SecurityScheme>();
    const components = getProperty(parsed.doc, "components");
    const securitySchemes = getProperty(components, "securitySchemes");

    if (!isObject(securitySchemes)) return result;

    for (const [name, scheme] of Object.entries(securitySchemes)) {
        if (!isObject(scheme)) continue;
        const flowsProp = getProperty(scheme, "flows");
        result.set(name, {
            type: getString(scheme, "type"),
            description: getString(scheme, "description"),
            name: getString(scheme, "name"),
            location: getString(scheme, "in"),
            scheme: getString(scheme, "scheme"),
            bearerFormat: getString(scheme, "bearerFormat"),
            flows: isObject(flowsProp) ? flowsProp : undefined,
            openIdConnectUrl: getString(scheme, "openIdConnectUrl"),
        });
    }
    return result;
}

// ---------------------------------------------------------------------------
// Response headers
// ---------------------------------------------------------------------------

/**
 * Resolve the headers of a single OpenAPI Response Object as a map of
 * header name to {@link HeaderInfo}. Follows Header Object `$ref`
 * chains via the optional document root.
 */
export function getResponseHeaders(
    response: JsonObject,
    doc?: JsonObject,
    diagnostics?: DiagnosticsOptions
): Map<string, HeaderInfo> {
    const result = new Map<string, HeaderInfo>();
    const headers = getProperty(response, "headers");

    if (!isObject(headers)) return result;

    for (const [name, headerObj] of Object.entries(headers)) {
        if (!isObject(headerObj)) continue;

        // Resolve $ref on the header against the document root —
        // e.g. `#/components/headers/MyHeader`. Reference Objects may
        // chain through other Reference Objects; use the multi-hop
        // resolver. Without the document we cannot resolve the pointer,
        // so fall back to the inline shape.
        const header =
            doc !== undefined
                ? (resolveReferenceObjectChain(
                      doc,
                      headerObj,
                      "header",
                      diagnostics
                  ) ?? headerObj)
                : headerObj;
        const schemaProp = getProperty(header, "schema");

        result.set(name, {
            name,
            description: getString(header, "description"),
            required: getProperty(header, "required") === true,
            deprecated: getProperty(header, "deprecated") === true,
            schema: isObject(schemaProp) ? schemaProp : undefined,
        });
    }
    return result;
}

// ---------------------------------------------------------------------------
// Webhooks (OpenAPI 3.1)
// ---------------------------------------------------------------------------

/**
 * List every OpenAPI 3.1 webhook declared under the document's
 * `webhooks` map, each with its name and resolved operations.
 */
export function listWebhooks(
    parsed: OpenApiDocument,
    diagnostics?: DiagnosticsOptions,
    seenIds = new Map<string, string>()
): WebhookInfo[] {
    const result: WebhookInfo[] = [];
    const webhooks = getProperty(parsed.doc, "webhooks");

    if (!isObject(webhooks)) return result;

    for (const [name, rawHookItem] of Object.entries(webhooks)) {
        // Resolve `$ref`-based Path Item entries — OAS 3.1 webhooks may
        // reference `#/components/pathItems/<Name>`. The previous
        // implementation iterated the raw entry and read HTTP methods
        // directly, so a webhook declared as `{ $ref: ... }` exposed no
        // operations at all. Mirrors `listOperations` which already
        // resolves via `resolvePathItem`.
        const hookItem = resolvePathItem(parsed, rawHookItem, diagnostics);
        if (hookItem === undefined) continue;

        const operations: OperationInfo[] = [];
        for (const method of HTTP_METHODS) {
            const operation = getProperty(hookItem, method);
            if (!isObject(operation)) continue;

            const operationId = getString(operation, "operationId");
            recordOperationId(
                operationId,
                `${method.toUpperCase()} webhook:${name}`,
                `/webhooks/${jsonPointerEscape(name)}/${method}/operationId`,
                seenIds,
                diagnostics
            );

            operations.push({
                path: name,
                method,
                operationId,
                summary: getString(operation, "summary"),
                description: getString(operation, "description"),
                deprecated: getProperty(operation, "deprecated") === true,
                operation,
            });
        }

        result.push({ name, operations });
    }
    return result;
}

/**
 * Enumerate every operation in the document — both the `paths` map and
 * the OpenAPI 3.1 `webhooks` map — sharing a single `seenIds` cache so
 * cross-list `operationId` collisions surface the same way as same-list
 * collisions. Returns the path-operation list followed by webhook
 * operations (flattened); callers that need the structured webhook
 * grouping should call `listWebhooks` directly.
 */
export function listAllOperations(
    parsed: OpenApiDocument,
    diagnostics?: DiagnosticsOptions
): OperationInfo[] {
    const seenIds = new Map<string, string>();
    const pathOps = listOperations(parsed, diagnostics, seenIds);
    const webhookOps = listWebhooks(parsed, diagnostics, seenIds).flatMap(
        (w) => w.operations
    );
    return [...pathOps, ...webhookOps];
}

// ---------------------------------------------------------------------------
// External documentation
// ---------------------------------------------------------------------------

/**
 * Read the optional `externalDocs` field on an OpenAPI object
 * (document, operation, tag, schema, ...) into an {@link ExternalDocs}
 * record. Returns `undefined` when absent or malformed.
 */
export function getExternalDocs(obj: JsonObject): ExternalDocs | undefined {
    const docs = getProperty(obj, "externalDocs");
    if (!isObject(docs)) return undefined;
    const url = getString(docs, "url");
    if (typeof url !== "string") return undefined;
    return {
        url,
        description: getString(docs, "description"),
    };
}

// ---------------------------------------------------------------------------
// XML representation
// ---------------------------------------------------------------------------

/**
 * Read the optional `xml` keyword on a JSON Schema object into an
 * {@link XmlInfo} record describing how the field is serialised in an
 * XML payload. Returns `undefined` when absent or malformed.
 */
export function getXmlInfo(schema: JsonObject): XmlInfo | undefined {
    const xml = getProperty(schema, "xml");
    if (!isObject(xml)) return undefined;
    return {
        name: getString(xml, "name"),
        namespace: getString(xml, "namespace"),
        prefix: getString(xml, "prefix"),
        attribute: getProperty(xml, "attribute") === true,
        wrapped: getProperty(xml, "wrapped") === true,
    };
}

// ---------------------------------------------------------------------------
// Callbacks (OpenAPI 3.0)
// ---------------------------------------------------------------------------

/**
 * List the OpenAPI callback definitions declared on a single
 * operation. Each entry carries the callback name and the operations
 * declared on its Path Item Object.
 */
export function listCallbacks(
    parsed: OpenApiDocument,
    path: string,
    method: string,
    diagnostics?: DiagnosticsOptions
): CallbackInfo[] {
    const pathItem = lookupPathItem(parsed, path);
    const operation = getProperty(pathItem, method);
    if (!isObject(operation)) return [];

    const callbacks = getProperty(operation, "callbacks");
    if (!isObject(callbacks)) return [];

    const result: CallbackInfo[] = [];
    for (const [name, callbackItem] of Object.entries(callbacks)) {
        if (!isObject(callbackItem)) continue;

        const operations: OperationInfo[] = [];
        for (const [cbPath, rawCbPathItem] of Object.entries(callbackItem)) {
            // Each callback expression maps to a Path Item Object that
            // may itself be a Reference Object (OAS 3.1 permits Path Item
            // `$ref` to `#/components/pathItems/<Name>`). Resolve the
            // chain via the multi-hop resolver so nested refs do not
            // silently render zero operations. Mirrors the fix applied
            // to `listOperations` / `listWebhooks`.
            const cbPathItem = resolvePathItem(
                parsed,
                rawCbPathItem,
                diagnostics
            );
            if (cbPathItem === undefined) continue;

            // Callback path items may contain nested methods
            for (const cbMethod of HTTP_METHODS) {
                const cbOp = getProperty(cbPathItem, cbMethod);
                if (!isObject(cbOp)) continue;

                operations.push({
                    path: `${name}/${cbPath}`,
                    method: cbMethod,
                    operationId: getString(cbOp, "operationId"),
                    summary: getString(cbOp, "summary"),
                    description: getString(cbOp, "description"),
                    deprecated: getProperty(cbOp, "deprecated") === true,
                    operation: cbOp,
                });
            }
        }

        result.push({ name, operations });
    }
    return result;
}

// ---------------------------------------------------------------------------
// Links (OpenAPI 3.0 response links)
// ---------------------------------------------------------------------------

/**
 * List the OpenAPI link definitions declared on a specific response of
 * a single operation, returning each link's parsed
 * {@link LinkInfo} entry.
 */
export function getLinks(
    parsed: OpenApiDocument,
    path: string,
    method: string,
    statusCode: string,
    diagnostics?: DiagnosticsOptions
): LinkInfo[] {
    const pathItem = lookupPathItem(parsed, path);
    const operation = getProperty(pathItem, method);
    const responses = getProperty(operation, "responses");
    const response = getProperty(responses, statusCode);
    if (!isObject(response)) return [];

    const links = getProperty(response, "links");
    if (!isObject(links)) return [];

    const result: LinkInfo[] = [];
    for (const [name, linkObj] of Object.entries(links)) {
        if (!isObject(linkObj)) continue;

        // Resolve $ref on the link via the multi-hop Reference Object
        // resolver — OAS 3.x permits Reference Object chains. On failure
        // (unresolvable, cyclic, over-deep) fall back to the wrapper so
        // the entry surfaces with whatever fields the wrapper itself
        // carries, matching the historical "fall through on resolution
        // failure" behaviour of every other resolver in this module.
        const link =
            resolveReferenceObjectChain(
                parsed.doc,
                linkObj,
                "link",
                diagnostics
            ) ?? linkObj;

        // Extract parameters map
        const params = getProperty(link, "parameters");
        const paramMap = new Map<string, string>();
        if (isObject(params)) {
            for (const [paramName, paramValue] of Object.entries(params)) {
                if (typeof paramValue === "string") {
                    paramMap.set(paramName, paramValue);
                }
            }
        }

        result.push({
            name,
            operationId: getString(link, "operationId"),
            operationRef: getString(link, "operationRef"),
            description: getString(link, "description"),
            parameters: paramMap,
            requestBody: getString(link, "requestBody"),
        });
    }
    return result;
}
