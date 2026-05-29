/**
 * Convert a BuilderSchema to a JSON Schema Draft 2020-12 object.
 */
import type {
    BuilderField,
    BuilderSchema,
    EnumConstraints,
    FieldConstraints,
    FieldType,
    JsonSchemaObject,
    NumberConstraints,
    StringConstraints,
} from "./types.ts";

function fieldToJsonSchema(field: BuilderField): JsonSchemaObject {
    const base: Record<string, unknown> = {};

    if (field.description !== "") {
        base.description = field.description;
    }

    switch (field.type) {
        case "string": {
            base.type = "string";
            const c = field.constraints;
            if (c.minLength !== undefined) base.minLength = c.minLength;
            if (c.maxLength !== undefined) base.maxLength = c.maxLength;
            if (c.pattern !== undefined) base.pattern = c.pattern;
            if (c.format !== undefined) base.format = c.format;
            break;
        }
        case "number": {
            base.type = "number";
            applyNumberConstraints(base, field.constraints);
            break;
        }
        case "integer": {
            base.type = "integer";
            applyNumberConstraints(base, field.constraints);
            break;
        }
        case "boolean":
            base.type = "boolean";
            break;
        case "enum": {
            const c = field.constraints;
            const allNumeric = c.values.every((v) => !Number.isNaN(Number(v)));
            base.type = allNumeric ? "number" : "string";
            base.enum = allNumeric
                ? c.values.map((v) => Number(v))
                : [...c.values];
            break;
        }
    }

    return base;
}

function applyNumberConstraints(
    base: Record<string, unknown>,
    c: NumberConstraints
): void {
    if (c.minimum !== undefined) base.minimum = c.minimum;
    if (c.maximum !== undefined) base.maximum = c.maximum;
    if (c.exclusiveMinimum !== undefined)
        base.exclusiveMinimum = c.exclusiveMinimum;
    if (c.exclusiveMaximum !== undefined)
        base.exclusiveMaximum = c.exclusiveMaximum;
}

/**
 * Convert a BuilderSchema to a JSON Schema Draft 2020-12 object.
 */
export function toJsonSchema(schema: BuilderSchema): JsonSchemaObject {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const field of schema.fields) {
        properties[field.name] = fieldToJsonSchema(field);
        if (field.required) {
            required.push(field.name);
        }
    }

    const result: Record<string, unknown> = {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties,
    };

    if (schema.title !== "") {
        result.title = schema.title;
    }

    if (required.length > 0) {
        result.required = required;
    }

    return result;
}

/**
 * Default constraints for each field type.
 *
 * Returns a constraint object whose shape matches the specific field type,
 * enabling the discriminated-union narrowing on `BuilderField`.
 */
export function defaultConstraints(type: FieldType): FieldConstraints;
export function defaultConstraints(type: "string"): StringConstraints;
export function defaultConstraints(
    type: "number" | "integer"
): NumberConstraints;
export function defaultConstraints(type: "boolean"): Record<string, never>;
export function defaultConstraints(type: "enum"): EnumConstraints;
export function defaultConstraints(type: FieldType): FieldConstraints {
    switch (type) {
        case "string":
            return {};
        case "number":
        case "integer":
            return {};
        case "boolean":
            return {};
        case "enum":
            return { values: ["option1"] };
    }
}
