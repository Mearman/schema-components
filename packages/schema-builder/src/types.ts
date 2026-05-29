/**
 * State model for the schema builder.
 */

/** Primitive and composite field types supported by the builder. */
export type FieldType =
    | "string"
    | "number"
    | "integer"
    | "boolean"
    | "enum"
    | "object"
    | "array"
    | "record"
    | "tuple"
    | "literal"
    | "null"
    | "file";

/** Metadata common to every field type, emitted as JSON Schema annotations. */
export interface FieldMeta {
    readonly title?: string;
    readonly readOnly?: boolean;
    readonly writeOnly?: boolean;
    readonly deprecated?: boolean;
    /** JSON-encoded default value string, parsed before emit. */
    readonly defaultRaw?: string;
    /** Comma-separated examples list, split before emit. */
    readonly examplesRaw?: string;
    /** `.meta({ component })` widget hint. */
    readonly component?: string;
    /** Sort order hint. */
    readonly order?: number;
}

/** Type-specific constraints for string fields. */
export interface StringConstraints {
    readonly minLength?: number;
    readonly maxLength?: number;
    readonly pattern?: string;
    readonly format?: string;
    readonly contentEncoding?: string;
    readonly contentMediaType?: string;
}

/** Type-specific constraints for number/integer fields. */
export interface NumberConstraints {
    readonly minimum?: number;
    readonly maximum?: number;
    readonly exclusiveMinimum?: number;
    readonly exclusiveMaximum?: number;
    readonly multipleOf?: number;
}

/** Type-specific constraints for enum fields. */
export interface EnumConstraints {
    readonly values: readonly string[];
}

/** Type-specific constraints for array fields. */
export interface ArrayConstraints {
    readonly minItems?: number;
    readonly maxItems?: number;
    readonly uniqueItems?: boolean;
}

/** Type-specific constraints for object fields. */
export interface ObjectConstraints {
    readonly minProperties?: number;
    readonly maxProperties?: number;
}

/** Type-specific constraints for record fields. */
export interface RecordConstraints {
    /** Regex pattern applied to `propertyNames`. */
    readonly propertyNamesPattern?: string;
}

/** Type-specific constraints for literal fields. */
export interface LiteralConstraints {
    /** The literal value (stored as a JSON-encoded string). */
    readonly valueRaw: string;
}

/** Type-specific constraints for file fields. */
export interface FileConstraints {
    readonly contentMediaType?: string;
}

/** Union of all per-type constraint shapes. */
export type FieldConstraints =
    | StringConstraints
    | NumberConstraints
    | EnumConstraints
    | ArrayConstraints
    | ObjectConstraints
    | RecordConstraints
    | LiteralConstraints
    | FileConstraints
    | Record<string, never>;

/** Base properties shared by every field variant. */
interface BuilderFieldBase {
    readonly id: string;
    readonly name: string;
    readonly required: boolean;
    readonly description: string;
    readonly meta: FieldMeta;
}

/**
 * A single field in the builder — discriminated by `.type`.
 *
 * Switching on `field.type` narrows `field.constraints` to the matching
 * constraint type, and for composite variants exposes child fields.
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
      })
    | (BuilderFieldBase & {
          readonly type: "object";
          readonly constraints: ObjectConstraints;
          /** Nested child fields. */
          readonly children: readonly BuilderField[];
      })
    | (BuilderFieldBase & {
          readonly type: "array";
          readonly constraints: ArrayConstraints;
          /** The items schema — a single child field. */
          readonly itemField: BuilderField;
      })
    | (BuilderFieldBase & {
          readonly type: "record";
          readonly constraints: RecordConstraints;
          /** Schema for each record value. */
          readonly valueField: BuilderField;
      })
    | (BuilderFieldBase & {
          readonly type: "tuple";
          readonly constraints: Record<string, never>;
          /** Ordered tuple item schemas. */
          readonly prefixItems: readonly BuilderField[];
          /** When true, no additional items beyond prefixItems are allowed. */
          readonly closed: boolean;
      })
    | (BuilderFieldBase & {
          readonly type: "literal";
          readonly constraints: LiteralConstraints;
      })
    | (BuilderFieldBase & {
          readonly type: "null";
          readonly constraints: Record<string, never>;
      })
    | (BuilderFieldBase & {
          readonly type: "file";
          readonly constraints: FileConstraints;
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
