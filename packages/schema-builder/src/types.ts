/**
 * State model for the schema builder.
 */

/** Primitive field types supported by the builder. */
export type FieldType = "string" | "number" | "integer" | "boolean" | "enum";

/** Type-specific constraints for string fields. */
export interface StringConstraints {
    readonly minLength?: number;
    readonly maxLength?: number;
    readonly pattern?: string;
    readonly format?: string;
}

/** Type-specific constraints for number/integer fields. */
export interface NumberConstraints {
    readonly minimum?: number;
    readonly maximum?: number;
    readonly exclusiveMinimum?: number;
    readonly exclusiveMaximum?: number;
}

/** Type-specific constraints for enum fields. */
export interface EnumConstraints {
    readonly values: readonly string[];
}

/** Union of all per-type constraint shapes. */
export type FieldConstraints =
    | StringConstraints
    | NumberConstraints
    | EnumConstraints
    | Record<string, never>;

/** A single field in the builder. */
export interface BuilderField {
    readonly id: string;
    readonly name: string;
    readonly type: FieldType;
    readonly required: boolean;
    readonly description: string;
    readonly constraints: FieldConstraints;
}

/** Top-level builder schema. */
export interface BuilderSchema {
    readonly title: string;
    readonly fields: readonly BuilderField[];
}

/** The JSON Schema object produced by the builder. */
export type JsonSchemaObject = Readonly<Record<string, unknown>>;
