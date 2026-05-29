/**
 * Convert a BuilderSchema to a JSON Schema Draft 2020-12 object.
 */
import type {
    BuilderField,
    BuilderSchema,
    EnumConstraints,
    FieldConstraints,
    FieldMeta,
    FieldType,
    JsonSchemaObject,
    NumberConstraints,
    StringConstraints,
    ArrayConstraints,
    ObjectConstraints,
    RecordConstraints,
    LiteralConstraints,
    FileConstraints,
} from "./types.ts";

function applyMeta(base: Record<string, unknown>, meta: FieldMeta): void {
    if (meta.title !== undefined && meta.title !== "") base.title = meta.title;
    if (meta.readOnly === true) base.readOnly = true;
    if (meta.writeOnly === true) base.writeOnly = true;
    if (meta.deprecated === true) base.deprecated = true;
    if (meta.component !== undefined && meta.component !== "") {
        base["x-component"] = meta.component;
    }
    if (meta.order !== undefined) base["x-order"] = meta.order;

    if (meta.defaultRaw !== undefined && meta.defaultRaw.trim() !== "") {
        try {
            base.default = JSON.parse(meta.defaultRaw);
        } catch {
            // Malformed JSON — skip the default.
        }
    }

    if (meta.examplesRaw !== undefined && meta.examplesRaw.trim() !== "") {
        const examples = meta.examplesRaw
            .split(",")
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
        if (examples.length > 0) base.examples = examples;
    }
}

function fieldToJsonSchema(field: BuilderField): JsonSchemaObject {
    const base: Record<string, unknown> = {};

    if (field.description !== "") {
        base.description = field.description;
    }

    applyMeta(base, field.meta);

    switch (field.type) {
        case "string": {
            base.type = "string";
            const c: StringConstraints = field.constraints;
            if (c.minLength !== undefined) base.minLength = c.minLength;
            if (c.maxLength !== undefined) base.maxLength = c.maxLength;
            if (c.pattern !== undefined) base.pattern = c.pattern;
            if (c.format !== undefined) base.format = c.format;
            if (c.contentEncoding !== undefined)
                base.contentEncoding = c.contentEncoding;
            if (c.contentMediaType !== undefined)
                base.contentMediaType = c.contentMediaType;
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
            const c: EnumConstraints = field.constraints;
            const allNumeric = c.values.every((v) => !Number.isNaN(Number(v)));
            base.type = allNumeric ? "number" : "string";
            base.enum = allNumeric
                ? c.values.map((v) => Number(v))
                : [...c.values];
            break;
        }
        case "object": {
            base.type = "object";
            const c: ObjectConstraints = field.constraints;
            if (c.minProperties !== undefined)
                base.minProperties = c.minProperties;
            if (c.maxProperties !== undefined)
                base.maxProperties = c.maxProperties;

            const properties: Record<string, unknown> = {};
            const required: string[] = [];
            for (const child of field.children) {
                properties[child.name] = fieldToJsonSchema(child);
                if (child.required) required.push(child.name);
            }
            if (Object.keys(properties).length > 0)
                base.properties = properties;
            if (required.length > 0) base.required = required;
            break;
        }
        case "array": {
            base.type = "array";
            const c: ArrayConstraints = field.constraints;
            if (c.minItems !== undefined) base.minItems = c.minItems;
            if (c.maxItems !== undefined) base.maxItems = c.maxItems;
            if (c.uniqueItems === true) base.uniqueItems = true;
            base.items = fieldToJsonSchema(field.itemField);
            break;
        }
        case "record": {
            base.type = "object";
            const c: RecordConstraints = field.constraints;
            base.additionalProperties = fieldToJsonSchema(field.valueField);
            if (
                c.propertyNamesPattern !== undefined &&
                c.propertyNamesPattern !== ""
            ) {
                base.propertyNames = { pattern: c.propertyNamesPattern };
            }
            break;
        }
        case "tuple": {
            base.type = "array";
            base.prefixItems = field.prefixItems.map(fieldToJsonSchema);
            if (field.closed) base.items = false;
            break;
        }
        case "literal": {
            const c: LiteralConstraints = field.constraints;
            try {
                base.const = JSON.parse(c.valueRaw);
            } catch {
                base.const = c.valueRaw;
            }
            break;
        }
        case "null":
            base.type = "null";
            break;
        case "file":
            base.type = "string";
            base.contentEncoding = "base64";
            {
                const c: FileConstraints = field.constraints;
                if (
                    c.contentMediaType !== undefined &&
                    c.contentMediaType !== ""
                ) {
                    base.contentMediaType = c.contentMediaType;
                }
            }
            break;
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
    if (c.multipleOf !== undefined) base.multipleOf = c.multipleOf;
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
 */
export function defaultConstraints(type: FieldType): FieldConstraints;
export function defaultConstraints(type: "string"): StringConstraints;
export function defaultConstraints(
    type: "number" | "integer"
): NumberConstraints;
export function defaultConstraints(
    type: "boolean" | "tuple" | "null"
): Record<string, never>;
export function defaultConstraints(type: "enum"): EnumConstraints;
export function defaultConstraints(type: "object"): ObjectConstraints;
export function defaultConstraints(type: "array"): ArrayConstraints;
export function defaultConstraints(type: "record"): RecordConstraints;
export function defaultConstraints(type: "literal"): LiteralConstraints;
export function defaultConstraints(type: "file"): FileConstraints;
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
        case "object":
            return {};
        case "array":
            return {};
        case "record":
            return {};
        case "tuple":
            return {};
        case "literal":
            return { valueRaw: '"value"' };
        case "null":
            return {};
        case "file":
            return {};
    }
}

/** Default FieldMeta — all fields absent. */
export const emptyMeta: FieldMeta = {};
