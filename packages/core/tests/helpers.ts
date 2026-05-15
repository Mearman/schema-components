/**
 * Shared test helpers with type-safe narrowing.
 *
 * These functions throw with a descriptive message when a value is
 * undefined, and return the narrowed type for TypeScript.
 */
import type {
    WalkedField,
    ObjectField,
    ArrayField,
    TupleField,
    UnionField,
    DiscriminatedUnionField,
    ConditionalField,
    NegationField,
    RecordField,
    EnumField,
    LiteralField,
    NumberConstraints,
} from "../src/core/types.ts";
import {
    isObjectField,
    isArrayField,
    isTupleField,
    isUnionField,
    isDiscriminatedUnionField,
    isConditionalField,
    isNegationField,
    isRecordField,
    isEnumField,
    isLiteralField,
    isNumberField,
} from "../src/core/types.ts";

/**
 * Assert a value is defined (not undefined). Returns narrowed type.
 */
export function assertDefined<T>(value: T | undefined, message: string): T {
    if (value === undefined) {
        throw new Error(message);
    }
    return value;
}

/**
 * Walk a WalkedField tree by key path, throwing if any intermediate
 * field is missing. Replaces the old getField helper.
 */
export function getField(tree: WalkedField, ...keys: string[]): WalkedField {
    let current: WalkedField = tree;
    for (const key of keys) {
        if (!isObjectField(current)) {
            throw new Error(
                `Expected object field at ${keys.join(".")}, got ${current.type}`
            );
        }
        const child = assertDefined(
            current.fields[key],
            `Expected field "${key}" at ${keys.join(".")}`
        );
        current = child;
    }
    return current;
}

/** Assert field is ObjectField and return narrowed. */
export function asObject(field: WalkedField, msg?: string): ObjectField {
    if (!isObjectField(field))
        throw new Error(msg ?? `Expected object, got ${field.type}`);
    return field;
}

/** Assert field is ArrayField and return narrowed. */
export function asArray(field: WalkedField, msg?: string): ArrayField {
    if (!isArrayField(field))
        throw new Error(msg ?? `Expected array, got ${field.type}`);
    return field;
}

/** Assert field is TupleField and return narrowed. */
export function asTuple(field: WalkedField, msg?: string): TupleField {
    if (!isTupleField(field))
        throw new Error(msg ?? `Expected tuple, got ${field.type}`);
    return field;
}

/** Assert field is UnionField and return narrowed. */
export function asUnion(field: WalkedField, msg?: string): UnionField {
    if (!isUnionField(field))
        throw new Error(msg ?? `Expected union, got ${field.type}`);
    return field;
}

/** Assert field is DiscriminatedUnionField and return narrowed. */
export function asDiscriminatedUnion(
    field: WalkedField,
    msg?: string
): DiscriminatedUnionField {
    if (!isDiscriminatedUnionField(field))
        throw new Error(
            msg ?? `Expected discriminatedUnion, got ${field.type}`
        );
    return field;
}

/** Assert field is ConditionalField and return narrowed. */
export function asConditional(
    field: WalkedField,
    msg?: string
): ConditionalField {
    if (!isConditionalField(field))
        throw new Error(msg ?? `Expected conditional, got ${field.type}`);
    return field;
}

/** Assert field is NegationField and return narrowed. */
export function asNegation(field: WalkedField, msg?: string): NegationField {
    if (!isNegationField(field))
        throw new Error(msg ?? `Expected negation, got ${field.type}`);
    return field;
}

/** Assert field is RecordField and return narrowed. */
export function asRecord(field: WalkedField, msg?: string): RecordField {
    if (!isRecordField(field))
        throw new Error(msg ?? `Expected record, got ${field.type}`);
    return field;
}

/** Assert field is EnumField and return narrowed. */
export function asEnum(field: WalkedField, msg?: string): EnumField {
    if (!isEnumField(field))
        throw new Error(msg ?? `Expected enum, got ${field.type}`);
    return field;
}

/** Assert field is LiteralField and return narrowed. */
export function asLiteral(field: WalkedField, msg?: string): LiteralField {
    if (!isLiteralField(field))
        throw new Error(msg ?? `Expected literal, got ${field.type}`);
    return field;
}

/** Assert field is NumberField and get NumberConstraints. */
export function asNumberConstraints(
    field: WalkedField,
    msg?: string
): NumberConstraints {
    if (!isNumberField(field))
        throw new Error(msg ?? `Expected number, got ${field.type}`);
    return field.constraints;
}

/**
 * Safely get .fields from any WalkedField. Returns undefined for non-object types.
 */
export function getFields(
    field: WalkedField
): Record<string, WalkedField> | undefined {
    return field.type === "object" ? field.fields : undefined;
}

/**
 * Safely get .options from any WalkedField.
 */
export function getOptions(field: WalkedField): WalkedField[] | undefined {
    if (field.type === "union" || field.type === "discriminatedUnion")
        return field.options;
    return undefined;
}

/**
 * Safely get .prefixItems from any WalkedField.
 */
export function getPrefixItems(field: WalkedField): WalkedField[] | undefined {
    return field.type === "tuple" ? field.prefixItems : undefined;
}

/**
 * Safely get .literalValues from any WalkedField.
 */
export function getLiteralValues(
    field: WalkedField
): (string | number | boolean | null)[] | undefined {
    return field.type === "literal" ? field.literalValues : undefined;
}

/**
 * Safely get .element from any WalkedField.
 */
export function getElement(field: WalkedField): WalkedField | undefined {
    return field.type === "array" ? field.element : undefined;
}

/**
 * Extract fields from any WalkedField using the "in" operator for narrowing.
 * These are test-only utilities that avoid needing type guards at every call site.
 */

/** Get fields if present (object type). */
export function fieldsOf(
    f: WalkedField
): Record<string, WalkedField> | undefined {
    return f.type === "object" ? f.fields : undefined;
}

/** Get options if present (union/discriminated union). */
export function optionsOf(f: WalkedField): WalkedField[] | undefined {
    if (f.type === "union" || f.type === "discriminatedUnion") return f.options;
    return undefined;
}

/** Get prefixItems if present (tuple). */
export function prefixItemsOf(f: WalkedField): WalkedField[] | undefined {
    return f.type === "tuple" ? f.prefixItems : undefined;
}

/** Get literalValues if present (literal). */
export function literalValuesOf(
    f: WalkedField
): (string | number | boolean | null)[] | undefined {
    return f.type === "literal" ? f.literalValues : undefined;
}
/** Get number constraints from a number-typed field. */
export function numberConstraintsOf(
    f: WalkedField
): NumberConstraints | undefined {
    return f.type === "number" ? f.constraints : undefined;
}

/** Get element if present (array). */
export function elementOf(f: WalkedField): WalkedField | undefined {
    return f.type === "array" ? f.element : undefined;
}

/** Get enumValues if present. */
export function enumValuesOf(
    f: WalkedField
): (string | number | boolean | null)[] | undefined {
    return f.type === "enum" ? f.enumValues : undefined;
}

/** Get ifClause if present. */
export function ifClauseOf(f: WalkedField): WalkedField | undefined {
    return f.type === "conditional" ? f.ifClause : undefined;
}

/** Get thenClause if present. */
export function thenClauseOf(f: WalkedField): WalkedField | undefined {
    return f.type === "conditional" ? f.thenClause : undefined;
}

/** Get elseClause if present. */
export function elseClauseOf(f: WalkedField): WalkedField | undefined {
    return f.type === "conditional" ? f.elseClause : undefined;
}

/** Get negated if present. */
export function negatedOf(f: WalkedField): WalkedField | undefined {
    return f.type === "negation" ? f.negated : undefined;
}

/** Get discriminator if present. */
export function discriminatorOf(f: WalkedField): string | undefined {
    return f.type === "discriminatedUnion" ? f.discriminator : undefined;
}

/** Get keyType if present. */
export function keyTypeOf(f: WalkedField): WalkedField | undefined {
    return f.type === "record" ? f.keyType : undefined;
}

/** Get valueType if present. */
export function valueTypeOf(f: WalkedField): WalkedField | undefined {
    return f.type === "record" ? f.valueType : undefined;
}

/** Get string constraints (format, minLength, maxLength, etc.). */
export function stringConstraintsOf(
    f: WalkedField
): import("../src/core/types.ts").StringConstraints | undefined {
    return f.type === "string" ? f.constraints : undefined;
}

/** Get array constraints (minItems, maxItems, uniqueItems, contains, etc.). */
export function arrayConstraintsOf(
    f: WalkedField
): import("../src/core/types.ts").ArrayConstraints | undefined {
    if (f.type === "array" || f.type === "tuple") return f.constraints;
    return undefined;
}

/** Get object constraints (minProperties, maxProperties). */
export function objectConstraintsOf(
    f: WalkedField
): import("../src/core/types.ts").ObjectConstraints | undefined {
    if (f.type === "object" || f.type === "record") return f.constraints;
    return undefined;
}

/** Get file constraints (mimeTypes). */
export function fileConstraintsOf(
    f: WalkedField
): import("../src/core/types.ts").FileConstraints | undefined {
    return f.type === "file" ? f.constraints : undefined;
}
