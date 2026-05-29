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

/** Base properties shared by every field variant. */
interface BuilderFieldBase {
    readonly id: string;
    readonly name: string;
    readonly required: boolean;
    readonly description: string;
}

/**
 * A single field in the builder — discriminated by `.type`.
 *
 * The union structure means switching on `field.type` narrows
 * `field.constraints` to the matching constraint type, eliminating the
 * need for type assertions.
 */
export type BuilderField =
    | (BuilderFieldBase & {
          readonly type: "string";
          readonly constraints: StringConstraints;
      })
    | (BuilderFieldBase & {
          readonly type: "number";
          readonly constraints: NumberConstraints;
      })
    | (BuilderFieldBase & {
          readonly type: "integer";
          readonly constraints: NumberConstraints;
      })
    | (BuilderFieldBase & {
          readonly type: "boolean";
          readonly constraints: Record<string, never>;
      })
    | (BuilderFieldBase & {
          readonly type: "enum";
          readonly constraints: EnumConstraints;
      });

/** Callback that produces the next field from the current one. */
export type FieldUpdater = (field: BuilderField) => BuilderField;

/** Accepts an updater function to transform a field. */
export type OnFieldChange = (updater: FieldUpdater) => void;

/** Top-level builder schema. */
export interface BuilderSchema {
    readonly title: string;
    readonly fields: readonly BuilderField[];
}

/** The JSON Schema object produced by the builder. */
export type JsonSchemaObject = Readonly<Record<string, unknown>>;
