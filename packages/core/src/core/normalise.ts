/**
 * Schema normalisation — transforms version-specific JSON Schema and
 * OpenAPI constructs into the canonical Draft 2020-12 format the walker
 * understands.
 *
 * Each normaliser deep-clones the input (no mutation) and recursively
 * walks all sub-schemas to apply per-node transformations.
 *
 * Supported transformations:
 * - Draft 04: `exclusiveMinimum`/`exclusiveMaximum` boolean → number
 * - Draft 2019-09: `$recursiveRef` → `$ref`
 * - OpenAPI 3.0.x: `nullable` → `anyOf [T, null]`
 * - Swagger 2.0: full document restructure to OpenAPI 3.1
 */

import type { JsonSchemaDraft, OpenApiVersionInfo } from "./version.ts";
import { isOpenApi30, isSwagger2 } from "./version.ts";
import { isObject } from "./guards.ts";

// ---------------------------------------------------------------------------
// Sub-schema location keys
// ---------------------------------------------------------------------------

/**
 * Keys whose values are `Record<string, SubSchema>` — objects where each
 * property is a sub-schema.
 */
const OBJECT_SUBSCHEMA_KEYS: ReadonlySet<string> = new Set([
    "properties",
    "patternProperties",
    "$defs",
    "definitions",
    "dependentSchemas",
]);

/**
 * Keys whose values are `SubSchema[]` — arrays of sub-schemas.
 */
const ARRAY_SUBSCHEMA_KEYS: ReadonlySet<string> = new Set([
    "allOf",
    "anyOf",
    "oneOf",
    "prefixItems",
]);

/**
 * Keys whose values are a single sub-schema object.
 */
const SINGLE_SUBSCHEMA_KEYS: ReadonlySet<string> = new Set([
    "additionalProperties",
    "not",
    "contains",
    "propertyNames",
    "if",
    "then",
    "else",
    "unevaluatedProperties",
    "unevaluatedItems",
]);

// ---------------------------------------------------------------------------
// Recursive normalisation engine
// ---------------------------------------------------------------------------

type NodeTransform = (node: Record<string, unknown>) => Record<string, unknown>;

/**
 * Normalise each element of an unknown array by applying deepNormalise
 * to object elements and passing others through unchanged.
 */
function normaliseArray(items: unknown[], transform: NodeTransform): unknown[] {
    const result: unknown[] = [];
    for (const item of items) {
        result.push(isObject(item) ? deepNormalise(item, transform) : item);
    }
    return result;
}

/**
 * Normalise each value of a sub-schema map (e.g. properties, $defs).
 */
function normaliseSubSchemaMap(
    map: Record<string, unknown>,
    transform: NodeTransform
): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(map)) {
        result[k] = isObject(v) ? deepNormalise(v, transform) : v;
    }
    return result;
}

/**
 * Deep-normalise a JSON Schema object by applying a per-node transform
 * and recursing into every sub-schema location.
 */
function deepNormalise(
    schema: Record<string, unknown>,
    transform: NodeTransform
): Record<string, unknown> {
    // Apply the per-node transform first
    const node = transform({ ...schema });

    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(node)) {
        // Record<string, SubSchema>
        if (isObject(value) && OBJECT_SUBSCHEMA_KEYS.has(key)) {
            result[key] = normaliseSubSchemaMap(value, transform);
        }
        // SubSchema[]
        else if (Array.isArray(value) && ARRAY_SUBSCHEMA_KEYS.has(key)) {
            result[key] = normaliseArray(value, transform);
        }
        // Single SubSchema
        else if (isObject(value) && SINGLE_SUBSCHEMA_KEYS.has(key)) {
            result[key] = deepNormalise(value, transform);
        }
        // items: can be a single sub-schema OR an array (Draft 04 tuples)
        else if (key === "items") {
            if (Array.isArray(value)) {
                result[key] = normaliseArray(value, transform);
            } else if (isObject(value)) {
                result[key] = deepNormalise(value, transform);
            } else {
                result[key] = value;
            }
        }
        // Non-schema values: pass through
        else {
            result[key] = value;
        }
    }

    return result;
}

// ---------------------------------------------------------------------------
// Draft 04: exclusiveMinimum/exclusiveMaximum boolean → number
// ---------------------------------------------------------------------------

/**
 * Normalise Draft 04 `exclusiveMinimum`/`exclusiveMaximum` from boolean
 * to number form.
 *
 * In Draft 04:
 * - `exclusiveMinimum: true` + `minimum: 5` → value must be > 5
 * - `exclusiveMinimum: false` (or absent) + `minimum: 5` → value must be >= 5
 *
 * In Draft 06+:
 * - `exclusiveMinimum: 5` → value must be > 5 (no separate `minimum`)
 * - `minimum: 5` → value must be >= 5
 *
 * The transform converts boolean form to number form so the walker can
 * treat `exclusiveMinimum`/`exclusiveMaximum` uniformly as numbers.
 */
function normaliseDraft04Node(
    node: Record<string, unknown>
): Record<string, unknown> {
    // exclusiveMinimum: true + minimum: N → exclusiveMinimum: N
    if (node.exclusiveMinimum === true && typeof node.minimum === "number") {
        node.exclusiveMinimum = node.minimum;
        delete node.minimum;
    }
    // exclusiveMinimum: false → remove (it's the default)
    else if (node.exclusiveMinimum === false) {
        delete node.exclusiveMinimum;
    }

    // exclusiveMaximum: true + maximum: N → exclusiveMaximum: N
    if (node.exclusiveMaximum === true && typeof node.maximum === "number") {
        node.exclusiveMaximum = node.maximum;
        delete node.maximum;
    }
    // exclusiveMaximum: false → remove (it's the default)
    else if (node.exclusiveMaximum === false) {
        delete node.exclusiveMaximum;
    }

    return node;
}

// ---------------------------------------------------------------------------
// Draft 2019-09: $recursiveRef → $ref
// ---------------------------------------------------------------------------

/**
 * Normalise Draft 2019-09 `$recursiveRef` to `$ref: "#"`.
 *
 * `$recursiveRef` resolves to the nearest `$recursiveAnchor` in the
 * dynamic scope. For our use case (rendering), the common pattern is a
 * recursive schema with `$recursiveAnchor: true` at the root. Replacing
 * `$recursiveRef: "#"` with `$ref: "#"` produces the correct result when
 * the root document is the schema itself.
 *
 * Limitation: nested `$recursiveAnchor` within `$defs` that should resolve
 * to their own subtree is not supported. This is rare in practice.
 */
function normaliseDraft201909Node(
    node: Record<string, unknown>
): Record<string, unknown> {
    if (typeof node.$recursiveRef === "string") {
        node.$ref = node.$recursiveRef;
        delete node.$recursiveRef;
    }
    // $recursiveAnchor is consumed and not needed after normalisation
    if ("$recursiveAnchor" in node) {
        delete node.$recursiveAnchor;
    }
    return node;
}

// ---------------------------------------------------------------------------
// OpenAPI 3.0.x: nullable → anyOf [T, null]
// ---------------------------------------------------------------------------

/**
 * Normalise OpenAPI 3.0.x `nullable` keyword to `anyOf [T, null]`.
 *
 * OpenAPI 3.0 uses `nullable: true` instead of the JSON Schema standard
 * `anyOf: [T, { type: "null" }]`. The walker understands the latter form
 * natively, so this normaliser converts `nullable` to `anyOf`.
 *
 * Only applied when `nullable` is explicitly `true`. `nullable: false` or
 * absent is the default and requires no transformation.
 */
function normaliseOpenApi30Node(
    node: Record<string, unknown>
): Record<string, unknown> {
    if (node.nullable !== true) {
        // nullable: false or absent — just strip the keyword if present
        if ("nullable" in node) {
            delete node.nullable;
        }
        return node;
    }

    // nullable: true — transform to anyOf [T, null]
    const nullOption: Record<string, unknown> = { type: "null" };

    // If the node already has anyOf, append null option
    if (Array.isArray(node.anyOf)) {
        const existing: unknown[] = node.anyOf;
        node.anyOf = [...existing, nullOption];
        delete node.nullable;
        return node;
    }

    // If the node already has oneOf, convert to anyOf and append null
    if (Array.isArray(node.oneOf)) {
        const existing: unknown[] = node.oneOf;
        node.anyOf = [...existing, nullOption];
        delete node.oneOf;
        delete node.nullable;
        return node;
    }

    // If the node already has allOf, wrap merged result with null
    if (Array.isArray(node.allOf)) {
        const existing: unknown[] = node.allOf;
        node.anyOf = [{ allOf: existing }, nullOption];
        delete node.allOf;
        delete node.nullable;
        return node;
    }

    // Simple case: wrap current node in anyOf [self, null]
    // Build wrapper with all current properties except nullable
    const wrapper: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
        if (key !== "nullable") {
            wrapper[key] = value;
        }
    }

    // Return a new node with only anyOf — discards all previous keys
    return { anyOf: [wrapper, nullOption] };
}

// ---------------------------------------------------------------------------
// JSON Schema normalisation entry point
// ---------------------------------------------------------------------------

/**
 * Normalise a JSON Schema to canonical Draft 2020-12 form.
 * Deep-clones the input — the original is never mutated.
 */
export function normaliseJsonSchema(
    schema: Record<string, unknown>,
    draft: JsonSchemaDraft
): Record<string, unknown> {
    switch (draft) {
        case "draft-04":
            return deepNormalise(schema, normaliseDraft04Node);
        case "draft-2019-09":
            return deepNormalise(schema, normaliseDraft201909Node);
        // Draft 06, 07, and 2020-12 are already compatible with the walker
        case "draft-06":
        case "draft-07":
        case "draft-2020-12":
            return schema;
    }
}

// ---------------------------------------------------------------------------
// OpenAPI normalisation
// ---------------------------------------------------------------------------

/**
 * Normalise an OpenAPI document's schemas for walker consumption.
 * Handles version-specific keyword transformations.
 *
 * Returns the same object reference if no normalisation is needed
 * (OpenAPI 3.1.x), or a deep-cloned normalised copy otherwise.
 */
export function normaliseOpenApiSchemas(
    doc: Record<string, unknown>,
    version: OpenApiVersionInfo
): Record<string, unknown> {
    if (isSwagger2(version)) {
        return normaliseSwagger2Document(doc);
    }

    if (isOpenApi30(version)) {
        return deepNormaliseOpenApi30Doc(doc);
    }

    // OpenAPI 3.1.x — already Draft 2020-12 compatible
    return doc;
}

/**
 * Deep-normalise all schemas in an OpenAPI 3.0.x document.
 * Walks components/schemas, path operations, parameters, request bodies,
 * and responses — applying `nullable` normalisation to each schema.
 */
function deepNormaliseOpenApi30Doc(
    doc: Record<string, unknown>
): Record<string, unknown> {
    const result: Record<string, unknown> = { ...doc };

    // Normalise components/schemas
    const components = doc.components;
    if (isObject(components)) {
        const schemas = components.schemas;
        if (isObject(schemas)) {
            const normalisedSchemas: Record<string, unknown> = {};
            for (const [name, schema] of Object.entries(schemas)) {
                normalisedSchemas[name] = isObject(schema)
                    ? deepNormalise(schema, normaliseOpenApi30Node)
                    : schema;
            }
            result.components = {
                ...components,
                schemas: normalisedSchemas,
            };
        }
    }

    // Normalise schemas in paths
    const paths = doc.paths;
    if (isObject(paths)) {
        const normalisedPaths: Record<string, unknown> = {};
        for (const [path, pathItem] of Object.entries(paths)) {
            normalisedPaths[path] = isObject(pathItem)
                ? normalisePathItem(pathItem)
                : pathItem;
        }
        result.paths = normalisedPaths;
    }

    return result;
}

/**
 * Normalise all schemas within a path item object.
 */
function normalisePathItem(
    pathItem: Record<string, unknown>
): Record<string, unknown> {
    const result: Record<string, unknown> = { ...pathItem };
    const METHODS = ["get", "post", "put", "patch", "delete"] as const;

    for (const method of METHODS) {
        const operation = pathItem[method];
        if (!isObject(operation)) continue;

        result[method] = normaliseOperation(operation);
    }

    // Path-level parameters
    const parameters = pathItem.parameters;
    if (Array.isArray(parameters)) {
        result.parameters = parameters.map((param: unknown) =>
            isObject(param) ? normaliseParameter(param) : param
        );
    }

    return result;
}

/**
 * Normalise all schemas within an operation object.
 */
function normaliseOperation(
    operation: Record<string, unknown>
): Record<string, unknown> {
    const result: Record<string, unknown> = { ...operation };

    // Parameters
    const parameters = operation.parameters;
    if (Array.isArray(parameters)) {
        result.parameters = parameters.map((param: unknown) =>
            isObject(param) ? normaliseParameter(param) : param
        );
    }

    // Request body
    const requestBody = operation.requestBody;
    if (isObject(requestBody)) {
        result.requestBody = normaliseRequestBody(requestBody);
    }

    // Responses
    const responses = operation.responses;
    if (isObject(responses)) {
        const normalisedResponses: Record<string, unknown> = {};
        for (const [code, response] of Object.entries(responses)) {
            normalisedResponses[code] = isObject(response)
                ? normaliseResponse(response)
                : response;
        }
        result.responses = normalisedResponses;
    }

    return result;
}

/**
 * Normalise the schema within a parameter object.
 */
function normaliseParameter(
    param: Record<string, unknown>
): Record<string, unknown> {
    const result: Record<string, unknown> = { ...param };
    const schema = param.schema;
    if (isObject(schema)) {
        result.schema = deepNormalise(schema, normaliseOpenApi30Node);
    }
    return result;
}

/**
 * Normalise schemas within a request body object.
 */
function normaliseRequestBody(
    requestBody: Record<string, unknown>
): Record<string, unknown> {
    const result: Record<string, unknown> = { ...requestBody };
    const content = requestBody.content;
    if (isObject(content)) {
        result.content = normaliseContentMap(content);
    }
    return result;
}

/**
 * Normalise schemas within a response object.
 */
function normaliseResponse(
    response: Record<string, unknown>
): Record<string, unknown> {
    const result: Record<string, unknown> = { ...response };
    const content = response.content;
    if (isObject(content)) {
        result.content = normaliseContentMap(content);
    }
    return result;
}

/**
 * Normalise schemas within a media type map (content objects).
 */
function normaliseContentMap(
    content: Record<string, unknown>
): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [mediaType, mediaObj] of Object.entries(content)) {
        if (!isObject(mediaObj)) {
            result[mediaType] = mediaObj;
            continue;
        }
        const normalised: Record<string, unknown> = { ...mediaObj };
        const schema = mediaObj.schema;
        if (isObject(schema)) {
            normalised.schema = deepNormalise(schema, normaliseOpenApi30Node);
        }
        result[mediaType] = normalised;
    }
    return result;
}

// ---------------------------------------------------------------------------
// Swagger 2.0 → OpenAPI 3.1 document normalisation
// ---------------------------------------------------------------------------

/**
 * Transform a Swagger 2.0 document into an OpenAPI 3.1-compatible
 * structure.
 *
 * Key transformations:
 * - `host`, `basePath`, `schemes` → `servers`
 * - `definitions` → `components/schemas`
 * - `parameters` (top-level) → `components/parameters`
 * - `responses` (top-level) → `components/responses`
 * - `securityDefinitions` → `components/securitySchemes`
 * - Operation `body`/`formData` params → `requestBody`
 * - Response `schema` → wrapped in `content: { "application/json": { schema } }`
 *
 * Individual schemas within the document are also normalised for
 * Draft 04 semantics (exclusiveMinimum/exclusiveMaximum booleans).
 */
function normaliseSwagger2Document(
    doc: Record<string, unknown>
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
                      normaliseOpenApi30Node(normaliseDraft04Node(node))
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

    return result;
}

/**
 * Normalise all paths and their operations from Swagger 2.0.
 */
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

/**
 * Normalise a single Swagger 2.0 operation to OpenAPI 3.x form.
 */
function normaliseSwaggerOperation(
    operation: Record<string, unknown>,
    doc: Record<string, unknown>
): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    // Copy non-parameter fields
    for (const [key, value] of Object.entries(operation)) {
        if (key !== "parameters" && key !== "responses") {
            result[key] = value;
        }
    }

    // Separate body/formData params from others
    const params = operation.parameters;
    if (Array.isArray(params)) {
        const nonBodyParams: unknown[] = [];
        let bodyParam: Record<string, unknown> | undefined;

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
            result.requestBody = buildRequestBody(bodyParam);
        }
    }

    // Responses: wrap schemas in content
    const responses = operation.responses;
    if (isObject(responses)) {
        result.responses = normaliseSwaggerResponses(responses);
    }

    return result;
}

/**
 * Resolve a Swagger parameter that may be a `$ref`.
 */
function resolveSwaggerParameter(
    param: Record<string, unknown>,
    doc: Record<string, unknown>
): Record<string, unknown> {
    const ref = param.$ref;
    if (typeof ref !== "string" || !ref.startsWith("#/parameters/")) {
        return param;
    }

    const name = ref.slice("#/parameters/".length);
    const globalParams = doc.parameters;
    if (isObject(globalParams)) {
        const resolved = globalParams[name];
        if (isObject(resolved)) return resolved;
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
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(param)) {
        if (key === "type" || key === "format") {
            // Swagger parameters can have type/format directly —
            // wrap in schema for OpenAPI 3.x
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

    // Swagger parameters may also be $ref pointers — resolve them
    if (typeof param.$ref === "string") {
        const resolved = resolveSwaggerParameter(param, doc);
        return normaliseSwaggerParameter(resolved, doc);
    }

    return result;
}

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
        if (typeof p.type === "string") schema.type = p.type;
        if (typeof p.format === "string") schema.format = p.format;
        if (p.enum !== undefined) schema.enum = p.enum;

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
    bodyParam: Record<string, unknown>
): Record<string, unknown> {
    const schema = bodyParam.schema;
    const result: Record<string, unknown> = {
        content: {
            "application/json": isObject(schema) ? { schema } : {},
        },
    };

    if (bodyParam.required === true) {
        result.required = true;
    }
    if (typeof bodyParam.description === "string") {
        result.description = bodyParam.description;
    }

    return result;
}

/**
 * Normalise Swagger 2.0 responses to OpenAPI 3.x format.
 * Wraps `schema` in `content: { "application/json": { schema } }`.
 */
function normaliseSwaggerResponses(
    responses: Record<string, unknown>
): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [code, response] of Object.entries(responses)) {
        if (!isObject(response)) {
            result[code] = response;
            continue;
        }

        const normalised: Record<string, unknown> = {};

        // Copy non-schema fields
        for (const [key, value] of Object.entries(response)) {
            if (key !== "schema") {
                normalised[key] = value;
            }
        }

        // Wrap schema in content
        const schema = response.schema;
        if (isObject(schema)) {
            normalised.content = {
                "application/json": { schema },
            };
        }

        result[code] = normalised;
    }

    return result;
}
