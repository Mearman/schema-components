/**
 * OpenAPI 3.0.x schema normalisation.
 *
 * Transforms `nullable`, `discriminator`, `example` keywords, and walks
 * all schema locations (components, paths, parameters, request bodies,
 * responses) to apply normalisation.
 */

import { isObject } from "../core/guards.ts";
import type { NodeTransform } from "./normalise.ts";

// ---------------------------------------------------------------------------
// Re-exported node transforms (used by normalise.ts entry points)
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
export function normaliseOpenApi30Node(
    node: Record<string, unknown>
): Record<string, unknown> {
    // Normalise example → examples (OpenAPI 3.0 uses singular, 3.1 uses array)
    if ("example" in node && !("examples" in node)) {
        node.examples = [node.example];
        delete node.example;
    } else if ("example" in node) {
        delete node.example;
    }

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
// Discriminator normalisation
// ---------------------------------------------------------------------------

/**
 * Normalise OpenAPI 3.0.x `discriminator` keyword by injecting `const`
 * values into each `oneOf`/`anyOf` option's discriminator property.
 *
 * In OpenAPI 3.0, `discriminator` is a sibling of `oneOf`/`anyOf`:
 *   discriminator: { propertyName: "type" }
 * The walker detects discriminated unions from `oneOf` + `const` on a
 * property, so this normaliser injects the `const` values from the
 * `mapping` or infers them from `$ref` fragment names.
 */
export function normaliseOpenApi30Discriminator(
    node: Record<string, unknown>
): Record<string, unknown> {
    const discriminator = node.discriminator;
    if (!isObject(discriminator)) return node;

    const propertyName = discriminator.propertyName;
    if (typeof propertyName !== "string") return node;

    const mapping = isObject(discriminator.mapping)
        ? discriminator.mapping
        : undefined;

    const composite = node.oneOf ?? node.anyOf;
    if (!Array.isArray(composite)) return node;

    // Build reverse mapping: $ref → const value
    const refToValue = new Map<string, string>();
    if (mapping !== undefined) {
        for (const [value, ref] of Object.entries(mapping)) {
            if (typeof ref === "string") {
                refToValue.set(ref, value);
            }
        }
    }

    // Inject const into each option that doesn't already have it
    const normalisedComposite: unknown[] = [];
    for (const option of composite) {
        if (!isObject(option)) {
            normalisedComposite.push(option);
            continue;
        }

        const props = isObject(option.properties)
            ? { ...option.properties }
            : undefined;
        const discProp = props?.[propertyName];

        // If the discriminator property already has const, leave as-is
        if (isObject(discProp) && "const" in discProp) {
            normalisedComposite.push(option);
            continue;
        }

        // Determine the const value
        let constValue: string | undefined;
        if (isObject(discProp) && typeof discProp.$ref === "string") {
            constValue = refToValue.get(discProp.$ref);
        }
        if (constValue === undefined && typeof option.$ref === "string") {
            constValue = refToValue.get(option.$ref);
            // Fallback: derive from $ref fragment name
            if (constValue === undefined) {
                const fragment = option.$ref.split("/").pop();
                if (fragment !== undefined) constValue = fragment;
            }
        }
        // Inline option with mapping: reverse-lookup by matching option index
        // to mapping entries in order
        if (constValue === undefined && mapping !== undefined) {
            const optionIndex = composite.indexOf(option);
            const mappingEntries = Object.entries(mapping);
            const entry =
                optionIndex >= 0 && optionIndex < mappingEntries.length
                    ? mappingEntries[optionIndex]
                    : undefined;
            if (entry !== undefined) {
                constValue = entry[0];
            }
        }

        if (constValue !== undefined) {
            const normalisedProps = props ?? {};
            normalisedProps[propertyName] = {
                ...(isObject(discProp) ? discProp : {}),
                const: constValue,
            };
            normalisedComposite.push({
                ...option,
                properties: normalisedProps,
            });
        } else {
            normalisedComposite.push(option);
        }
    }

    // Update the composite array in-place
    if ("oneOf" in node) {
        node.oneOf = normalisedComposite;
    } else if ("anyOf" in node) {
        node.anyOf = normalisedComposite;
    }

    // Remove discriminator — no longer needed after const injection
    delete node.discriminator;
    return node;
}

// ---------------------------------------------------------------------------
// Combined transform
// ---------------------------------------------------------------------------

/**
 * Combined OpenAPI 3.0.x node transform: nullable + discriminator.
 * Applied to every schema node in an OpenAPI 3.0 document.
 */
export function normaliseOpenApi30Combined(
    node: Record<string, unknown>
): Record<string, unknown> {
    return normaliseOpenApi30Discriminator(normaliseOpenApi30Node(node));
}

// ---------------------------------------------------------------------------
// Deep document normalisation
// ---------------------------------------------------------------------------

/**
 * Deep-normalise all schemas in an OpenAPI 3.0.x document.
 * Walks components/schemas, path operations, parameters, request bodies,
 * and responses — applying `nullable` normalisation to each schema.
 */
export function deepNormaliseOpenApi30Doc(
    doc: Record<string, unknown>,
    deepNormalise: (
        schema: Record<string, unknown>,
        transform: NodeTransform
    ) => Record<string, unknown>
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
                    ? deepNormalise(schema, normaliseOpenApi30Combined)
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
                ? normalisePathItem(pathItem, deepNormalise)
                : pathItem;
        }
        result.paths = normalisedPaths;
    }

    return result;
}

// ---------------------------------------------------------------------------
// Path / operation / parameter normalisation
// ---------------------------------------------------------------------------

function normalisePathItem(
    pathItem: Record<string, unknown>,
    deepNormalise: (
        schema: Record<string, unknown>,
        transform: NodeTransform
    ) => Record<string, unknown>
): Record<string, unknown> {
    const result: Record<string, unknown> = { ...pathItem };
    const METHODS = ["get", "post", "put", "patch", "delete"] as const;

    for (const method of METHODS) {
        const operation = pathItem[method];
        if (!isObject(operation)) continue;

        result[method] = normaliseOperation(operation, deepNormalise);
    }

    // Path-level parameters
    const parameters = pathItem.parameters;
    if (Array.isArray(parameters)) {
        result.parameters = parameters.map((param: unknown) =>
            isObject(param) ? normaliseParameter(param, deepNormalise) : param
        );
    }

    return result;
}

function normaliseOperation(
    operation: Record<string, unknown>,
    deepNormalise: (
        schema: Record<string, unknown>,
        transform: NodeTransform
    ) => Record<string, unknown>
): Record<string, unknown> {
    const result: Record<string, unknown> = { ...operation };

    // Parameters
    const parameters = operation.parameters;
    if (Array.isArray(parameters)) {
        result.parameters = parameters.map((param: unknown) =>
            isObject(param) ? normaliseParameter(param, deepNormalise) : param
        );
    }

    // Request body
    const requestBody = operation.requestBody;
    if (isObject(requestBody)) {
        result.requestBody = normaliseRequestBody(requestBody, deepNormalise);
    }

    // Responses
    const responses = operation.responses;
    if (isObject(responses)) {
        const normalisedResponses: Record<string, unknown> = {};
        for (const [code, response] of Object.entries(responses)) {
            normalisedResponses[code] = isObject(response)
                ? normaliseResponse(response, deepNormalise)
                : response;
        }
        result.responses = normalisedResponses;
    }

    return result;
}

function normaliseParameter(
    param: Record<string, unknown>,
    deepNormalise: (
        schema: Record<string, unknown>,
        transform: NodeTransform
    ) => Record<string, unknown>
): Record<string, unknown> {
    const result: Record<string, unknown> = { ...param };
    const schema = param.schema;
    if (isObject(schema)) {
        result.schema = deepNormalise(schema, normaliseOpenApi30Combined);
    }
    // Normalise example → examples on the parameter itself
    if ("example" in result && !("examples" in result)) {
        result.examples = [result.example];
        delete result.example;
    } else if ("example" in result) {
        delete result.example;
    }
    return result;
}

function normaliseRequestBody(
    requestBody: Record<string, unknown>,
    deepNormalise: (
        schema: Record<string, unknown>,
        transform: NodeTransform
    ) => Record<string, unknown>
): Record<string, unknown> {
    const result: Record<string, unknown> = { ...requestBody };
    const content = requestBody.content;
    if (isObject(content)) {
        result.content = normaliseContentMap(content, deepNormalise);
    }
    return result;
}

function normaliseResponse(
    response: Record<string, unknown>,
    deepNormalise: (
        schema: Record<string, unknown>,
        transform: NodeTransform
    ) => Record<string, unknown>
): Record<string, unknown> {
    const result: Record<string, unknown> = { ...response };
    const content = response.content;
    if (isObject(content)) {
        result.content = normaliseContentMap(content, deepNormalise);
    }
    return result;
}

function normaliseContentMap(
    content: Record<string, unknown>,
    deepNormalise: (
        schema: Record<string, unknown>,
        transform: NodeTransform
    ) => Record<string, unknown>
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
            normalised.schema = deepNormalise(
                schema,
                normaliseOpenApi30Combined
            );
        }
        // Normalise example → examples on the media type object
        if ("example" in normalised && !("examples" in normalised)) {
            normalised.examples = { value: normalised.example };
            delete normalised.example;
        } else if ("example" in normalised) {
            delete normalised.example;
        }
        result[mediaType] = normalised;
    }
    return result;
}
