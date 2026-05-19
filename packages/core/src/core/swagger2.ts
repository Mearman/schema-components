/**
 * Swagger 2.0 → OpenAPI 3.1 document normalisation.
 *
 * Transforms a Swagger 2.0 document into an OpenAPI 3.1-compatible
 * structure: host/basePath/schemes → servers, definitions → components,
 * body/formData params → requestBody, response schemas → content.
 *
 * Individual schemas within the document are also normalised for
 * Draft 04 semantics (exclusiveMinimum/exclusiveMaximum booleans).
 */

import { isObject } from "../core/guards.ts";
import type { NodeTransform } from "./normalise.ts";
import { documentContainsKeyword } from "./normalise.ts";
import { normaliseOpenApi30Combined } from "./openapi30.ts";
import type { DiagnosticsOptions } from "./diagnostics.ts";
import { appendPointer, emitDiagnostic } from "./diagnostics.ts";
import {
    rewriteSwaggerRefPrefix,
    SWAGGER_2_METHODS,
} from "./openapiConstants.ts";
import { resolveRefChain } from "./refChain.ts";
import { isPrototypePollutingKey } from "./uri.ts";

// ---------------------------------------------------------------------------
// Document-level transformation
// ---------------------------------------------------------------------------

/**
 * Transform a Swagger 2.0 document into an OpenAPI 3.1-compatible
 * structure.
 */
export function normaliseSwagger2Document(
    doc: Record<string, unknown>,
    deepNormalise: (
        schema: Record<string, unknown>,
        transform: NodeTransform
    ) => Record<string, unknown>,
    normaliseDraft04Node: NodeTransform,
    diagnostics?: DiagnosticsOptions
): Record<string, unknown> {
    const result: Record<string, unknown> = {
        openapi: "3.1.0",
        info: isObject(doc.info)
            ? { ...doc.info }
            : { title: "API", version: "0.0.0" },
    };

    // Servers: host + basePath + schemes → servers.
    //
    // Synthesise a server URL only when the document declares a host.
    // Per the Swagger 2.0 spec, host is required to form a complete
    // server URL; absence means "no fixed host" and the historic
    // localhost fallback silently invented one. Likewise, basePath is
    // optional — absence is "no base path", not "/".
    //
    // When only schemes is declared without host, we cannot construct
    // a meaningful URL; emit swagger-missing-host so consumers can
    // notice the omission and supply the host themselves.
    if (typeof doc.host !== "string") {
        if (Array.isArray(doc.schemes) || typeof doc.basePath === "string") {
            emitDiagnostic(diagnostics, {
                code: "swagger-missing-host",
                message:
                    "Swagger 2.0 document declares schemes or basePath without host; skipping server URL synthesis",
                pointer: "",
                detail: {
                    hasSchemes: Array.isArray(doc.schemes),
                    hasBasePath: typeof doc.basePath === "string",
                },
            });
        }
    } else {
        const host = doc.host;
        const basePath = typeof doc.basePath === "string" ? doc.basePath : "";
        const schemes: unknown[] = Array.isArray(doc.schemes)
            ? doc.schemes
            : ["https"];
        const scheme = typeof schemes[0] === "string" ? schemes[0] : "https";

        result.servers = [{ url: `${scheme}://${host}${basePath}` }];
    }

    // Paths: transform operations
    const paths = doc.paths;
    if (isObject(paths)) {
        result.paths = normaliseSwaggerPaths(paths, doc, diagnostics);
    }

    // Components
    const components: Record<string, unknown> = {};

    // definitions → components/schemas (with Draft 04 normalisation)
    const definitions = doc.definitions;
    if (isObject(definitions)) {
        const schemas: Record<string, unknown> = {};
        for (const [name, schema] of Object.entries(definitions)) {
            schemas[name] = isObject(schema)
                ? deepNormalise(schema, (node) =>
                      normaliseOpenApi30Combined(normaliseDraft04Node(node))
                  )
                : schema;
        }
        components.schemas = schemas;
    }

    // parameters → components/parameters
    //
    // Swagger 2.0 parameters may sit at the body/formData locations,
    // which OpenAPI 3.x does not permit under `components.parameters`.
    // We lift those into a synthesised `components.requestBodies` map
    // and deep-normalise the remainder. Non-body/non-formData entries
    // are converted (type/format → schema, collectionFormat → style/
    // explode) so consumers see OpenAPI 3.x-shaped parameters.
    const parameters = doc.parameters;
    const requestBodies: Record<string, unknown> = {};
    if (isObject(parameters)) {
        const consumesResolution = resolveSwaggerContentTypes(
            undefined,
            doc.consumes
        );
        const globalConsumes: unknown[] = consumesResolution.types;
        const convertedParameters: Record<string, unknown> = {};
        for (const [name, param] of Object.entries(parameters)) {
            if (!isObject(param)) {
                convertedParameters[name] = param;
                continue;
            }
            const resolution = resolveSwaggerParameter(param, doc);
            if (resolution.kind === "cycle") {
                emitDiagnostic(diagnostics, {
                    code: "swagger-cyclic-parameter-ref",
                    message: `Cyclic Swagger 2.0 parameter $ref "${resolution.ref}"; skipping entry`,
                    pointer: appendPointer(
                        appendPointer("", "parameters"),
                        name
                    ),
                    detail: { ref: resolution.ref, name },
                });
                continue;
            }
            const resolved = resolution.param;
            const location = resolved.in;
            if (location === "body") {
                const paramPointer = appendPointer(
                    appendPointer("", "parameters"),
                    name
                );
                let bodyContentTypes: unknown[];
                if (consumesResolution.source === "synthesised") {
                    bodyContentTypes = globalConsumes;
                    emitDiagnostic(diagnostics, {
                        code: "swagger-missing-consumes",
                        message:
                            "Global body parameter declared but document-level `consumes` is absent; defaulting to application/json",
                        pointer: paramPointer,
                        detail: { level: "document", name },
                    });
                } else if (globalConsumes.length === 0) {
                    // Explicit empty `consumes` at the document level.
                    // Preserve the empty content map and surface the
                    // intentional clear under a distinct diagnostic
                    // shape (reusing `swagger-missing-consumes` so
                    // existing sinks still receive the signal).
                    bodyContentTypes = [];
                    emitDiagnostic(diagnostics, {
                        code: "swagger-missing-consumes",
                        message:
                            "Global body parameter declared but document-level `consumes` is an explicit empty array; preserving an empty content map",
                        pointer: paramPointer,
                        detail: {
                            level: "document",
                            name,
                            reason: "explicitly-cleared",
                            source: consumesResolution.source,
                        },
                    });
                } else {
                    bodyContentTypes = globalConsumes;
                }
                requestBodies[name] = buildRequestBody(
                    resolved,
                    bodyContentTypes
                );
            } else if (location === "formData") {
                // A standalone formData entry under components.parameters is
                // unusual; convert it to a single-property body, honouring the
                // document-level consumes when it includes
                // `application/x-www-form-urlencoded`.
                requestBodies[name] = buildRequestBody(
                    buildFormDataBody(resolved, [resolved]),
                    formDataContentTypes(globalConsumes)
                );
            } else {
                const normalised = normaliseSwaggerParameter(
                    resolved,
                    doc,
                    diagnostics,
                    appendPointer(appendPointer("", "parameters"), name)
                );
                if (normalised !== undefined) {
                    convertedParameters[name] = normalised;
                }
            }
        }
        if (Object.keys(convertedParameters).length > 0) {
            components.parameters = convertedParameters;
        }
    }

    // responses → components/responses
    //
    // Swagger 2.0 responses carry a top-level `schema` field that must be
    // wrapped in `content` keyed by produces media types for OpenAPI 3.x.
    // Use the same resolveSwaggerContentTypes path as operations so the
    // missing-produces diagnostic fires consistently for both locations.
    const responses = doc.responses;
    if (isObject(responses)) {
        const producesResolution = resolveSwaggerContentTypes(
            undefined,
            doc.produces
        );
        const convertedResponses: Record<string, unknown> = {};
        for (const [name, response] of Object.entries(responses)) {
            convertedResponses[name] = isObject(response)
                ? normaliseSwaggerSingleResponse(
                      response,
                      doc,
                      producesResolution.types,
                      producesResolution.source,
                      diagnostics,
                      undefined,
                      undefined,
                      name
                  )
                : response;
        }
        components.responses = convertedResponses;
    }

    if (Object.keys(requestBodies).length > 0) {
        components.requestBodies = requestBodies;
    }

    // securityDefinitions → components/securitySchemes
    //
    // Swagger 2.0 uses a different shape per scheme type than OpenAPI 3.x:
    //
    // - `basic` → `{ type: "http", scheme: "basic" }` (the bare `basic`
    //   type does not exist in OAS 3.x).
    // - `oauth2` carries `flow` (singular) plus top-level `authorizationUrl`,
    //   `tokenUrl`, `scopes`. OAS 3.x nests these under `flows.<name>` where
    //   `application` becomes `clientCredentials` and `accessCode` becomes
    //   `authorizationCode`.
    // - `apiKey` is structurally compatible — pass through as-is.
    //
    // Translate each entry so downstream <ApiSecurity> sees an OAS 3.x
    // shape regardless of the source document version.
    const securityDefinitions = doc.securityDefinitions;
    if (isObject(securityDefinitions)) {
        const translated: Record<string, unknown> = {};
        const securityDefinitionsPointer = appendPointer(
            "",
            "securityDefinitions"
        );
        for (const [name, scheme] of Object.entries(securityDefinitions)) {
            const schemePointer = appendPointer(
                securityDefinitionsPointer,
                name
            );
            translated[name] = isObject(scheme)
                ? translateSwaggerSecurityScheme(
                      scheme,
                      diagnostics,
                      schemePointer,
                      name
                  )
                : scheme;
        }
        components.securitySchemes = translated;
    }

    if (Object.keys(components).length > 0) {
        result.components = components;
    }

    // tags
    if (Array.isArray(doc.tags)) {
        result.tags = doc.tags;
    }

    // externalDocs
    if (isObject(doc.externalDocs)) {
        result.externalDocs = doc.externalDocs;
    }

    // Top-level security: Swagger 2.0 uses the same shape as OpenAPI 3.x
    // (`Array<Record<string, string[]>>`) and operations without their own
    // `security` field inherit the document-level requirements.
    if (Array.isArray(doc.security)) {
        result.security = doc.security;
    }

    // Rewrite $ref strings from Swagger 2.0 locations to OpenAPI 3.x
    // locations: #/definitions/X → #/components/schemas/X, etc.
    rewriteSwaggerRefs(result);

    // Emit diagnostics for dropped Swagger 2.0 features.
    //
    // The XML-namespace metadata Swagger 2.0 attaches to schemas (and the
    // `consumes: ["application/xml"]` annotations operations may carry)
    // has no renderer surface — `extractXmlInfo` exists but no React component
    // invokes it. Surface this loudly when any subtree carries `xml`
    // markup, regardless of whether it sits in definitions, paths,
    // parameters, or responses.
    if (
        documentContainsKeyword(doc.definitions, "xml") ||
        documentContainsKeyword(doc.paths, "xml") ||
        documentContainsKeyword(doc.parameters, "xml") ||
        documentContainsKeyword(doc.responses, "xml")
    ) {
        emitDiagnostic(diagnostics, {
            code: "dropped-swagger-feature",
            message:
                "Swagger 2.0 xml markup is not supported and will be dropped",
            pointer: "",
            detail: { feature: "xml" },
        });
    }

    return result;
}

// ---------------------------------------------------------------------------
// Path / operation normalisation
// ---------------------------------------------------------------------------

function normaliseSwaggerPaths(
    paths: Record<string, unknown>,
    doc: Record<string, unknown>,
    diagnostics?: DiagnosticsOptions
): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [path, pathItem] of Object.entries(paths)) {
        if (!isObject(pathItem)) {
            result[path] = pathItem;
            continue;
        }

        const normalisedPath: Record<string, unknown> = {};

        for (const method of SWAGGER_2_METHODS) {
            const operation = pathItem[method];
            if (!isObject(operation)) continue;

            normalisedPath[method] = normaliseSwaggerOperation(
                operation,
                doc,
                path,
                method,
                diagnostics
            );
        }

        // Path-level parameters. `normaliseSwaggerParameter` returns
        // `undefined` for cycle-broken `$ref`s; those entries are dropped
        // from the output rather than carrying a junk `{ $ref }` shape
        // downstream — the diagnostic was already emitted by the
        // resolver.
        const pathParams = pathItem.parameters;
        if (Array.isArray(pathParams)) {
            const paramsPointer = appendPointer(
                appendPointer(appendPointer("", "paths"), path),
                "parameters"
            );
            const out: unknown[] = [];
            for (const [index, p] of pathParams.entries()) {
                if (!isObject(p)) {
                    out.push(p);
                    continue;
                }
                const normalised = normaliseSwaggerParameter(
                    p,
                    doc,
                    diagnostics,
                    appendPointer(paramsPointer, String(index))
                );
                if (normalised !== undefined) out.push(normalised);
            }
            normalisedPath.parameters = out;
        }

        result[path] = normalisedPath;
    }

    return result;
}

function normaliseSwaggerOperation(
    operation: Record<string, unknown>,
    doc: Record<string, unknown>,
    path: string,
    method: string,
    diagnostics?: DiagnosticsOptions
): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    // Resolve produces/consumes: operation-level overrides global.
    //
    // Per the Swagger 2.0 spec, absence of `consumes`/`produces` at
    // BOTH the operation and document level means "no body is sent /
    // returned" — NOT an implicit default of `application/json`. The
    // historic normaliser synthesised `application/json` content even
    // when no content type was declared, which silently invented
    // payloads. Detect both-absent below and surface a
    // `swagger-missing-consumes` diagnostic only when the operation
    // actually carries a body parameter that requires a content type
    // to be conveyed at all.
    const consumesResolution = resolveSwaggerContentTypes(
        operation.consumes,
        doc.consumes
    );
    const producesResolution = resolveSwaggerContentTypes(
        operation.produces,
        doc.produces
    );
    const produces: unknown[] = producesResolution.types;
    const consumes: unknown[] = consumesResolution.types;

    // Copy non-special fields. Refuse to copy a prototype-polluting
    // property name — a hostile Swagger 2.0 document parsed via
    // `JSON.parse` can carry `__proto__` as an own property, and a
    // direct assignment would mutate the runtime prototype chain.
    for (const [key, value] of Object.entries(operation)) {
        if (
            key !== "parameters" &&
            key !== "responses" &&
            key !== "produces" &&
            key !== "consumes"
        ) {
            if (isPrototypePollutingKey(key)) {
                emitDiagnostic(diagnostics, {
                    code: "prototype-polluting-property",
                    message: `Refusing to copy prototype-polluting property name into normalised operation: ${key}`,
                    pointer: appendPointer(`/paths/${path}/${method}`, key),
                    detail: { propertyName: key },
                });
                continue;
            }
            result[key] = value;
        }
    }

    // Separate body/formData params from others
    const params = operation.parameters;
    if (Array.isArray(params)) {
        const nonBodyParams: unknown[] = [];
        let bodyParam: Record<string, unknown> | undefined;
        let firstBodyName: string | undefined;
        let usesFormData = false;

        for (const [index, param] of params.entries()) {
            if (!isObject(param)) {
                nonBodyParams.push(param);
                continue;
            }

            const paramResolution = resolveSwaggerParameter(param, doc);
            if (paramResolution.kind === "cycle") {
                emitDiagnostic(diagnostics, {
                    code: "swagger-cyclic-parameter-ref",
                    message: `Cyclic Swagger 2.0 parameter $ref "${paramResolution.ref}"; skipping entry`,
                    pointer: appendPointer(
                        appendPointer(
                            appendPointer(
                                appendPointer(appendPointer("", "paths"), path),
                                method
                            ),
                            "parameters"
                        ),
                        String(index)
                    ),
                    detail: { ref: paramResolution.ref },
                });
                continue;
            }
            const resolvedParam = paramResolution.param;
            const location = resolvedParam.in;

            if (location === "body") {
                if (bodyParam !== undefined) {
                    // OpenAPI Specification 2.0 forbids more than one `in: body`
                    // parameter per operation. Apply first-write-wins (mirroring
                    // the mergeAllOf precedent) and surface the loss as a
                    // diagnostic so the discard is visible to consumers.
                    const duplicateName =
                        typeof resolvedParam.name === "string"
                            ? resolvedParam.name
                            : `parameters[${String(index)}]`;
                    emitDiagnostic(diagnostics, {
                        code: "duplicate-body-parameter",
                        message: `Operation defines more than one "in: body" parameter; keeping the first ("${firstBodyName ?? "(unnamed)"}") and discarding "${duplicateName}"`,
                        pointer: appendPointer(
                            appendPointer(
                                appendPointer(appendPointer("", "paths"), path),
                                method
                            ),
                            "parameters"
                        ),
                        detail: {
                            kept: firstBodyName,
                            discarded: duplicateName,
                            location: "operation",
                        },
                    });
                    continue;
                }
                bodyParam = resolvedParam;
                firstBodyName =
                    typeof resolvedParam.name === "string"
                        ? resolvedParam.name
                        : undefined;
            } else if (location === "formData") {
                // Convert formData to request body. The first formData parameter
                // triggers conversion; subsequent ones are collated by
                // buildFormDataBody itself (it walks `params`).
                if (!usesFormData) {
                    bodyParam = buildFormDataBody(resolvedParam, params);
                    usesFormData = true;
                }
            } else {
                const paramPointer = appendPointer(
                    appendPointer(
                        appendPointer(
                            appendPointer(appendPointer("", "paths"), path),
                            method
                        ),
                        "parameters"
                    ),
                    String(index)
                );
                const normalised = normaliseSwaggerParameter(
                    resolvedParam,
                    doc,
                    diagnostics,
                    paramPointer
                );
                if (normalised !== undefined) {
                    nonBodyParams.push(normalised);
                }
            }
        }

        if (nonBodyParams.length > 0) {
            result.parameters = nonBodyParams;
        }

        if (bodyParam !== undefined) {
            // formData operations always carry a content type
            // (`multipart/form-data` or `application/x-www-form-urlencoded`),
            // chosen by formDataContentTypes — no diagnostic is needed
            // even when both consumes declarations are absent.
            const operationPointer = appendPointer(
                appendPointer(appendPointer("", "paths"), path),
                method
            );
            let bodyContentTypes: unknown[];
            if (usesFormData) {
                bodyContentTypes = formDataContentTypes(consumes);
            } else if (consumesResolution.source === "synthesised") {
                // Neither level declared `consumes`; honour the historic
                // application/json fallback but surface the assumption.
                bodyContentTypes = consumes;
                emitDiagnostic(diagnostics, {
                    code: "swagger-missing-consumes",
                    message:
                        "Operation declares a body parameter but neither operation-level nor document-level `consumes` is set; defaulting to application/json",
                    pointer: operationPointer,
                    detail: { level: "operation", method },
                });
            } else if (consumes.length === 0) {
                // The source document explicitly cleared `consumes`
                // (operation- or document-level empty array). Preserve
                // the empty content map rather than inventing
                // application/json — the silent substitution masked an
                // intentional clear that downstream consumers need to
                // see. Reuse `swagger-missing-consumes` with a
                // `reason: "explicitly-cleared"` detail so existing
                // sinks still receive the signal under a distinct
                // diagnostic shape.
                bodyContentTypes = [];
                emitDiagnostic(diagnostics, {
                    code: "swagger-missing-consumes",
                    message:
                        "Operation declares a body parameter but `consumes` is an explicit empty array; preserving an empty content map",
                    pointer: operationPointer,
                    detail: {
                        level: "operation",
                        method,
                        reason: "explicitly-cleared",
                        source: consumesResolution.source,
                    },
                });
            } else {
                bodyContentTypes = consumes;
            }
            result.requestBody = buildRequestBody(bodyParam, bodyContentTypes);
        }
    }

    // Responses: wrap schemas in content. When `produces` was absent
    // at both levels the response normaliser must NOT synthesise an
    // `application/json` content map for response bodies — only emit
    // a diagnostic for responses that actually carry a `schema`.
    const responses = operation.responses;
    if (isObject(responses)) {
        result.responses = normaliseSwaggerResponses(
            responses,
            doc,
            produces,
            producesResolution.source,
            diagnostics,
            path,
            method
        );
    }

    return result;
}

// ---------------------------------------------------------------------------
// consumes / produces resolution
// ---------------------------------------------------------------------------

interface ContentTypesResolution {
    /**
     * Content types to use for body/response normalisation. Synthesised
     * `application/json` is included when the original source declared
     * nothing — but the caller may choose not to emit any content when
     * `source === "synthesised"` and no body is actually present.
     */
    types: unknown[];
    /**
     * `"operation"`: the operation-level array was present.
     * `"document"`: the document-level array was present.
     * `"synthesised"`: neither level declared a value — `types` carries
     * the historic `application/json` fallback but the caller must
     * decide whether to use it (only when a body is genuinely required)
     * and emit `swagger-missing-consumes`/`swagger-missing-produces`.
     */
    source: "operation" | "document" | "synthesised";
}

/**
 * Resolve a Swagger 2.0 `consumes` or `produces` array, recording
 * where the value came from so callers can decide whether to emit a
 * "missing content type" diagnostic. Per the Swagger 2.0 spec, absence
 * at BOTH levels means no body — not an implicit `application/json`.
 */
function resolveSwaggerContentTypes(
    operationLevel: unknown,
    documentLevel: unknown
): ContentTypesResolution {
    if (Array.isArray(operationLevel)) {
        return { types: operationLevel, source: "operation" };
    }
    if (Array.isArray(documentLevel)) {
        return { types: documentLevel, source: "document" };
    }
    return { types: ["application/json"], source: "synthesised" };
}

// ---------------------------------------------------------------------------
// formData media-type selection
// ---------------------------------------------------------------------------

/**
 * Determine the request body media type for a Swagger 2.0 formData operation.
 *
 * Per the OAS 3 conversion rules, `application/x-www-form-urlencoded` is
 * preferred when the operation- or document-level `consumes` includes it;
 * otherwise `multipart/form-data` is the default. File uploads (Swagger 2.0
 * `type: file`) still require `multipart/form-data`, but the formData body
 * schema-builder normalises them to `string` + `format: binary` either way
 * and the choice of media type is left to the source document.
 */
function formDataContentTypes(consumes: unknown[]): string[] {
    if (consumes.includes("application/x-www-form-urlencoded")) {
        return ["application/x-www-form-urlencoded"];
    }
    return ["multipart/form-data"];
}

// ---------------------------------------------------------------------------
// Parameter / Header schema synthesis
// ---------------------------------------------------------------------------

/**
 * Every JSON-Schema-compatible constraint keyword Swagger 2.0 allows on
 * a Parameter Object or Header Object alongside `type`/`format`. These
 * lift into the synthesised `schema` so consumers see the original
 * validation semantics under OAS 3.x's parameter shape.
 *
 * `allowEmptyValue` is included even though it is a Swagger 2.0
 * parameter-level keyword in the source (not a schema keyword) — OAS
 * 3.x defines it at the Parameter Object root, so the calling function
 * keeps it at the parameter root rather than copying it into `schema`.
 */
const SWAGGER_PARAM_SCHEMA_KEYWORDS = [
    "enum",
    "default",
    "minimum",
    "maximum",
    "exclusiveMinimum",
    "exclusiveMaximum",
    "multipleOf",
    "minLength",
    "maxLength",
    "pattern",
    "minItems",
    "maxItems",
    "uniqueItems",
] as const;

/**
 * Set of every Swagger 2.0 parameter-root keyword that must be lifted
 * into the synthesised `schema` rather than copied onto the OAS 3.x
 * parameter root. Includes `type`, `format`, `items` (Swagger 2.0
 * parameter-shaped array element descriptor), `collectionFormat`
 * (handled separately by the caller as `style`/`explode`), and every
 * entry from {@link SWAGGER_PARAM_SCHEMA_KEYWORDS}.
 */
const PARAM_KEYWORDS_LIFTED_INTO_SCHEMA = new Set<string>([
    "type",
    "format",
    "items",
    "collectionFormat",
    ...SWAGGER_PARAM_SCHEMA_KEYWORDS,
]);

/**
 * Synthesise an OpenAPI 3.x `schema` object from a Swagger 2.0
 * parameter-shaped node (parameter or header). Copies `type`,
 * `format`, and every JSON-Schema-compatible constraint that Swagger
 * 2.0 places at the parameter root. Nested `items` is recursively
 * synthesised the same way so array element constraints survive.
 */
function buildSchemaFromSwaggerParameterShape(
    node: Record<string, unknown>
): Record<string, unknown> {
    const schema: Record<string, unknown> = { type: node.type };
    if (typeof node.format === "string") {
        schema.format = node.format;
    }
    for (const keyword of SWAGGER_PARAM_SCHEMA_KEYWORDS) {
        if (node[keyword] !== undefined) {
            schema[keyword] = node[keyword];
        }
    }
    // `items` is itself a Swagger 2.0 parameter-shaped node when `type`
    // is `array`. Recurse so nested constraints (pattern, minLength,
    // etc.) survive into the synthesised array's element schema.
    if (isObject(node.items)) {
        schema.items = buildSchemaFromSwaggerParameterShape(node.items);
    }
    return schema;
}

// ---------------------------------------------------------------------------
// Parameter normalisation
// ---------------------------------------------------------------------------

/**
 * Outcome of resolving a Swagger 2.0 parameter `$ref`. Cycles surface
 * a distinct `kind: "cycle"` so callers can emit a diagnostic and skip
 * the entry rather than returning a junk `{ $ref }` envelope that has
 * no `in`/`name` and would silently drop the parameter downstream.
 */
type ResolvedParam =
    | { kind: "ok"; param: Record<string, unknown> }
    | { kind: "cycle"; ref: string };

/**
 * Resolve a Swagger parameter that may be a `$ref`. Returns the
 * resolved parameter object, or a cycle marker so the caller can
 * decide how to surface the failure. Non-ref parameters resolve to
 * themselves; ref targets that don't exist also resolve to the input
 * (the caller treats unknown refs the same as bare parameters).
 *
 * Uses the shared {@link resolveRefChain} helper so cycle detection
 * and hop accounting stay consistent with the other OpenAPI $ref
 * walkers.
 */
function resolveSwaggerParameter(
    param: Record<string, unknown>,
    doc: Record<string, unknown>
): ResolvedParam {
    let cyclicRef: string | undefined;
    const finalNode = resolveRefChain<Record<string, unknown>>(param, {
        extractRef: (node) => {
            const ref = node.$ref;
            if (typeof ref !== "string") return undefined;
            // Only follow Swagger 2.0 parameter refs; treat all other
            // ref shapes as terminal so we return the wrapper unchanged.
            return ref.startsWith("#/parameters/") ? ref : undefined;
        },
        lookup: (ref) => {
            const name = ref.slice("#/parameters/".length);
            const globalParams = doc.parameters;
            if (!isObject(globalParams)) return undefined;
            const resolved = globalParams[name];
            return isObject(resolved) ? resolved : undefined;
        },
        onCycle: (ref) => {
            cyclicRef = ref;
            return undefined;
        },
    });

    if (cyclicRef !== undefined) {
        return { kind: "cycle", ref: cyclicRef };
    }
    // `finalNode` is `undefined` only when the chain dead-ends on an
    // unknown target (legacy behaviour returned the original input in
    // that case); preserve that contract for downstream callers.
    return { kind: "ok", param: finalNode ?? param };
}

/**
 * Normalise a single Swagger parameter to OpenAPI 3.x form.
 */
function normaliseSwaggerParameter(
    param: Record<string, unknown>,
    doc: Record<string, unknown>,
    diagnostics?: DiagnosticsOptions,
    pointer = ""
): Record<string, unknown> | undefined {
    // Resolve $ref before processing
    if (typeof param.$ref === "string") {
        const resolution = resolveSwaggerParameter(param, doc);
        if (resolution.kind === "cycle") {
            emitDiagnostic(diagnostics, {
                code: "swagger-cyclic-parameter-ref",
                message: `Cyclic Swagger 2.0 parameter $ref "${resolution.ref}"; skipping entry`,
                pointer,
                detail: { ref: resolution.ref },
            });
            return undefined;
        }
        const resolved = resolution.param;
        // Avoid infinite recursion if the ref resolved to the same object
        if (resolved !== param) {
            return normaliseSwaggerParameter(
                resolved,
                doc,
                diagnostics,
                pointer
            );
        }
    }

    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(param)) {
        if (PARAM_KEYWORDS_LIFTED_INTO_SCHEMA.has(key)) {
            // Swagger 2.0 places `type`, `format`, and every JSON-Schema
            // constraint at the parameter root. OAS 3.x requires those
            // under `schema`. `collectionFormat` is handled separately
            // below. All these keys are intentionally dropped here and
            // re-emitted via buildSchemaFromSwaggerParameterShape.
            continue;
        }
        if (isPrototypePollutingKey(key)) {
            // A hostile parameter parsed via `JSON.parse` can carry
            // `__proto__` as an own enumerable property. Refuse to copy
            // it across — assignment to the prototype-polluting key on
            // the fresh result would mutate the runtime prototype chain.
            emitDiagnostic(diagnostics, {
                code: "prototype-polluting-property",
                message: `Refusing to copy prototype-polluting property name into normalised parameter: ${key}`,
                pointer: appendPointer(pointer, key),
                detail: { propertyName: key },
            });
            continue;
        }
        result[key] = value;
    }

    // Build schema from type/format
    if (typeof param.type === "string") {
        // Swagger 2.0 allows `type: "file"` exclusively under `in:
        // formData`. A non-formData parameter declaring `type: "file"`
        // is malformed per the spec; surface a diagnostic and emit a
        // best-effort fallback of `{ type: "string", format: "binary" }`
        // (matching the formData file handling) so downstream renderers
        // produce a sensible field.
        if (param.type === "file" && param.in !== "formData") {
            emitDiagnostic(diagnostics, {
                code: "swagger-invalid-file-parameter",
                message: `Swagger 2.0 type: "file" is only valid under in: formData; converting to { type: "string", format: "binary" }`,
                pointer,
                detail: {
                    name: param.name,
                    in: param.in,
                },
            });
            const schema: Record<string, unknown> = {
                type: "string",
                format: "binary",
            };
            result.schema = schema;
        } else {
            const schema = buildSchemaFromSwaggerParameterShape(param);
            result.schema = schema;
        }
    }

    // collectionFormat → style + explode (OpenAPI 3.x)
    //
    // OAS 3.x specifies different default styles per `in` location:
    //   query/cookie → `form`
    //   path/header  → `simple`
    // `csv` therefore maps differently depending on the parameter
    // location (the header normaliser at this file's lower edge
    // already encodes the `simple` mapping for response headers).
    //
    // `tsv` has no equivalent style keyword in OAS 3.x; emit a
    // diagnostic and drop the keyword rather than inventing the
    // invalid `tabDelimited` value the historic normaliser produced.
    const cf = param.collectionFormat;
    if (typeof cf === "string") {
        switch (cf) {
            case "csv": {
                const isSimpleLocation =
                    param.in === "path" || param.in === "header";
                result.style = isSimpleLocation ? "simple" : "form";
                result.explode = false;
                break;
            }
            case "ssv":
                result.style = "spaceDelimited";
                result.explode = false;
                break;
            case "tsv":
                emitDiagnostic(diagnostics, {
                    code: "swagger-collection-format-dropped",
                    message:
                        'Swagger 2.0 collectionFormat: "tsv" has no OpenAPI 3.x equivalent; dropping the keyword',
                    pointer,
                    detail: {
                        feature: "collectionFormat:tsv",
                        location: "parameter",
                    },
                });
                break;
            case "pipes":
                result.style = "pipeDelimited";
                result.explode = false;
                break;
            case "multi":
                result.style = "form";
                result.explode = true;
                break;
        }
    }

    return result;
}

// ---------------------------------------------------------------------------
// Request body construction
// ---------------------------------------------------------------------------

/**
 * Build a request body from a `formData` parameter.
 */
function buildFormDataBody(
    param: Record<string, unknown>,
    allParams: unknown[]
): Record<string, unknown> {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    // Collect all formData params
    for (const p of allParams) {
        if (!isObject(p) || p.in !== "formData") continue;
        const name = p.name;
        if (typeof name !== "string") continue;

        const schema: Record<string, unknown> = {};
        if (p.type === "file") {
            // Swagger 2.0 file upload → string + format: binary
            schema.type = "string";
            schema.format = "binary";
        } else {
            if (typeof p.type === "string") schema.type = p.type;
            if (typeof p.format === "string") schema.format = p.format;
            if (p.enum !== undefined) schema.enum = p.enum;
        }

        properties[name] = schema;

        if (p.required === true) {
            required.push(name);
        }
    }

    return {
        name: param.name,
        in: "body",
        schema: {
            type: "object",
            properties,
            ...(required.length > 0 ? { required } : {}),
        },
    };
}

/**
 * Build an OpenAPI 3.x request body from a Swagger 2.0 body parameter.
 *
 * `consumes` is taken at face value — the caller is responsible for
 * deciding whether an absent value should fall back to a default
 * (and emitting `swagger-missing-consumes`) or be preserved as an
 * empty content map (an explicit clear). Inventing a default here
 * would mask the difference and silently override the upstream
 * resolution.
 */
function buildRequestBody(
    bodyParam: Record<string, unknown>,
    consumes: unknown[]
): Record<string, unknown> {
    const schema = bodyParam.schema;
    const content: Record<string, unknown> = {};

    for (const ct of consumes) {
        if (typeof ct === "string") {
            content[ct] = isObject(schema) ? { schema } : {};
        }
    }

    const result: Record<string, unknown> = { content };

    if (bodyParam.required === true) {
        result.required = true;
    }
    if (typeof bodyParam.description === "string") {
        result.description = bodyParam.description;
    }

    return result;
}

// ---------------------------------------------------------------------------
// Response normalisation
// ---------------------------------------------------------------------------

/**
 * Resolve a Swagger 2.0 response `$ref` (e.g. `#/responses/NotFound`).
 *
 * Uses the shared {@link resolveRefChain} helper so cycle detection
 * and hop accounting stay consistent with the other OpenAPI $ref
 * walkers. On cycle the original wrapper is returned (legacy
 * behaviour), preserving the existing response-resolution contract.
 */
function resolveSwaggerResponse(
    response: Record<string, unknown>,
    doc: Record<string, unknown>
): Record<string, unknown> {
    const finalNode = resolveRefChain<Record<string, unknown>>(response, {
        extractRef: (node) => {
            const ref = node.$ref;
            if (typeof ref !== "string") return undefined;
            // Only follow Swagger 2.0 response refs; treat all other
            // ref shapes as terminal so we return the wrapper unchanged.
            return ref.startsWith("#/responses/") ? ref : undefined;
        },
        lookup: (ref) => {
            const name = ref.slice("#/responses/".length);
            const globalResponses = doc.responses;
            if (!isObject(globalResponses)) return undefined;
            const resolved = globalResponses[name];
            return isObject(resolved) ? resolved : undefined;
        },
        // Preserve the historic cycle behaviour: return the original
        // wrapper so the caller continues to short-circuit gracefully.
        onCycle: () => response,
    });

    return finalNode ?? response;
}

function normaliseSwaggerResponses(
    responses: Record<string, unknown>,
    doc: Record<string, unknown>,
    produces: unknown[],
    producesSource: ContentTypesResolution["source"],
    diagnostics?: DiagnosticsOptions,
    path?: string,
    method?: string
): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [code, response] of Object.entries(responses)) {
        if (!isObject(response)) {
            result[code] = response;
            continue;
        }
        result[code] = normaliseSwaggerSingleResponse(
            response,
            doc,
            produces,
            producesSource,
            diagnostics,
            path,
            method,
            code
        );
    }

    return result;
}

/**
 * Normalise a single Swagger 2.0 response object — resolves any `$ref` to
 * `#/responses/<Name>` and wraps a top-level `schema` in an OpenAPI 3.x
 * `content` map keyed by the supplied media types.
 *
 * Extracted so the same logic applies whether the response sits inside an
 * operation’s `responses` map or under document-level `responses`
 * (now `components.responses`).
 */
function normaliseSwaggerSingleResponse(
    response: Record<string, unknown>,
    doc: Record<string, unknown>,
    produces: unknown[],
    producesSource: ContentTypesResolution["source"] = "synthesised",
    diagnostics?: DiagnosticsOptions,
    path?: string,
    method?: string,
    statusCode?: string
): Record<string, unknown> {
    // Resolve $ref to #/responses/Name
    const resolved = resolveSwaggerResponse(response, doc);

    const normalised: Record<string, unknown> = {};

    // Copy non-schema, non-headers fields verbatim.
    // `schema` is wrapped into `content` below; `headers` carry Swagger 2.0
    // parameter-style keywords at the root that must be re-shaped into
    // OpenAPI 3.x form before the renderer sees them.
    for (const [key, value] of Object.entries(resolved)) {
        if (key !== "schema" && key !== "headers") {
            if (isPrototypePollutingKey(key)) {
                // A response object parsed via `JSON.parse` can carry
                // `__proto__` as an own enumerable property. Refuse to
                // copy it across — assignment would otherwise mutate
                // the runtime prototype chain.
                emitDiagnostic(diagnostics, {
                    code: "prototype-polluting-property",
                    message: `Refusing to copy prototype-polluting property name into normalised response: ${key}`,
                    pointer:
                        path !== undefined &&
                        method !== undefined &&
                        statusCode !== undefined
                            ? appendPointer(
                                  `/paths/${path}/${method}/responses/${statusCode}`,
                                  key
                              )
                            : key,
                    detail: { propertyName: key },
                });
                continue;
            }
            normalised[key] = value;
        }
    }

    // Wrap schema in content with produces content types
    const schema = resolved.schema;
    if (isObject(schema)) {
        const content: Record<string, unknown> = {};
        const contentTypes =
            produces.length > 0 ? produces : ["application/json"];
        for (const ct of contentTypes) {
            if (typeof ct === "string") {
                content[ct] = { schema };
            }
        }
        normalised.content = content;
        // The response carries a schema but `produces` was never set —
        // we synthesised application/json. Surface the assumption.
        if (producesSource === "synthesised") {
            emitDiagnostic(diagnostics, {
                code: "swagger-missing-consumes",
                message:
                    "Response declares a schema but neither operation-level nor document-level `produces` is set; defaulting to application/json",
                pointer:
                    path !== undefined &&
                    method !== undefined &&
                    statusCode !== undefined
                        ? appendPointer(
                              appendPointer(
                                  appendPointer(
                                      appendPointer(
                                          appendPointer("", "paths"),
                                          path
                                      ),
                                      method
                                  ),
                                  "responses"
                              ),
                              statusCode
                          )
                        : "",
                detail: { level: "response", statusCode },
            });
        }
    }

    // Convert response headers from Swagger 2.0 shape to OpenAPI 3.x.
    const headers = resolved.headers;
    if (isObject(headers)) {
        const convertedHeaders: Record<string, unknown> = {};
        // Base pointer to this response's `headers` map; the per-header
        // segment is appended below so diagnostics emitted while
        // normalising a header carry a precise JSON Pointer.
        const headersBasePointer =
            path !== undefined &&
            method !== undefined &&
            statusCode !== undefined
                ? appendPointer(
                      appendPointer(
                          appendPointer(
                              appendPointer(appendPointer("", "paths"), path),
                              method
                          ),
                          "responses"
                      ),
                      statusCode
                  )
                : "";
        const headersPointer = appendPointer(headersBasePointer, "headers");
        for (const [name, header] of Object.entries(headers)) {
            const headerPointer = appendPointer(headersPointer, name);
            convertedHeaders[name] = isObject(header)
                ? normaliseSwaggerHeader(header, diagnostics, headerPointer)
                : header;
        }
        normalised.headers = convertedHeaders;
    }

    return normalised;
}

/**
 * Normalise a single Swagger 2.0 response header to OpenAPI 3.x form.
 *
 * Swagger 2.0 headers mirror parameter shape: `type`/`format`/
 * `collectionFormat` live at the root. OpenAPI 3.x requires the type
 * descriptor under `schema`, with collection serialisation expressed via
 * `style`/`explode`. Headers do not carry `name` or `in` — those are not
 * part of either spec at this level — so this is a thin sibling to
 * `normaliseSwaggerParameter` rather than a full reuse. The OpenAPI 3.x
 * default header style is `simple`, so CSV-encoded headers map to
 * `simple`/`explode: false` rather than the `form` style used for query
 * parameters.
 */
function normaliseSwaggerHeader(
    header: Record<string, unknown>,
    diagnostics?: DiagnosticsOptions,
    pointer = ""
): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(header)) {
        if (PARAM_KEYWORDS_LIFTED_INTO_SCHEMA.has(key)) {
            continue;
        }
        if (isPrototypePollutingKey(key)) {
            // A header object parsed via `JSON.parse` can carry
            // `__proto__` as an own enumerable property. Refuse to copy
            // it across — assignment would mutate the runtime prototype
            // chain.
            emitDiagnostic(diagnostics, {
                code: "prototype-polluting-property",
                message: `Refusing to copy prototype-polluting property name into normalised header: ${key}`,
                pointer: appendPointer(pointer, key),
                detail: { propertyName: key },
            });
            continue;
        }
        result[key] = value;
    }

    if (typeof header.type === "string") {
        result.schema = buildSchemaFromSwaggerParameterShape(header);
    }

    const cf = header.collectionFormat;
    if (typeof cf === "string") {
        switch (cf) {
            case "csv":
                result.style = "simple";
                result.explode = false;
                break;
            case "ssv":
                result.style = "spaceDelimited";
                result.explode = false;
                break;
            case "tsv":
                // `tsv` has no OpenAPI 3.x equivalent style keyword; drop
                // it and surface the loss rather than emit the invalid
                // `tabDelimited` value the historic normaliser produced.
                emitDiagnostic(diagnostics, {
                    code: "swagger-collection-format-dropped",
                    message:
                        'Swagger 2.0 collectionFormat: "tsv" has no OpenAPI 3.x equivalent; dropping the keyword',
                    pointer,
                    detail: {
                        feature: "collectionFormat:tsv",
                        location: "header",
                    },
                });
                break;
            case "pipes":
                result.style = "pipeDelimited";
                result.explode = false;
                break;
        }
    }

    return result;
}

// ---------------------------------------------------------------------------
// $ref rewriting
// ---------------------------------------------------------------------------

/**
 * Deep-rewrite $ref strings in a normalised Swagger 2.0 document
 * from Swagger 2.0 locations to OpenAPI 3.x locations using the
 * shared {@link rewriteSwaggerRefPrefix} mapping. Mutates the object
 * in place \u2014 called only on the fresh clone produced by
 * normaliseSwagger2Document.
 */
function rewriteSwaggerRefs(node: unknown): void {
    if (!isObject(node)) return;

    if (typeof node.$ref === "string") {
        node.$ref = rewriteSwaggerRefPrefix(node.$ref);
    }

    for (const value of Object.values(node)) {
        if (isObject(value)) {
            rewriteSwaggerRefs(value);
        } else if (Array.isArray(value)) {
            for (const item of value) {
                rewriteSwaggerRefs(item);
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Security scheme translation
// ---------------------------------------------------------------------------

/**
 * Map from Swagger 2.0 `oauth2.flow` (singular) to the OAS 3.x flow key
 * under `flows.<key>`. `application` and `accessCode` were renamed in
 * OAS 3.x to align with RFC 6749 grant-type names.
 */
const SWAGGER_OAUTH_FLOW_RENAME: Readonly<Record<string, string>> = {
    implicit: "implicit",
    password: "password",
    application: "clientCredentials",
    accessCode: "authorizationCode",
};

/**
 * Translate a Swagger 2.0 Security Scheme Object into an OpenAPI 3.x
 * Security Scheme Object. The Swagger 2.0 spec defines three types:
 *
 * - `basic` — has no other fields; OAS 3.x represents this as
 *   `{ type: "http", scheme: "basic" }`.
 * - `apiKey` — carries `name`/`in`; OAS 3.x uses the same shape.
 * - `oauth2` — carries `flow`/`authorizationUrl`/`tokenUrl`/`scopes` at
 *   the root. OAS 3.x nests these under `flows.<name>` where the flow
 *   name maps via {@link SWAGGER_OAUTH_FLOW_RENAME}.
 *
 * Unknown `type` values pass through verbatim — downstream validation
 * (`unknown-security-scheme-type` diagnostic in the parser) handles
 * those cases.
 */
function translateSwaggerSecurityScheme(
    scheme: Record<string, unknown>,
    diagnostics?: DiagnosticsOptions,
    pointer = "",
    name?: string
): Record<string, unknown> {
    const type = scheme.type;
    if (type === "basic") {
        const result: Record<string, unknown> = {
            type: "http",
            scheme: "basic",
        };
        if (typeof scheme.description === "string") {
            result.description = scheme.description;
        }
        return result;
    }

    if (type === "oauth2") {
        const flowName = scheme.flow;
        if (typeof flowName !== "string") {
            // Malformed but real — surface the broken shape via a
            // diagnostic so consumers see why the renderer cannot turn
            // the scheme into a useful surface. Preserve the original
            // type and any extras the source carried rather than
            // silently dropping the scheme.
            emitDiagnostic(diagnostics, {
                code: "swagger-malformed-oauth-flow",
                message: `Swagger 2.0 oauth2 security scheme${name !== undefined ? ` "${name}"` : ""} is missing the required \`flow\` field; preserving the original shape verbatim`,
                pointer,
                detail: {
                    name,
                    flow: flowName,
                },
            });
            return { ...scheme, type: "oauth2" };
        }
        const renamedFlow = SWAGGER_OAUTH_FLOW_RENAME[flowName] ?? flowName;
        const flowBody: Record<string, unknown> = {};
        // `implicit` and `authorizationCode` carry `authorizationUrl`;
        // `password`, `clientCredentials`, and `authorizationCode` carry
        // `tokenUrl`. Copy every URL that is present rather than
        // gate-keeping by flow — the source document is the authority.
        if (typeof scheme.authorizationUrl === "string") {
            flowBody.authorizationUrl = scheme.authorizationUrl;
        }
        if (typeof scheme.tokenUrl === "string") {
            flowBody.tokenUrl = scheme.tokenUrl;
        }
        if (typeof scheme.refreshUrl === "string") {
            flowBody.refreshUrl = scheme.refreshUrl;
        }
        const scopes = scheme.scopes;
        flowBody.scopes = isObject(scopes) ? { ...scopes } : {};

        const result: Record<string, unknown> = {
            type: "oauth2",
            flows: { [renamedFlow]: flowBody },
        };
        if (typeof scheme.description === "string") {
            result.description = scheme.description;
        }
        return result;
    }

    // apiKey or other — already structurally compatible.
    return { ...scheme };
}
