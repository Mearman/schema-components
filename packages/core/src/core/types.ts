/**
 * Core types for schema-components.
 *
 * These types define the vocabulary shared between the schema walker,
 * component resolver, and React components.
 */

// ---------------------------------------------------------------------------
// Schema types — JSON Schema object
// ---------------------------------------------------------------------------

/** A raw JSON object (JSON Schema or OpenAPI document). */
export type JsonObject = Record<string, unknown>;

// ---------------------------------------------------------------------------
// SchemaMeta — metadata that controls rendering behaviour
// ---------------------------------------------------------------------------

/**
 * Metadata attached to schemas via `.meta()` or passed as props to
 * `<SchemaComponent>`. Every field is also available as a top-level
 * prop on `<SchemaComponent>` (with TypeScript-enforced exclusivity
 * between prop and `meta`).
 */
export interface SchemaMeta {
    readOnly?: boolean;
    writeOnly?: boolean;
    description?: string;
    title?: string;
    deprecated?: boolean;
    /** Component hint — resolved before theme adapter. */
    component?: string;
    /** Sort order for object fields. Lower values render first. */
    order?: number;
    /** Arbitrary UI hints passed through to theme adapters. */
    [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Editability — resolved per-field from three sources
// ---------------------------------------------------------------------------

/**
 * Resolved editability state for a walked field. `presentation` renders
 * as a read-only value, `input` as a write-only input (e.g. password
 * fields), `editable` as a full input that round-trips through
 * `onChange`. Produced by {@link resolveEditability}.
 */
export type Editability = "presentation" | "input" | "editable";

/**
 * Resolved editability state for a single field.
 *
 * Priority (highest wins):
 * 1. Property-level readOnly → presentation
 * 2. Property-level writeOnly → input
 * 3. Component-level readOnly → presentation
 * 4. Component-level writeOnly → input
 * 5. Schema root readOnly → presentation
 * 6. Schema root writeOnly → input
 * 7. Neither → editable
 */
export function resolveEditability(
    propertyMeta: SchemaMeta | undefined,
    componentMeta: SchemaMeta | undefined,
    rootMeta: SchemaMeta | undefined
): Editability {
    // Property-level overrides always win. Check for explicit presence
    // of the key — `readOnly: false` means "not read-only", overriding
    // a higher-level `readOnly: true`.
    if (propertyMeta !== undefined && "readOnly" in propertyMeta) {
        if (propertyMeta.readOnly) return "presentation";
        // readOnly: false — not presentation, check writeOnly
    }
    if (propertyMeta !== undefined && "writeOnly" in propertyMeta) {
        if (propertyMeta.writeOnly) return "input";
        // writeOnly: false — not input, fall through
    }
    // If property explicitly set readOnly or writeOnly (even to false),
    // that overrides higher levels — the field is editable.
    if (
        propertyMeta !== undefined &&
        ("readOnly" in propertyMeta || "writeOnly" in propertyMeta)
    ) {
        return "editable";
    }

    // Component-level (rendering context)
    if (componentMeta !== undefined && "readOnly" in componentMeta) {
        if (componentMeta.readOnly) return "presentation";
    }
    if (componentMeta !== undefined && "writeOnly" in componentMeta) {
        if (componentMeta.writeOnly) return "input";
    }
    if (
        componentMeta !== undefined &&
        ("readOnly" in componentMeta || "writeOnly" in componentMeta)
    ) {
        return "editable";
    }

    // Schema root (fallback default)
    if (rootMeta !== undefined && "readOnly" in rootMeta) {
        if (rootMeta.readOnly) return "presentation";
    }
    if (rootMeta !== undefined && "writeOnly" in rootMeta) {
        if (rootMeta.writeOnly) return "input";
    }
    if (
        rootMeta !== undefined &&
        ("readOnly" in rootMeta || "writeOnly" in rootMeta)
    ) {
        return "editable";
    }

    return "editable";
}

// ---------------------------------------------------------------------------
// FieldOverrides — type-safe nested overrides for the `fields` prop
// ---------------------------------------------------------------------------

/**
 * Recursive mapped type that mirrors a schema's shape for per-field
 * overrides. Each leaf accepts schema meta overrides and an optional
 * per-field validation error callback. Objects recurse and also accept
 * their own overrides.
 */
export type FieldOverrides<T> = {
    [K in keyof T]?: T[K] extends object
        ? FieldOverrides<T[K]> & FieldOverride
        : FieldOverride;
};

/**
 * Per-field override. Extends SchemaMeta with rendering controls
 * and a per-field validation error callback.
 */
export type FieldOverride = Partial<SchemaMeta> & {
    /** Called with the ZodError when this field fails validation. */
    onValidationError?: (error: unknown) => void;
    /** Hide this field when false. Defaults to true (visible). */
    visible?: boolean;
};

// ---------------------------------------------------------------------------
// Walker types — what the walker produces for each schema node
// ---------------------------------------------------------------------------

/**
 * All schema types the walker can produce.
 * Used as the discriminant in the WalkedField tagged union.
 */
export type SchemaType =
    | "string"
    | "number"
    | "boolean"
    | "null"
    | "enum"
    | "literal"
    | "object"
    | "array"
    | "tuple"
    | "record"
    | "union"
    | "discriminatedUnion"
    | "conditional"
    | "negation"
    | "file"
    | "never"
    | "unknown";

// ---------------------------------------------------------------------------
// Per-type constraint maps
// ---------------------------------------------------------------------------

/** Constraints that apply to string schemas. */
export interface StringConstraints {
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    format?: string;
    /** Derived RegExp from the format string, if the format is recognised. */
    formatPattern?: RegExp;
    contentEncoding?: string;
    contentMediaType?: string;
}

/** Constraints that apply to number/integer schemas. */
export interface NumberConstraints {
    minimum?: number;
    maximum?: number;
    exclusiveMinimum?: number;
    exclusiveMaximum?: number;
    multipleOf?: number;
}

/** Constraints that apply to array schemas. */
export interface ArrayConstraints {
    minItems?: number;
    maxItems?: number;
    uniqueItems?: boolean;
    minContains?: number;
    maxContains?: number;
}

/** Constraints that apply to object schemas. */
export interface ObjectConstraints {
    minProperties?: number;
    maxProperties?: number;
}

/** Constraints that apply to file schemas. */
export interface FileConstraints {
    mimeTypes?: string[];
}

/**
 * Union of all constraint types. Renderers can narrow by checking
 * the WalkedField's `type` discriminant.
 */
export type FieldConstraints =
    | StringConstraints
    | NumberConstraints
    | ArrayConstraints
    | ObjectConstraints
    | FileConstraints
    | Record<string, never>;

// ---------------------------------------------------------------------------
// Shared base for all WalkedField variants
// ---------------------------------------------------------------------------

/**
 * Properties common to every WalkedField variant.
 * The `type` field acts as the discriminant for the tagged union.
 */
export interface FieldBase {
    editability: Editability;
    meta: SchemaMeta;
    /** Whether the field is optional (not in `required`). */
    isOptional?: boolean;
    /** Whether the field is nullable (`anyOf [T, null]` or `type: ["...", "null"]`). */
    isNullable?: boolean;
    /** Default value from the schema's `default` keyword. */
    defaultValue?: unknown;
    /** Example values from the schema's `examples` keyword. */
    examples?: unknown[];
}

// ---------------------------------------------------------------------------
// WalkedField discriminated union
// ---------------------------------------------------------------------------

export interface StringField extends FieldBase {
    type: "string";
    constraints: StringConstraints;
}

export interface NumberField extends FieldBase {
    type: "number";
    constraints: NumberConstraints;
    /**
     * True when the underlying schema declared `type: "integer"` rather
     * than `type: "number"`. Renderers consult this to set HTML
     * `inputmode="numeric"` and `step="1"` (for whole-number editing)
     * instead of `inputmode="decimal"`.
     */
    isInteger: boolean;
}

export interface BooleanField extends FieldBase {
    type: "boolean";
    constraints: Record<string, never>;
}

export interface NullField extends FieldBase {
    type: "null";
    constraints: Record<string, never>;
}

export interface EnumField extends FieldBase {
    type: "enum";
    constraints: Record<string, never>;
    /**
     * Enum values from JSON Schema `enum`. Per Draft 2020-12 §6.1.2,
     * `enum` accepts an array of arbitrary JSON values — not only
     * primitives. Object and array values are preserved verbatim.
     */
    enumValues: unknown[];
}

export interface LiteralField extends FieldBase {
    type: "literal";
    constraints: Record<string, never>;
    /**
     * Const values from JSON Schema `const`. Per Draft 2020-12 §6.1.3,
     * `const` accepts any JSON value (object or array included), not
     * only primitives. The walker emits a single-element array because
     * `const` is scalar by definition; the field shape mirrors
     * `EnumField` for renderer symmetry.
     */
    literalValues: unknown[];
}

export interface ObjectField extends FieldBase {
    type: "object";
    constraints: ObjectConstraints;
    /** Map of property name → walked sub-schema. */
    fields: Record<string, WalkedField>;
    /** Property names declared in `required`. */
    requiredFields: string[];
    /** Regex-keyed sub-schemas from `patternProperties`. */
    patternProperties?: Record<string, WalkedField>;
    /** Whether `additionalProperties` is explicitly `false` (closed). */
    additionalPropertiesClosed?: boolean;
    /** Schema for additional properties when not `false` and not a Record. */
    additionalPropertiesSchema?: WalkedField;
    /** Property-presence-activated sub-schemas from `dependentSchemas`. */
    dependentSchemas?: Record<string, WalkedField>;
    /** Property-presence-conditional required fields from `dependentRequired`. */
    dependentRequired?: Record<string, string[]>;
    /** Constraint schema for unevaluated properties. */
    unevaluatedProperties?: WalkedField;
    /** Whether unevaluatedProperties is explicitly `false`. */
    unevaluatedPropertiesClosed?: boolean;
    /** Schema constraining property names (from `propertyNames`). */
    propertyNames?: WalkedField;
}

export interface ArrayField extends FieldBase {
    type: "array";
    constraints: ArrayConstraints;
    /** The element sub-schema. */
    element?: WalkedField;
    /**
     * Walked schema that at least one array item must match
     * (`contains` keyword). Constrains element membership at runtime;
     * paired with `minContains`/`maxContains` for cardinality.
     */
    contains?: WalkedField;
    /** Walked schema for unevaluated items. */
    unevaluatedItems?: WalkedField;
    /**
     * Whether `unevaluatedItems` is explicitly `false` (no extras
     * permitted beyond the items evaluated by `items`/`prefixItems`/
     * `contains`). Parallel to `additionalPropertiesClosed` and
     * `unevaluatedPropertiesClosed` on `ObjectField`.
     */
    unevaluatedItemsClosed?: boolean;
}

export interface TupleField extends FieldBase {
    type: "tuple";
    constraints: ArrayConstraints;
    /** Positional element schemas from `prefixItems`. */
    prefixItems: WalkedField[];
    /**
     * Schema for items beyond the `prefixItems` length. In Draft 2020-12,
     * `items` adjacent to `prefixItems` describes the rest element. When
     * absent, additional items are permitted but unconstrained.
     */
    restItems?: WalkedField;
    /**
     * Walked schema that at least one array item must match
     * (`contains` keyword). Tuples may declare it alongside positional
     * element schemas to require the presence of a specific element.
     */
    contains?: WalkedField;
    /**
     * Walked schema for `unevaluatedItems` adjacent to `prefixItems`.
     * Permits additional items only when they satisfy this schema.
     */
    unevaluatedItems?: WalkedField;
    /**
     * Whether `unevaluatedItems` is explicitly `false` on a tuple. With
     * `prefixItems` declared, this forbids any items beyond the prefix
     * length.
     */
    unevaluatedItemsClosed?: boolean;
}

export interface RecordField extends FieldBase {
    type: "record";
    constraints: ObjectConstraints;
    /** Key name validation schema (from `propertyNames`). */
    keyType: WalkedField;
    /** Value schema (from `additionalProperties`). */
    valueType: WalkedField;
}

export interface UnionField extends FieldBase {
    type: "union";
    constraints: Record<string, never>;
    /** The union options. */
    options: WalkedField[];
}

export interface DiscriminatedUnionField extends FieldBase {
    type: "discriminatedUnion";
    constraints: Record<string, never>;
    /** The union options. */
    options: WalkedField[];
    /** Property name that discriminates between options. */
    discriminator: string;
}

export interface ConditionalField extends FieldBase {
    type: "conditional";
    constraints: Record<string, never>;
    /** The `if` sub-schema. */
    ifClause: WalkedField;
    /** The `then` sub-schema. */
    thenClause?: WalkedField;
    /** The `else` sub-schema. */
    elseClause?: WalkedField;
}

export interface NegationField extends FieldBase {
    type: "negation";
    constraints: Record<string, never>;
    /** The negated sub-schema. */
    negated: WalkedField;
}

export interface FileField extends FieldBase {
    type: "file";
    constraints: FileConstraints;
}

/** Schema position where `false` appears — the field cannot have any value. */
export interface NeverField extends FieldBase {
    type: "never";
    constraints: Record<string, never>;
}

export interface UnknownField extends FieldBase {
    type: "unknown";
    constraints: Record<string, never>;
}

/**
 * Tagged union of all schema field types produced by the walker.
 * Use `field.type` to narrow to a specific variant.
 */
export type WalkedField =
    | StringField
    | NumberField
    | BooleanField
    | NullField
    | EnumField
    | LiteralField
    | ObjectField
    | ArrayField
    | TupleField
    | RecordField
    | UnionField
    | DiscriminatedUnionField
    | ConditionalField
    | NegationField
    | NeverField
    | FileField
    | UnknownField;

// ---------------------------------------------------------------------------
// Type guards for WalkedField variants
// ---------------------------------------------------------------------------

function isField<T extends SchemaType>(
    field: WalkedField,
    t: T
): field is Extract<WalkedField, { type: T }> {
    return field.type === t;
}

/** Type guard: narrows a `WalkedField` to its `string` variant. */
export function isStringField(field: WalkedField): field is StringField {
    return isField(field, "string");
}

/** Type guard: narrows a `WalkedField` to its `number` variant. */
export function isNumberField(field: WalkedField): field is NumberField {
    return isField(field, "number");
}

/** Type guard: narrows a `WalkedField` to its `boolean` variant. */
export function isBooleanField(field: WalkedField): field is BooleanField {
    return isField(field, "boolean");
}

/** Type guard: narrows a `WalkedField` to its `null` variant. */
export function isNullField(field: WalkedField): field is NullField {
    return isField(field, "null");
}

/** Type guard: narrows a `WalkedField` to its `enum` variant. */
export function isEnumField(field: WalkedField): field is EnumField {
    return isField(field, "enum");
}

/** Type guard: narrows a `WalkedField` to its `literal` variant. */
export function isLiteralField(field: WalkedField): field is LiteralField {
    return isField(field, "literal");
}

/** Type guard: narrows a `WalkedField` to its `object` variant. */
export function isObjectField(field: WalkedField): field is ObjectField {
    return isField(field, "object");
}

/** Type guard: narrows a `WalkedField` to its `array` variant. */
export function isArrayField(field: WalkedField): field is ArrayField {
    return isField(field, "array");
}

/** Type guard: narrows a `WalkedField` to its `tuple` variant. */
export function isTupleField(field: WalkedField): field is TupleField {
    return isField(field, "tuple");
}

/** Type guard: narrows a `WalkedField` to its `record` variant. */
export function isRecordField(field: WalkedField): field is RecordField {
    return isField(field, "record");
}

/** Type guard: narrows a `WalkedField` to its plain `union` variant. */
export function isUnionField(field: WalkedField): field is UnionField {
    return isField(field, "union");
}

/** Type guard: narrows a `WalkedField` to its `discriminatedUnion` variant. */
export function isDiscriminatedUnionField(
    field: WalkedField
): field is DiscriminatedUnionField {
    return isField(field, "discriminatedUnion");
}

/** Type guard: narrows a `WalkedField` to its `conditional` (if/then/else) variant. */
export function isConditionalField(
    field: WalkedField
): field is ConditionalField {
    return isField(field, "conditional");
}

/** Type guard: narrows a `WalkedField` to its `negation` (`not`) variant. */
export function isNegationField(field: WalkedField): field is NegationField {
    return isField(field, "negation");
}

/** Type guard: narrows a `WalkedField` to its `file` variant. */
export function isFileField(field: WalkedField): field is FileField {
    return isField(field, "file");
}

/** Type guard: narrows a `WalkedField` to its `never` variant (false schema). */
export function isNeverField(field: WalkedField): field is NeverField {
    return isField(field, "never");
}

/** Type guard: narrows a `WalkedField` to its `unknown` variant (permissive). */
export function isUnknownField(field: WalkedField): field is UnknownField {
    return isField(field, "unknown");
}
