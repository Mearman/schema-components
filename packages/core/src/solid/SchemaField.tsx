/** @jsxImportSource solid-js */
/**
 * `<SchemaField>` — render a single field from a Solid schema by
 * dot-separated `path`.
 *
 * Mirrors the React adapter's `<SchemaField>`. Walks the full schema
 * tree, resolves the field at the supplied `path`, then renders only
 * that field through the same resolver pipeline as `<SchemaComponent>`.
 *
 * Reads context bindings (`UserResolverContext`, `WidgetsContext`)
 * exposed by `<SchemaProvider>`, so a single provider drives every
 * `<SchemaField>` inside its subtree just as it does for
 * `<SchemaComponent>`.
 */

import { createUniqueId, useContext, type JSX } from "solid-js";
import { z } from "zod";
import { walk } from "../core/walker.ts";
import type { WalkOptions } from "../core/walkBuilders.ts";
import {
    isCodecSchema,
    normaliseSchema,
    type SchemaIoSide,
} from "../core/adapter.ts";
import { isObject } from "../core/guards.ts";
import { SchemaNormalisationError, SchemaFieldError } from "../core/errors.ts";
import {
    resolvePath,
    resolveValue,
    setNestedValue,
} from "../core/fieldPath.ts";
import type { SchemaMeta, WalkedField } from "../core/types.ts";
import type {
    FromJSONSchema,
    PathOfType,
    RejectUnrepresentableZod,
} from "../core/typeInference.ts";
import type { Diagnostic } from "../core/diagnostics.ts";
import { UserResolverContext, WidgetsContext } from "./contexts.ts";
import { joinPath, renderField, sanitisePrefix } from "./SchemaComponent.tsx";

/**
 * Infer the schema's output type for SchemaField path inference.
 */
type InferSchemaType<T> = T extends z.ZodType
    ? z.infer<T>
    : T extends object
      ? unknown extends FromJSONSchema<T>
          ? unknown
          : FromJSONSchema<T>
      : unknown;

/**
 * Props accepted by {@link SchemaField}. The generic `P` constrains
 * `path` to dot-paths reachable through the schema's inferred value
 * type — typed schemas get autocomplete; runtime schemas fall back to
 * `string`.
 *
 * @group Components
 */
export interface SchemaFieldProps<
    T = unknown,
    Ref extends string | undefined = undefined,
    P extends string =
        | PathOfType<InferSchemaType<T>>
        | (string extends PathOfType<InferSchemaType<T>> ? string : never),
> {
    path: P;
    schema: RejectUnrepresentableZod<T>;
    ref?: Ref;
    value?: unknown;
    onChange?: (value: unknown) => void;
    meta?: SchemaMeta;
    validate?: boolean;
    onValidationError?: (error: unknown) => void;
}

/**
 * Render a single field from a schema by dot-separated `path`.
 *
 * Walks the full schema tree, resolves the field at the supplied
 * `path`, then renders only that field through the same resolver
 * pipeline as `<SchemaComponent>`.
 *
 * @group Components
 */
export function SchemaField<
    T = unknown,
    Ref extends string | undefined = undefined,
    P extends string =
        | PathOfType<InferSchemaType<T>>
        | (string extends PathOfType<InferSchemaType<T>> ? string : never),
>(props: SchemaFieldProps<T, Ref, P>): JSX.Element {
    const generatedId = createUniqueId();
    const userResolver = useContext(UserResolverContext);
    const contextWidgets = useContext(WidgetsContext);

    let jsonSchema: Record<string, unknown>;
    let zodSchema: unknown;
    let rootMeta: SchemaMeta | undefined;
    let rootDocument: Record<string, unknown>;
    try {
        const normalised = normaliseSchema(props.schema, props.ref);
        jsonSchema = normalised.jsonSchema;
        zodSchema = normalised.zodSchema;
        rootMeta = normalised.rootMeta;
        rootDocument = normalised.rootDocument;
    } catch (err: unknown) {
        if (err instanceof SchemaNormalisationError) throw err;
        throw new SchemaNormalisationError(
            err instanceof Error ? err.message : "Failed to normalise schema",
            props.schema,
            "unknown"
        );
    }

    const walkOptions: WalkOptions = {
        componentMeta: props.meta,
        rootMeta,
        rootDocument,
    };

    const fullTree = walk(jsonSchema, walkOptions);
    const fieldTree = resolvePath(fullTree, props.path);
    if (fieldTree === undefined) {
        throw new SchemaFieldError(
            `Field not found: ${props.path}`,
            props.schema,
            props.path
        );
    }

    const fieldValue = resolveValue(props.value, props.path);

    const handleChange = (nextFieldValue: unknown) => {
        const newRootValue = setNestedValue(
            props.value,
            props.path,
            nextFieldValue
        );
        if (props.validate === true) {
            // SchemaField does not (yet) expose an `io` prop, so
            // validation runs against the default OUTPUT side — same
            // contract as `react/SchemaComponent.tsx`.
            const error = runFieldValidation(
                zodSchema,
                jsonSchema,
                newRootValue
            );
            if (error !== undefined) {
                props.onValidationError?.(error);
            }
        }
        props.onChange?.(newRootValue);
    };

    const rootPath = joinPath(sanitisePrefix(generatedId), props.path);

    const makeRenderChild =
        (currentDepth: number, parentPath: string) =>
        (
            childTree: WalkedField,
            childValue: unknown,
            childOnChange: (v: unknown) => void,
            pathSuffix?: string
        ): JSX.Element => {
            const childPath = joinPath(parentPath, pathSuffix);
            return renderField(
                childTree,
                childValue,
                childOnChange,
                userResolver,
                makeRenderChild(currentDepth + 1, childPath),
                childPath,
                undefined,
                contextWidgets,
                currentDepth + 1
            );
        };

    const renderChild = makeRenderChild(0, rootPath);

    return renderField(
        fieldTree,
        fieldValue,
        handleChange,
        userResolver,
        renderChild,
        rootPath,
        undefined,
        contextWidgets,
        0
    );
}

// ---------------------------------------------------------------------------
// Local validation helper — duplicates the React/Solid `runValidation`
// behaviour for the SchemaField surface. The function is local so
// SchemaField does not depend on internal SchemaComponent exports.
// ---------------------------------------------------------------------------

function isCallable(value: unknown): value is (...args: unknown[]) => unknown {
    return typeof value === "function";
}

function runFieldValidation(
    zodSchema: unknown,
    jsonSchema: Record<string, unknown>,
    value: unknown,
    io?: SchemaIoSide,
    onDiagnostic?: (diagnostic: Diagnostic) => void
): unknown {
    if (zodSchema !== undefined && isObject(zodSchema)) {
        const resolvedIo: SchemaIoSide = io ?? "output";
        const useSafeEncode =
            isCodecSchema(zodSchema) && resolvedIo === "output";
        const validateFn = useSafeEncode
            ? zodSchema.safeEncode
            : zodSchema.safeParse;
        if (isCallable(validateFn)) {
            const result: unknown = validateFn(value);
            if (
                isObject(result) &&
                "success" in result &&
                result.success !== true
            ) {
                return result.error;
            }
            return undefined;
        }
    }

    let parsed: unknown;
    try {
        parsed = z.fromJSONSchema(jsonSchema);
    } catch (err) {
        const message =
            err instanceof Error
                ? err.message
                : "z.fromJSONSchema threw a non-Error value";
        if (onDiagnostic !== undefined) {
            onDiagnostic({
                code: "unsupported-type",
                message:
                    "Skipping fallback validation: z.fromJSONSchema could not " +
                    `round-trip the normalised JSON Schema. Original message: ${message}`,
                pointer: "",
                detail: { source: "z.fromJSONSchema" },
            });
            return undefined;
        }
        throw new SchemaNormalisationError(
            "Fallback validation failed: z.fromJSONSchema could not " +
                `round-trip the normalised JSON Schema. Original message: ${message}`,
            jsonSchema,
            "zod-conversion-failed",
            undefined,
            err
        );
    }
    if (isObject(parsed)) {
        const safeParseFn = parsed.safeParse;
        if (isCallable(safeParseFn)) {
            const result: unknown = safeParseFn(value);
            if (
                isObject(result) &&
                "success" in result &&
                result.success !== true
            ) {
                return result.error;
            }
        }
    }

    return undefined;
}
