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
    headers: Map<string, HeaderInfo>;
}

export interface RequestBodyInfo {
    required: boolean;
    description: string | undefined;
    contentTypes: string[];
    schema: JsonObject | undefined;
}

export interface SecurityRequirement {
    name: string;
    scopes: string[];
}

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

export interface HeaderInfo {
    name: string;
    description: string | undefined;
    required: boolean;
    deprecated: boolean;
    schema: JsonObject | undefined;
}

export interface WebhookInfo {
    name: string;
    operations: OperationInfo[];
}

export interface ExternalDocs {
    url: string;
    description: string | undefined;
}

export interface XmlInfo {
    name: string | undefined;
    namespace: string | undefined;
    prefix: string | undefined;
    attribute: boolean;
    wrapped: boolean;
}

export interface CallbackInfo {
    name: string;
    operations: OperationInfo[];
}

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

/**
 * Resolve a path item, following a `$ref` to `components/pathItems/<Name>`
 * (OpenAPI 3.1) if present. Returns `undefined` when the value is not a
 * path item, the ref is malformed, or the target does not resolve.
 */

/**
 * Follow Path Item Object `$ref` chains (up to MAX_PATH_ITEM_REF_HOPS).
 * Returns the resolved Path Item, or `undefined` when the chain cycles,
 * exceeds the cap, or any intermediate ref fails to resolve. The
 * detailed diagnostics for cycle and depth-cap are emitted by the
 * mirroring resolver in `resolve.ts` — this parser-side resolver simply
 * stops walking.
 */
function resolvePathItem(
    parsed: OpenApiDocument,
    pathItem: unknown
): JsonObject | undefined {
    if (!isObject(pathItem)) return undefined;
    const visited = new Set<string>();
    let current: JsonObject = pathItem;
    for (let hop = 0; hop < MAX_PATH_ITEM_REF_HOPS; hop++) {
        const ref = getString(current, "$ref");
        if (ref === undefined) return current;
        if (visited.has(ref)) return undefined;
        visited.add(ref);
        const target = resolveRefInDoc(parsed.doc, ref);
        if (target === undefined) return undefined;
        current = target;
    }
    return undefined;
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

export function listOperations(parsed: OpenApiDocument): OperationInfo[] {
    const operations: OperationInfo[] = [];
    const paths = getProperty(parsed.doc, "paths");

    if (!isObject(paths)) return operations;

    for (const [path, rawPathItem] of Object.entries(paths)) {
        const pathItem = resolvePathItem(parsed, rawPathItem);
        if (pathItem === undefined) continue;

        for (const method of HTTP_METHODS) {
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
 * Resolve a Parameter Object `$ref` chain.
 *
 * OpenAPI 3.x permits a Parameter Object to be replaced by a Reference
 * Object whose `$ref` itself points at another Reference Object — chains
 * of arbitrary length are valid. The previous single-hop implementation
 * silently rendered nothing for chains of length > 1. `resolveRefChain`
 * centralises cycle and depth-cap protection.
 *
 * Cycles and over-deep chains reuse the existing `cyclic-path-item-ref`
 * and `path-item-ref-too-deep` diagnostic codes with a
 * `detail.kind: "parameter"` discriminator. There is no dedicated
 * Parameter-Object code in the current `DiagnosticCode` union; consumers
 * filter by `detail.kind` when they care to distinguish the source.
 *
 * TODO(round7-integration): consider adding dedicated
 * `cyclic-parameter-ref` and `parameter-ref-too-deep` codes to
 * `core/diagnostics.ts` so the kind discriminator on `detail` is not
 * needed. The existing Swagger 2.0 path already uses a dedicated
 * `swagger-cyclic-parameter-ref` for the equivalent failure mode.
 */
function resolveParam(
    doc: JsonObject,
    param: JsonObject,
    diagnostics: DiagnosticsOptions | undefined
): JsonObject | undefined {
    return resolveRefChain<JsonObject>(param, {
        lookup: (ref) =>
            ref.startsWith("#/") ? resolveRefInDoc(doc, ref) : undefined,
        onCycle: (ref) => {
            emitDiagnostic(diagnostics, {
                code: "cyclic-path-item-ref",
                message: `Cyclic Parameter Object $ref "${ref}"`,
                pointer: ref,
                detail: { ref, kind: "parameter" },
            });
            return undefined;
        },
        onDepthExceeded: (ref) => {
            emitDiagnostic(diagnostics, {
                code: "path-item-ref-too-deep",
                message: `Parameter Object $ref chain exceeded the hop cap starting from "${ref}"`,
                pointer: ref,
                detail: { ref, kind: "parameter" },
            });
            return undefined;
        },
    });
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

export function getResponses(
    parsed: OpenApiDocument,
    path: string,
    method: string
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
        // response's fields would be silently ignored.
        const response = resolveWrapperRef(parsed.doc, responseRaw);
        if (response === undefined) continue;

        const content = getProperty(response, "content");
        const contentTypes = isObject(content) ? Object.keys(content) : [];
        const schema = isObject(content)
            ? extractSchemaFromContent(content)
            : undefined;
        const headers = getResponseHeaders(response, parsed.doc);

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
 */
function resolveWrapperRef(
    doc: JsonObject,
    wrapper: JsonObject
): JsonObject | undefined {
    const ref = getString(wrapper, "$ref");
    if (ref === undefined) return wrapper;
    return resolveRefInDoc(doc, ref);
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

export function getResponseHeaders(
    response: JsonObject,
    doc?: JsonObject
): Map<string, HeaderInfo> {
    const result = new Map<string, HeaderInfo>();
    const headers = getProperty(response, "headers");

    if (!isObject(headers)) return result;

    for (const [name, headerObj] of Object.entries(headers)) {
        if (!isObject(headerObj)) continue;

        // Resolve $ref on the header against the document root —
        // e.g. `#/components/headers/MyHeader`. Without the document we
        // cannot resolve the pointer, so fall back to the inline shape.
        const ref = getString(headerObj, "$ref");
        const resolved =
            ref !== undefined && doc !== undefined
                ? resolveRefInDoc(doc, ref)
                : undefined;
        const header = resolved ?? headerObj;
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

export function listWebhooks(parsed: OpenApiDocument): WebhookInfo[] {
    const result: WebhookInfo[] = [];
    const webhooks = getProperty(parsed.doc, "webhooks");

    if (!isObject(webhooks)) return result;

    for (const [name, hookItem] of Object.entries(webhooks)) {
        if (!isObject(hookItem)) continue;

        const operations: OperationInfo[] = [];
        for (const method of HTTP_METHODS) {
            const operation = getProperty(hookItem, method);
            if (!isObject(operation)) continue;

            operations.push({
                path: name,
                method,
                operationId: getString(operation, "operationId"),
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

// ---------------------------------------------------------------------------
// External documentation
// ---------------------------------------------------------------------------

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

export function listCallbacks(
    parsed: OpenApiDocument,
    path: string,
    method: string
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
        for (const [cbPath, cbPathItem] of Object.entries(callbackItem)) {
            if (!isObject(cbPathItem)) continue;

            // Callback path items may contain nested methods
            for (const cbMethod of HTTP_METHODS) {
                const cbOp = getProperty(cbPathItem, cbMethod);
                if (!isObject(cbOp)) continue;

                // Callbacks may use $ref to reuse paths
                const ref = getString(cbOp, "$ref");
                const resolved =
                    ref !== undefined
                        ? (resolveRefInDoc(parsed.doc, ref) ?? cbOp)
                        : cbOp;

                operations.push({
                    path: `${name}/${cbPath}`,
                    method: cbMethod,
                    operationId: getString(resolved, "operationId"),
                    summary: getString(resolved, "summary"),
                    description: getString(resolved, "description"),
                    deprecated: getProperty(resolved, "deprecated") === true,
                    operation: isObject(resolved) ? resolved : cbOp,
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

export function getLinks(
    parsed: OpenApiDocument,
    path: string,
    method: string,
    statusCode: string
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

        // Resolve $ref on the link
        const ref = getString(linkObj, "$ref");
        const resolved =
            ref !== undefined
                ? (resolveRefInDoc(parsed.doc, ref) ?? linkObj)
                : linkObj;
        const link = isObject(resolved) ? resolved : linkObj;

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
