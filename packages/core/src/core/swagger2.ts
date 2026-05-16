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
import { normaliseOpenApi30Combined } from "./openapi30.ts";
import type { DiagnosticsOptions } from "./diagnostics.ts";
import { emitDiagnostic } from "./diagnostics.ts";

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

    // Servers: host + basePath + schemes → servers
    if (
        typeof doc.host === "string" ||
        typeof doc.basePath === "string" ||
        Array.isArray(doc.schemes)
    ) {
        const host = typeof doc.host === "string" ? doc.host : "localhost";
        const basePath = typeof doc.basePath === "string" ? doc.basePath : "/";
        const schemes: unknown[] = Array.isArray(doc.schemes)
            ? doc.schemes
            : ["https"];
        const scheme = typeof schemes[0] === "string" ? schemes[0] : "https";

        result.servers = [{ url: `${scheme}://${host}${basePath}` }];
    }

    // Paths: transform operations
    const paths = doc.paths;
    if (isObject(paths)) {
        result.paths = normaliseSwaggerPaths(paths, doc);
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
    const parameters = doc.parameters;
    if (isObject(parameters)) {
        components.parameters = { ...parameters };
    }

    // responses → components/responses
    const responses = doc.responses;
    if (isObject(responses)) {
        components.responses = { ...responses };
    }

    // securityDefinitions → components/securitySchemes
    const securityDefinitions = doc.securityDefinitions;
    if (isObject(securityDefinitions)) {
        components.securitySchemes = { ...securityDefinitions };
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

    // Rewrite $ref strings from Swagger 2.0 locations to OpenAPI 3.x
    // locations: #/definitions/X → #/components/schemas/X, etc.
    rewriteSwaggerRefs(result);

    // Emit diagnostics for dropped Swagger 2.0 features
    if (
        isObject(doc.xml) ||
        (isObject(doc.definitions) && hasXmlInSchemas(doc.definitions))
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
    doc: Record<string, unknown>
): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    const METHODS = [
        "get",
        "post",
        "put",
        "patch",
        "delete",
        "head",
        "options",
    ] as const;

    for (const [path, pathItem] of Object.entries(paths)) {
        if (!isObject(pathItem)) {
            result[path] = pathItem;
            continue;
        }

        const normalisedPath: Record<string, unknown> = {};

        for (const method of METHODS) {
            const operation = pathItem[method];
            if (!isObject(operation)) continue;

            normalisedPath[method] = normaliseSwaggerOperation(operation, doc);
        }

        // Path-level parameters
        const pathParams = pathItem.parameters;
        if (Array.isArray(pathParams)) {
            normalisedPath.parameters = pathParams.map((p: unknown) =>
                isObject(p) ? normaliseSwaggerParameter(p, doc) : p
            );
        }

        result[path] = normalisedPath;
    }

    return result;
}

function normaliseSwaggerOperation(
    operation: Record<string, unknown>,
    doc: Record<string, unknown>
): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    // Resolve produces/consumes: operation-level overrides global
    const globalProduces: unknown[] = Array.isArray(doc.produces)
        ? doc.produces
        : ["application/json"];
    const globalConsumes: unknown[] = Array.isArray(doc.consumes)
        ? doc.consumes
        : ["application/json"];
    const produces: unknown[] = Array.isArray(operation.produces)
        ? operation.produces
        : globalProduces;
    const consumes: unknown[] = Array.isArray(operation.consumes)
        ? operation.consumes
        : globalConsumes;

    // Copy non-special fields
    for (const [key, value] of Object.entries(operation)) {
        if (
            key !== "parameters" &&
            key !== "responses" &&
            key !== "produces" &&
            key !== "consumes"
        ) {
            result[key] = value;
        }
    }

    // Separate body/formData params from others
    const params = operation.parameters;
    if (Array.isArray(params)) {
        const nonBodyParams: unknown[] = [];
        let bodyParam: Record<string, unknown> | undefined;
        let usesFormData = false;

        for (const param of params) {
            if (!isObject(param)) {
                nonBodyParams.push(param);
                continue;
            }

            const resolvedParam = resolveSwaggerParameter(param, doc);
            const location = resolvedParam.in;

            if (location === "body") {
                bodyParam = resolvedParam;
            } else if (location === "formData") {
                // Convert formData to request body with multipart
                bodyParam = buildFormDataBody(resolvedParam, params);
                usesFormData = true;
            } else {
                nonBodyParams.push(
                    normaliseSwaggerParameter(resolvedParam, doc)
                );
            }
        }

        if (nonBodyParams.length > 0) {
            result.parameters = nonBodyParams;
        }

        if (bodyParam !== undefined) {
            result.requestBody = buildRequestBody(
                bodyParam,
                usesFormData ? ["multipart/form-data"] : consumes
            );
        }
    }

    // Responses: wrap schemas in content
    const responses = operation.responses;
    if (isObject(responses)) {
        result.responses = normaliseSwaggerResponses(responses, doc, produces);
    }

    return result;
}

// ---------------------------------------------------------------------------
// Parameter normalisation
// ---------------------------------------------------------------------------

/**
 * Resolve a Swagger parameter that may be a `$ref`.
 */
function resolveSwaggerParameter(
    param: Record<string, unknown>,
    doc: Record<string, unknown>,
    visited: Set<string> = new Set<string>()
): Record<string, unknown> {
    const ref = param.$ref;
    if (typeof ref !== "string" || !ref.startsWith("#/parameters/")) {
        return param;
    }

    // Cycle detection
    if (visited.has(ref)) return param;
    const nextVisited = new Set(visited);
    nextVisited.add(ref);

    const name = ref.slice("#/parameters/".length);
    const globalParams = doc.parameters;
    if (isObject(globalParams)) {
        const resolved = globalParams[name];
        if (isObject(resolved)) {
            // Recursively resolve if the target is also a $ref
            if (typeof resolved.$ref === "string") {
                return resolveSwaggerParameter(resolved, doc, nextVisited);
            }
            return resolved;
        }
    }

    return param;
}

/**
 * Normalise a single Swagger parameter to OpenAPI 3.x form.
 */
function normaliseSwaggerParameter(
    param: Record<string, unknown>,
    doc: Record<string, unknown>
): Record<string, unknown> {
    // Resolve $ref before processing
    if (typeof param.$ref === "string") {
        const resolved = resolveSwaggerParameter(param, doc);
        // Avoid infinite recursion if the ref resolved to the same object
        if (resolved !== param) {
            return normaliseSwaggerParameter(resolved, doc);
        }
    }

    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(param)) {
        if (key === "type" || key === "format" || key === "collectionFormat") {
            // Swagger parameters can have type/format directly —
            // wrap in schema for OpenAPI 3.x.
            // collectionFormat is handled separately below.
            continue;
        }
        result[key] = value;
    }

    // Build schema from type/format
    if (typeof param.type === "string") {
        const schema: Record<string, unknown> = { type: param.type };
        if (typeof param.format === "string") {
            schema.format = param.format;
        }
        // Copy schema-level keywords
        if (param.enum !== undefined) schema.enum = param.enum;
        if (param.default !== undefined) schema.default = param.default;
        if (param.minimum !== undefined) schema.minimum = param.minimum;
        if (param.maximum !== undefined) schema.maximum = param.maximum;
        result.schema = schema;
    }

    // collectionFormat → style + explode (OpenAPI 3.x)
    const cf = param.collectionFormat;
    if (typeof cf === "string") {
        switch (cf) {
            case "csv":
                result.style = "form";
                result.explode = false;
                break;
            case "ssv":
                result.style = "spaceDelimited";
                result.explode = false;
                break;
            case "tsv":
                result.style = "tabDelimited";
                result.explode = false;
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
 */
function buildRequestBody(
    bodyParam: Record<string, unknown>,
    consumes: unknown[]
): Record<string, unknown> {
    const schema = bodyParam.schema;
    const content: Record<string, unknown> = {};

    // Use consumes content types, falling back to application/json
    const contentTypes = consumes.length > 0 ? consumes : ["application/json"];
    for (const ct of contentTypes) {
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
 */
function resolveSwaggerResponse(
    response: Record<string, unknown>,
    doc: Record<string, unknown>,
    visited: Set<string> = new Set<string>()
): Record<string, unknown> {
    const ref = response.$ref;
    if (typeof ref !== "string" || !ref.startsWith("#/responses/")) {
        return response;
    }

    // Cycle detection
    if (visited.has(ref)) return response;
    const nextVisited = new Set(visited);
    nextVisited.add(ref);

    const name = ref.slice("#/responses/".length);
    const globalResponses = doc.responses;
    if (isObject(globalResponses)) {
        const resolved = globalResponses[name];
        if (isObject(resolved)) {
            // Recursively resolve if the target is also a $ref
            if (typeof resolved.$ref === "string") {
                return resolveSwaggerResponse(resolved, doc, nextVisited);
            }
            return resolved;
        }
    }

    return response;
}

function normaliseSwaggerResponses(
    responses: Record<string, unknown>,
    doc: Record<string, unknown>,
    produces: unknown[]
): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [code, response] of Object.entries(responses)) {
        if (!isObject(response)) {
            result[code] = response;
            continue;
        }

        // Resolve $ref to #/responses/Name
        const resolved = resolveSwaggerResponse(response, doc);

        const normalised: Record<string, unknown> = {};

        // Copy non-schema fields
        for (const [key, value] of Object.entries(resolved)) {
            if (key !== "schema") {
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
        }

        result[code] = normalised;
    }

    return result;
}

// ---------------------------------------------------------------------------
// $ref rewriting
// ---------------------------------------------------------------------------

/**
 * Mapping of Swagger 2.0 $ref prefixes to OpenAPI 3.x equivalents.
 * Applied after document restructuring so all $ref strings point
 * to the correct locations in the normalised document.
 */
const REF_REWRITES: readonly [string, string][] = [
    ["#/definitions/", "#/components/schemas/"],
    ["#/parameters/", "#/components/parameters/"],
    ["#/responses/", "#/components/responses/"],
];

/**
 * Deep-rewrite $ref strings in a normalised Swagger 2.0 document
 * from Swagger 2.0 locations to OpenAPI 3.x locations.
 * Mutates the object in place \u2014 called only on the fresh clone
 * produced by normaliseSwagger2Document.
 */
function rewriteSwaggerRefs(node: unknown): void {
    if (!isObject(node)) return;

    if (typeof node.$ref === "string") {
        for (const [from, to] of REF_REWRITES) {
            if (node.$ref.startsWith(from)) {
                node.$ref = to + node.$ref.slice(from.length);
                break;
            }
        }
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
// Swagger 2.0 feature detection helpers
// ---------------------------------------------------------------------------

/**
 * Check if any schema in a definitions block contains an `xml` property.
 */
function hasXmlInSchemas(definitions: Record<string, unknown>): boolean {
    for (const schema of Object.values(definitions)) {
        if (isObject(schema) && "xml" in schema) return true;
    }
    return false;
}
