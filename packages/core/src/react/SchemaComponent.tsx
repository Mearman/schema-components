"use client";

/**
 * <SchemaComponent> — renders UI from Zod, JSON Schema, or OpenAPI schemas.
 *
 * Auto-detects the input format, normalises to JSON Schema via the adapter,
 * walks the JSON Schema tree, and delegates rendering to the
 * ComponentResolver (theme adapter). Falls back to headless HTML.
 *
 * The `fields` prop type is inferred from the `schema` prop:
 * - Zod schemas → FieldOverrides<z.infer<T>> (full autocomplete)
 * - JSON Schema `as const` → FieldOverrides<FromJSONSchema<T>> (full autocomplete)
 * - OpenAPI `as const` + `ref` → FieldOverrides<ResolveOpenAPIRef<T, Ref>>
 * - Runtime schemas → Record<string, FieldOverride> (no autocomplete)
 */

import { z } from "zod";
import {
    createContext,
    useContext,
    useCallback,
    useId,
    useMemo,
    isValidElement,
    type ReactNode,
} from "react";
import { walk } from "../core/walker.ts";
import type { WalkOptions } from "../core/walkBuilders.ts";
import {
    isCodecSchema,
    normaliseSchema,
    type SchemaIoSide,
} from "../core/adapter.ts";
import { MAX_RENDER_DEPTH } from "../core/limits.ts";
import {
    buildRenderProps,
    getRenderFunction,
    mergeResolvers,
} from "../core/renderer.ts";
import type {
    ComponentResolver,
    RenderProps,
    WidgetMap,
} from "../core/renderer.ts";
import type {
    FieldOverride,
    FieldOverrides,
    SchemaMeta,
    WalkedField,
} from "../core/types.ts";
import type {
    FromJSONSchema,
    FromJSONSchemaMode,
    IsSwagger2Doc,
    PathOfType,
    RejectUnrepresentableZod,
    ResolveOpenAPIRef,
    TypeAtPath,
    __SchemaInferenceFellBack,
} from "../core/typeInference.ts";
import type { DiagnosticsOptions, Diagnostic } from "../core/diagnostics.ts";
import { headlessResolver } from "./headless.tsx";
import { resolvePath, resolveValue, setNestedValue } from "./fieldPath.ts";
import { isObject, toRecordOrUndefined } from "../core/guards.ts";
import {
    SchemaNormalisationError,
    SchemaFieldError,
    SchemaRenderError,
} from "../core/errors.ts";

// ---------------------------------------------------------------------------
// Context — theme adapter and scoped widgets
// ---------------------------------------------------------------------------

const UserResolverContext = createContext<ComponentResolver | undefined>(
    undefined
);

const WidgetsContext = createContext<WidgetMap | undefined>(undefined);

/**
 * Provide a theme resolver and scoped widgets to every `<SchemaComponent>`
 * and `<SchemaView>` rendered inside the subtree.
 *
 * Wrap an application (or a region of it) with `<SchemaProvider>` so a
 * single theme — typically one of the bundled adapters
 * (`shadcnResolver`, `muiResolver`, `mantineResolver`, `radixResolver`)
 * or a custom one — drives every schema render. Without a provider,
 * schema-components fall back to the headless HTML renderer.
 *
 * @group Components
 * @example
 * ```tsx
 * import { SchemaProvider } from "schema-components/react/SchemaComponent";
 * import { shadcnResolver } from "schema-components/themes/shadcn";
 *
 * <SchemaProvider resolver={shadcnResolver}>
 *   <SchemaComponent schema={userSchema} value={user} onChange={setUser} />
 * </SchemaProvider>
 * ```
 */
export function SchemaProvider({
    resolver,
    widgets,
    children,
}: {
    resolver: ComponentResolver;
    /** Scoped widgets available to all SchemaComponents in this subtree. */
    widgets?: WidgetMap;
    children: ReactNode;
}) {
    return (
        <UserResolverContext.Provider value={resolver}>
            <WidgetsContext.Provider value={widgets}>
                {children}
            </WidgetsContext.Provider>
        </UserResolverContext.Provider>
    );
}

// ---------------------------------------------------------------------------
// Widget registry — custom renderers registered by .meta({ component }) hint
// ---------------------------------------------------------------------------

/** Global widget registry — app-wide defaults. */
const globalWidgets = new Map<string, (props: RenderProps) => unknown>();

/**
 * Register a widget globally. The widget is resolved when a schema field
 * has `.meta({ component: name })`.
 *
 * For scoped registration, use the `widgets` prop on `<SchemaComponent>`
 * or `<SchemaProvider>` instead.
 */
export function registerWidget(
    name: string,
    render: (props: RenderProps) => unknown
): void {
    globalWidgets.set(name, render);
}

/**
 * Clear every globally registered widget. Intended for test isolation —
 * `registerWidget` writes to module-level state and that state otherwise
 * leaks across test cases, making the test suite order-dependent. Tests
 * should call this from an `afterEach` hook.
 *
 * @internal
 */
export function __clearGlobalWidgets(): void {
    globalWidgets.clear();
}

// ---------------------------------------------------------------------------
// Generic props with type-safe fields dispatch
// ---------------------------------------------------------------------------

/**
 * Recursive mapped type that mirrors a schema's shape for per-field
 * overrides. Dispatches on the schema kind in the same order as
 * {@link InferSchemaValue} so the inferred override map tracks the
 * inferred value shape.
 *
 * Exported so `<SchemaView>` and other consumers can type their
 * `fields` prop against the same machinery `<SchemaComponent>` uses.
 *
 * @group Components
 */
export type InferFields<T, Ref extends string | undefined> =
    IsSwagger2Doc<T> extends true
        ? __SchemaInferenceFellBack
        : T extends z.ZodType
          ? FieldOverrides<z.infer<T>>
          : T extends { openapi: unknown }
            ? Ref extends string
                ? FieldOverrides<
                      ResolveOpenAPIRef<T & Record<string, unknown>, Ref>
                  >
                : Record<string, FieldOverride>
            : T extends object
              ? unknown extends FromJSONSchema<T>
                  ? Record<string, FieldOverride>
                  : FieldOverrides<FromJSONSchema<T>>
              : Record<string, FieldOverride>;

/**
 * Infer the data type carried by the schema input.
 *
 * Mirrors {@link InferFields}'s dispatch order: Zod schema → `z.infer`,
 * OpenAPI doc + ref → `ResolveOpenAPIRef`, plain JSON Schema object →
 * `FromJSONSchema`, everything else → `unknown`. The `Mode` parameter
 * is plumbed through to `FromJSONSchema` / `ResolveOpenAPIRef` so
 * `readOnly` / `writeOnly` keywords participate in the inferred
 * object shape — `"output"` for the rendered value, `"input"` for the
 * `onChange` argument.
 *
 * When the schema's value type cannot be statically determined (e.g.
 * a runtime `Record<string, unknown>` JSON Schema, or an OpenAPI doc
 * without a ref), the result falls back to `unknown` so callers can
 * still supply arbitrary values.
 */
type InferSchemaValue<
    T,
    Ref extends string | undefined,
    Mode extends FromJSONSchemaMode,
> =
    IsSwagger2Doc<T> extends true
        ? __SchemaInferenceFellBack
        : T extends z.ZodType
          ? Mode extends "input"
              ? z.input<T>
              : z.output<T>
          : T extends { openapi: unknown }
            ? Ref extends string
                ? ResolveOpenAPIRef<T & Record<string, unknown>, Ref, [], Mode>
                : unknown
            : T extends object
              ?
                    | FromJSONSchema<T, Record<string, never>, [], Mode>
                    | (unknown extends FromJSONSchema<T>
                          ? unknown
                          : never) extends infer V
                  ? V
                  : unknown
              : unknown;

/**
 * Narrow an inferred value type to the sub-shape at `P`, or return
 * the original value type when `P` is `undefined` (no path supplied).
 */
type NarrowAtPath<V, P extends string | undefined> = P extends string
    ? TypeAtPath<V, P>
    : V;

/**
 * Public alias mapping a schema input to the rendered value type.
 *
 * Picks the OUTPUT side (server → client) of every transform / pipe /
 * codec. For an `<SchemaComponent io="output">` or `<SchemaView
 * io="output">` (both defaults), this is the inferred shape of
 * `value` and the parameter of `onChange`.
 */
export type InferredOutputValue<
    T,
    Ref extends string | undefined = undefined,
    P extends string | undefined = undefined,
> = NarrowAtPath<InferSchemaValue<T, Ref, "output">, P>;

/**
 * Companion to {@link InferredOutputValue} for `"input"`-mode shapes.
 *
 * Picks the INPUT side (client → server) of every transform / pipe /
 * codec. Surfaces as the inferred shape of `value` / `onChange` when
 * a consumer renders `<SchemaComponent io="input">`. For JSON Schema
 * inputs with `readOnly`/`writeOnly` annotations, the INPUT mode
 * omits properties marked `readOnly: true`.
 */
export type InferredInputValue<
    T,
    Ref extends string | undefined = undefined,
    P extends string | undefined = undefined,
> = NarrowAtPath<InferSchemaValue<T, Ref, "input">, P>;

/**
 * Resolve the schema-driven value type for either I/O direction.
 *
 * Thin convenience over {@link InferredOutputValue} /
 * {@link InferredInputValue} so consumers that decide between the
 * two at the type level (e.g. a generic wrapper component) can pass
 * the chosen direction as a type argument rather than branch on it
 * with conditional types. Falls back to `unknown` when the schema's
 * value type cannot be statically inferred, identical to the
 * underlying helpers.
 */
export type InferredValue<
    T,
    Ref extends string | undefined = undefined,
    P extends string | undefined = undefined,
    Mode extends SchemaIoSide = "output",
> = NarrowAtPath<InferSchemaValue<T, Ref, Mode>, P>;

/**
 * Props accepted by {@link SchemaComponent}.
 *
 * The generic parameters carry the inferred schema shape through to
 * `value`, `onChange`, and `fields` so a typed `schema` prop drives
 * typed props on the rest of the component.
 *
 * @group Components
 */
export interface SchemaComponentProps<
    T = unknown,
    Ref extends string | undefined = undefined,
    Mode extends SchemaIoSide = "output",
> {
    /**
     * Zod schema, JSON Schema object, or OpenAPI document.
     *
     * Zod 4 types that cannot round-trip through `z.toJSONSchema()`
     * (bigint, date, map, set, symbol, function, undefined, void, nan,
     * codec) are rejected at the type level via
     * {@link RejectUnrepresentableZod}. Runtime conversion would throw
     * `SchemaNormalisationError` with kind `zod-type-unrepresentable`
     * — the static rejection surfaces the same failure at compile time.
     */
    schema: RejectUnrepresentableZod<T>;
    /** For OpenAPI: a ref string like "#/components/schemas/User" or "/users/post". */
    ref?: Ref;
    /**
     * Which side of every transform / pipe / codec to render.
     *
     * - `"output"` (default) — renderer draws the OUTPUT side of the
     *   schema. For a `z.codec(z.string(), z.number(), …)` chain
     *   this renders a number input. `value` and `onChange` therefore
     *   carry the OUTPUT shape, and `validate` runs `safeEncode`
     *   (the reverse direction) so user-supplied OUTPUT values are
     *   validated against the codec.
     * - `"input"` — renderer draws the INPUT side instead. For the
     *   same codec this renders a string input, `value` and
     *   `onChange` carry the INPUT shape, and `validate` runs
     *   `safeParse` (the forward direction).
     *
     * The choice is propagated through `normaliseSchema` →
     * `normaliseZod4` → `z.toJSONSchema(..., { io })` so a single
     * source of truth drives both the rendered JSON Schema shape and
     * the validation direction. Has no effect for plain JSON Schema
     * or OpenAPI inputs — those advertise a single canonical shape.
     */
    io?: Mode;
    /**
     * Current value to render. Typed against `InferSchemaValue<T,
     * Ref, Mode>` so the prop tracks the schema's inferred shape for
     * the chosen `io` direction.
     *
     * Falls back to `unknown` when the schema's value type cannot be
     * statically inferred (runtime `Record<string, unknown>` JSON
     * Schemas, OpenAPI documents without a ref, etc.), so untyped
     * call sites still compile.
     *
     * Use {@link InferredOutputValue} or {@link InferredInputValue}
     * to narrow a value declared at the call site:
     *
     * ```tsx
     * const user: InferredOutputValue<typeof userSchema> = { ... };
     * <SchemaComponent schema={userSchema} value={user} readOnly />
     * ```
     */
    value?: InferSchemaValue<T, Ref, Mode>;
    /**
     * Called when the value changes (editable fields). The parameter
     * shares the same shape as {@link SchemaComponentProps.value} so
     * a controlled component can round-trip the value through React
     * state without re-shaping.
     *
     * Falls back to `unknown` for schemas whose value type cannot be
     * statically inferred — see {@link SchemaComponentProps.value}.
     */
    onChange?: (value: InferSchemaValue<T, Ref, Mode>) => void;
    /** Run schema.safeParse() on change and surface errors via onValidationError. */
    validate?: boolean;
    /** Called with the ZodError when validation fails. */
    onValidationError?: (error: unknown) => void;
    /** Called when schema normalisation or rendering fails. */
    onError?: (error: import("../core/errors.ts").SchemaError) => void;
    /** Called with each diagnostic emitted during schema processing. */
    onDiagnostic?: (diagnostic: Diagnostic) => void;
    /** When true, any diagnostic becomes a thrown error. */
    strict?: boolean;
    /** Per-field meta overrides — nested object mirroring schema shape. */
    fields?: InferFields<T, Ref>;
    /** Meta overrides applied to the root schema. */
    meta?: SchemaMeta;
    /** Convenience: sets readOnly on all fields. */
    readOnly?: boolean;
    /** Convenience: sets writeOnly on all fields. */
    writeOnly?: boolean;
    /** Convenience: sets description on the root. */
    description?: string;
    /** Instance-scoped widgets — override context and global widgets. */
    widgets?: WidgetMap;
    /**
     * Prefix used for every input `id`/label `htmlFor` in this component
     * subtree. Defaults to a per-instance value from `useId()` so multiple
     * `<SchemaComponent>` instances on the same page never collide. Override
     * for deterministic ids in screenshot tests.
     */
    idPrefix?: string;
}

// ---------------------------------------------------------------------------
// <SchemaComponent>
// ---------------------------------------------------------------------------

/**
 * Render an editable (or read-only) UI from a Zod schema, JSON Schema, or
 * OpenAPI document.
 *
 * Auto-detects the input format, normalises to JSON Schema via the
 * adapter, walks the JSON Schema tree, and delegates per-field rendering
 * to the {@link ComponentResolver} supplied via {@link SchemaProvider} —
 * falling back to a headless HTML renderer when no provider is present.
 *
 * Pass `readOnly` to render a presentational view instead of inputs, or
 * wrap with `<SchemaProvider resolver={…}>` to swap the theme.
 *
 * @group Components
 * @example
 * ```tsx
 * import { z } from "zod";
 * import { SchemaComponent } from "schema-components/react/SchemaComponent";
 *
 * const userSchema = z.object({ name: z.string(), email: z.email() });
 *
 * <SchemaComponent schema={userSchema} value={user} onChange={setUser} />
 * ```
 */
export function SchemaComponent<
    T = unknown,
    Ref extends string | undefined = undefined,
    Mode extends SchemaIoSide = "output",
>(props: SchemaComponentProps<T, Ref, Mode>): ReactNode {
    const {
        schema: schemaInput,
        ref: refInput,
        io,
        value,
        onChange,
        validate,
        onValidationError,
        onError,
        onDiagnostic,
        strict,
        fields,
        meta: componentMeta,
        readOnly,
        writeOnly,
        description,
        widgets: instanceWidgets,
        idPrefix,
    } = props;
    const userResolver = useContext(UserResolverContext);
    const contextWidgets = useContext(WidgetsContext);
    const generatedId = useId();
    const rootPath = idPrefix ?? sanitisePrefix(generatedId);

    const mergedMeta: SchemaMeta = useMemo(() => {
        const merged: SchemaMeta = { ...componentMeta };
        if (readOnly === true) merged.readOnly = true;
        if (writeOnly === true) merged.writeOnly = true;
        if (description !== undefined) merged.description = description;
        return merged;
    }, [componentMeta, readOnly, writeOnly, description]);

    const diagnostics: DiagnosticsOptions | undefined =
        onDiagnostic !== undefined || strict === true
            ? {
                  ...(onDiagnostic !== undefined
                      ? { diagnostics: onDiagnostic }
                      : {}),
                  ...(strict !== undefined ? { strict } : {}),
              }
            : undefined;

    // Normalise input → JSON Schema. The `io` option flows through to
    // `z.toJSONSchema(..., { io })` so the rendered shape and the
    // validation direction stay in lockstep.
    let jsonSchema: Record<string, unknown>;
    let zodSchema: unknown;
    let rootMeta: SchemaMeta | undefined;
    let rootDocument: Record<string, unknown>;
    try {
        const normaliseOptions =
            diagnostics !== undefined || io !== undefined
                ? {
                      ...(diagnostics !== undefined ? { diagnostics } : {}),
                      ...(io !== undefined ? { io } : {}),
                  }
                : undefined;
        const normalised = normaliseSchema(
            schemaInput,
            refInput,
            normaliseOptions
        );
        jsonSchema = normalised.jsonSchema;
        zodSchema = normalised.zodSchema;
        rootMeta = normalised.rootMeta;
        rootDocument = normalised.rootDocument;
    } catch (err: unknown) {
        // normaliseSchema already throws SchemaNormalisationError with the
        // correct kind. Only wrap genuinely unknown errors.
        const error =
            err instanceof SchemaNormalisationError
                ? err
                : new SchemaNormalisationError(
                      err instanceof Error
                          ? err.message
                          : "Failed to normalise schema",
                      schemaInput,
                      "unknown"
                  );
        if (onError !== undefined) {
            onError(error);
            return null;
        }
        throw error;
    }

    // Coerce the typed `fields` into the loose runtime record shape used
    // by both the walker (`fieldOverrides`) and the per-field error
    // dispatcher. `InferFields<T, Ref>` widens to a union that includes
    // `__SchemaInferenceFellBack` (Swagger 2.0) and typed
    // `FieldOverrides<...>` variants — none of which are structurally
    // assignable to the walker's `Record<string, unknown>` slot. The
    // narrowing happens once so the cache key for `useCallback` below
    // tracks the resolved record rather than the wider input. The
    // dispatcher and walker consume only the loose `unknown`-valued
    // record shape; per-entry validation (`isObject`, function check)
    // happens inside each consumer.
    const fieldsRecord = toRecordOrUndefined(fields);

    const handleChange = useCallback(
        (nextValue: unknown) => {
            if (validate) {
                let error: unknown;
                try {
                    error = runValidation(
                        zodSchema,
                        jsonSchema,
                        nextValue,
                        io,
                        onDiagnostic
                    );
                } catch (err: unknown) {
                    // `runValidation` only throws when the JSON Schema → Zod
                    // fallback path is taken AND no diagnostic sink is wired
                    // up. Route the structured error through `onError` if
                    // the consumer supplied one (mirroring the normalisation
                    // failure path above); otherwise re-throw so the failure
                    // surfaces in the host (event handler stack, error
                    // boundary, or test harness) rather than being silently
                    // swallowed.
                    const normalised =
                        err instanceof SchemaNormalisationError
                            ? err
                            : new SchemaNormalisationError(
                                  err instanceof Error
                                      ? err.message
                                      : "Fallback validation failed",
                                  schemaInput,
                                  "zod-conversion-failed",
                                  undefined,
                                  err
                              );
                    if (onError !== undefined) {
                        onError(normalised);
                        return;
                    }
                    throw normalised;
                }
                if (error !== undefined) {
                    // Root-level error callback
                    onValidationError?.(error);
                    // Per-field error callbacks
                    dispatchFieldErrors(fieldsRecord, error);
                }
            }
            if (onChange !== undefined) {
                // Library boundary: `nextValue` is `unknown` from the
                // walker pipeline; `onChange`'s parameter is the
                // schema's inferred typed shape. The walker only
                // emits values shaped to the same normalised JSON
                // Schema that drives `onChange`'s parameter type, so
                // the runtime call is sound. TypeScript cannot prove
                // the generic-parameter assignment, mirroring the
                // `z.toJSONSchema` library boundary in
                // `core/adapter.ts` (same `@ts-expect-error` pattern).
                // @ts-expect-error — contravariant onChange call, see
                // comment above.
                onChange(nextValue);
            }
        },
        [
            validate,
            zodSchema,
            jsonSchema,
            io,
            onChange,
            onValidationError,
            fieldsRecord,
            onDiagnostic,
            onError,
            schemaInput,
        ]
    );

    // Walk the JSON Schema tree
    const walkOptions: WalkOptions = {
        componentMeta: mergedMeta,
        rootMeta,
        fieldOverrides: fieldsRecord,
        rootDocument,
        ...(diagnostics !== undefined ? { diagnostics } : {}),
    };

    const tree = walk(jsonSchema, walkOptions);

    const makeRenderChild =
        (currentDepth: number, parentPath: string) =>
        (
            childTree: WalkedField,
            childValue: unknown,
            childOnChange: (v: unknown) => void,
            pathSuffix?: string
        ): ReactNode => {
            const childPath = joinPath(parentPath, pathSuffix);
            return renderField(
                childTree,
                childValue,
                childOnChange,
                userResolver,
                makeRenderChild(currentDepth + 1, childPath),
                childPath,
                instanceWidgets,
                contextWidgets,
                currentDepth + 1
            );
        };

    const renderChild = makeRenderChild(0, rootPath);

    const effectiveValue = value ?? tree.defaultValue;
    return renderField(
        tree,
        effectiveValue,
        handleChange,
        userResolver,
        renderChild,
        rootPath,
        instanceWidgets,
        contextWidgets,
        0
    );
}

// ---------------------------------------------------------------------------
// Path threading
// ---------------------------------------------------------------------------

/**
 * Append a child path suffix to a parent path. When the suffix is omitted
 * (e.g. transparent wrappers like union options), the parent path is
 * returned unchanged so the child inherits the parent's id.
 *
 * Bracketed array indices like `[0]` append directly so `tags` + `[0]`
 * becomes `tags[0]` rather than `tags.[0]` — matching the canonical form
 * used by `html/a11y.ts` `joinPath` and `react/fieldPath.ts` `resolvePath`,
 * which already parses bracket notation when navigating WalkedField trees.
 */
export function joinPath(parent: string, suffix: string | undefined): string {
    if (suffix === undefined || suffix.length === 0) return parent;
    if (parent.length === 0) return suffix;
    if (suffix.startsWith("[")) return `${parent}${suffix}`;
    return `${parent}.${suffix}`;
}

/**
 * Normalise a `useId()` value into a DOM-id-safe prefix. React's `useId`
 * returns values containing `:` characters (e.g. `«:r0:»`) which are
 * invalid in CSS selectors. Replace any run of non-alphanumeric characters
 * with a single hyphen and trim leading/trailing hyphens.
 */
export function sanitisePrefix(value: string): string {
    const sanitised = value
        .replace(/[^a-zA-Z0-9_]+/g, "-")
        .replace(/^-+|-+$/g, "");
    if (sanitised.length === 0) {
        throw new Error(
            `Cannot derive a DOM-safe id prefix from "${value}". Pass an explicit idPrefix prop.`
        );
    }
    return sanitised;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Run validation against the supplied value.
 *
 * Returns the validation error (Zod error or equivalent) on failure, or
 * `undefined` when the value is valid OR when the fallback validation
 * path was skipped because a diagnostic sink absorbed the conversion
 * failure.
 *
 * Throws `SchemaNormalisationError` (kind `zod-conversion-failed`) when
 * the JSON-Schema → Zod fallback is taken AND no diagnostic sink is
 * wired up. The project's no-silent-fallback rule requires the failure
 * to surface somewhere — diagnostics if the consumer opted in, an error
 * otherwise — so the caller can route it through `onError` / an error
 * boundary rather than have validation quietly disappear.
 *
 * The `io` argument mirrors the prop on `<SchemaComponent>` and
 * `<SchemaView>`. It determines which Zod entry point validates a
 * codec: `safeEncode` for the OUTPUT side (the default, matching the
 * renderer's default direction), `safeParse` for the INPUT side. For
 * non-codec schemas the choice is irrelevant — both `safeEncode` and
 * `safeParse` behave identically — so `safeParse` is used
 * unconditionally.
 */
function runValidation(
    zodSchema: unknown,
    jsonSchema: Record<string, unknown>,
    value: unknown,
    io: SchemaIoSide | undefined,
    onDiagnostic?: (diagnostic: Diagnostic) => void
): unknown {
    // Prefer original Zod schema for validation (most accurate).
    //
    // CODEC DIRECTION: the renderer draws whichever side of a
    // `z.codec(...)` chain matches the resolved `io` value (`"output"`
    // by default, `"input"` when the consumer opts in). The validation
    // entry point must match:
    //
    // - `io === "output"` → the value is in the OUTPUT shape (e.g.
    //   `number` for `z.codec(z.string(), z.number(), ...)`).
    //   `safeEncode` runs the REVERSE direction (`output → input`)
    //   and validates the supplied OUTPUT value.
    // - `io === "input"` → the value is in the INPUT shape (e.g. the
    //   string side of the same codec). `safeParse` runs the FORWARD
    //   direction and validates the INPUT value.
    //
    // Using the wrong entry point sends the value through the
    // opposite half of the codec and fails on every keystroke for any
    // codec whose two sides have different types.
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

    // Fallback: convert JSON Schema to Zod for validation. `z.fromJSONSchema`
    // throws synchronously for JSON Schema features Zod refuses to round-trip
    // (e.g. `not`, certain `allOf` shapes, `patternProperties`,
    // `dependentSchemas`). The render itself only depends on the
    // (already-normalised) JSON Schema, so the failure is isolated to the
    // validation step — but it must not be silently dropped. When a
    // diagnostic sink is wired up, emit `unsupported-type` and skip the
    // validation step. Otherwise raise a structured error so the caller
    // can route it via `onError` or an error boundary.
    let parsed: unknown;
    try {
        parsed = z.fromJSONSchema(jsonSchema);
    } catch (err) {
        if (onDiagnostic !== undefined) {
            const message =
                err instanceof Error
                    ? err.message
                    : "z.fromJSONSchema threw a non-Error value";
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
        const message =
            err instanceof Error
                ? err.message
                : "z.fromJSONSchema threw a non-Error value";
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

// ---------------------------------------------------------------------------
// Field rendering — delegates to resolver or headless fallback
// ---------------------------------------------------------------------------

/**
 * Render a single walked field through the resolved widget /
 * resolver / headless pipeline. Used internally by
 * {@link SchemaComponent} and {@link SchemaField}, exported so other
 * React-side components (e.g. the OpenAPI renderers) can dispatch
 * into the same fallback chain.
 */
export function renderField(
    tree: WalkedField,
    value: unknown,
    onChange: (v: unknown) => void,
    userResolver: ComponentResolver | undefined,
    renderChild: (
        tree: WalkedField,
        value: unknown,
        onChange: (v: unknown) => void,
        pathSuffix?: string
    ) => ReactNode,
    path: string,
    instanceWidgets?: WidgetMap,
    contextWidgets?: WidgetMap,
    depth = 0
): ReactNode {
    if (path.length === 0) {
        throw new Error(
            "renderField requires a non-empty path. Pass the root path " +
                "(derived from `idPrefix` or `useId()`) for the root field, " +
                "and use renderChild's pathSuffix to derive child paths."
        );
    }
    // 0. Depth limit — prevent infinite recursion on circular schemas
    if (depth >= MAX_RENDER_DEPTH) {
        const label =
            typeof tree.meta.description === "string"
                ? tree.meta.description
                : "schema";
        return (
            <fieldset>
                <em>↻ {label} (recursive)</em>
            </fieldset>
        );
    }

    // 1. Check widget registry for .meta({ component }) hint
    //    Resolution order: instance → context → global
    const componentHint = tree.meta.component;
    if (typeof componentHint === "string") {
        const widget =
            instanceWidgets?.get(componentHint) ??
            contextWidgets?.get(componentHint) ??
            globalWidgets.get(componentHint);
        if (widget !== undefined) {
            const props = buildRenderProps(
                tree,
                value,
                onChange,
                renderChild,
                path
            );
            const result: unknown = widget(props);
            if (result !== undefined && result !== null) {
                if (isValidElement(result)) return result;
                if (typeof result === "string" || typeof result === "number")
                    return result;
                return null;
            }
        }
    }

    // 2. Build merged resolver: user overrides → headless fallback
    const resolver =
        userResolver !== undefined
            ? mergeResolvers(userResolver, headlessResolver)
            : headlessResolver;

    // 3. Look up the render function for this schema type
    const renderFn = getRenderFunction(tree.type, resolver);
    if (renderFn !== undefined) {
        let result: unknown;
        try {
            result = renderFn(
                buildRenderProps(tree, value, onChange, renderChild, path)
            );
        } catch (err: unknown) {
            throw new SchemaRenderError(
                err instanceof Error
                    ? err.message
                    : `Render function threw for type "${tree.type}"`,
                tree,
                tree.type,
                err
            );
        }
        // Resolver returned null — propagate (e.g. empty array suppressed
        // in read-only mode). Do NOT fall through to the final fallback.
        if (result === null || result === undefined) return null;
        if (isValidElement(result)) return result;
        if (typeof result === "string" || typeof result === "number")
            return result;
    }

    // 4. Final fallback for unhandled types
    if (value === undefined || value === null) return <span>—</span>;
    return (
        <span>{typeof value === "string" ? value : JSON.stringify(value)}</span>
    );
}

// buildRenderProps and mergeResolvers imported from core/renderer.ts

// ---------------------------------------------------------------------------
// <SchemaField> — renders a single field from a schema by path
// ---------------------------------------------------------------------------

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
    /**
     * Dot-separated path to the field (e.g. "address.city").
     * When the schema is a Zod schema or typed `as const`, only valid
     * paths are accepted. Falls back to `string` for runtime schemas.
     */
    path: P;
    /**
     * The schema to extract the field from. Subject to the same
     * unrepresentable-Zod rejection as {@link SchemaComponentProps.schema}.
     */
    schema: RejectUnrepresentableZod<T>;
    /** For OpenAPI: a ref string. */
    ref?: Ref;
    /** Current value of the field at the given path. */
    value?: unknown;
    /** Called with the updated root value when this field changes. */
    onChange?: (value: unknown) => void;
    /** Override meta for this specific field. */
    meta?: SchemaMeta;
    /** Run validation on change. */
    validate?: boolean;
    onValidationError?: (error: unknown) => void;
}

/**
 * Render a single field from a schema by dot-separated `path`.
 *
 * Walks the full schema tree and resolves the field at the supplied
 * `path`, then renders only that field through the same resolver
 * pipeline as {@link SchemaComponent}. Useful for embedding individual
 * fields inside bespoke layouts.
 *
 * @group Components
 */
export function SchemaField<
    T = unknown,
    Ref extends string | undefined = undefined,
    // Keep the default aligned with `SchemaFieldProps['P']`'s default so
    // path narrowing survives at the call site. Earlier revisions
    // collapsed `P` to `string` here, which silently undid the
    // autocomplete-narrowing the interface offers.
    P extends string =
        | PathOfType<InferSchemaType<T>>
        | (string extends PathOfType<InferSchemaType<T>> ? string : never),
>({
    path,
    schema: schemaInput,
    ref: refInput,
    value,
    onChange,
    meta: fieldMeta,
    validate,
    onValidationError,
}: SchemaFieldProps<T, Ref, P>): ReactNode {
    const userResolver = useContext(UserResolverContext);
    const contextWidgets = useContext(WidgetsContext);
    const generatedId = useId();

    let jsonSchema: Record<string, unknown>;
    let zodSchema: unknown;
    let rootMeta: SchemaMeta | undefined;
    let rootDocument: Record<string, unknown>;
    try {
        const normalised = normaliseSchema(schemaInput, refInput);
        jsonSchema = normalised.jsonSchema;
        zodSchema = normalised.zodSchema;
        rootMeta = normalised.rootMeta;
        rootDocument = normalised.rootDocument;
    } catch (err: unknown) {
        // normaliseSchema already throws SchemaNormalisationError with the
        // correct kind. Only wrap genuinely unknown errors.
        if (err instanceof SchemaNormalisationError) throw err;
        throw new SchemaNormalisationError(
            err instanceof Error ? err.message : "Failed to normalise schema",
            schemaInput,
            "unknown"
        );
    }

    const walkOptions: WalkOptions = {
        componentMeta: fieldMeta,
        rootMeta,
        rootDocument,
    };

    const fullTree = walk(jsonSchema, walkOptions);
    const fieldTree = resolvePath(fullTree, path);
    if (fieldTree === undefined) {
        throw new SchemaFieldError(
            `Field not found: ${path}`,
            schemaInput,
            path
        );
    }

    const fieldValue = resolveValue(value, path);

    const handleChange = useCallback(
        (nextFieldValue: unknown) => {
            // Compute the next root value once. Earlier revisions called
            // `setNestedValue` a second time inside the `validate` branch,
            // doubling the per-change cost on deep paths for no benefit.
            const newRootValue = setNestedValue(value, path, nextFieldValue);
            if (validate) {
                // SchemaField does not (yet) expose an `io` prop, so
                // validation runs against the default OUTPUT side.
                // When `SchemaField` grows an `io` prop it should be
                // threaded here to mirror the SchemaComponent path.
                const error = runValidation(
                    zodSchema,
                    jsonSchema,
                    newRootValue,
                    undefined
                );
                if (error !== undefined) {
                    onValidationError?.(error);
                }
            }
            onChange?.(newRootValue);
        },
        [
            validate,
            zodSchema,
            jsonSchema,
            value,
            path,
            onChange,
            onValidationError,
        ]
    );

    const makeRenderChild =
        (currentDepth: number, parentPath: string) =>
        (
            childTree: WalkedField,
            childValue: unknown,
            childOnChange: (v: unknown) => void,
            pathSuffix?: string
        ): ReactNode => {
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

    // SchemaField always renders a specific path within the schema. Combine
    // a per-instance prefix with the requested path so generated ids stay
    // unique across multiple <SchemaField> instances on the same page.
    const rootPath = joinPath(sanitisePrefix(generatedId), path);
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
// Per-field error dispatch
// ---------------------------------------------------------------------------

/**
 * Dispatch Zod errors to per-field onValidationError callbacks.
 * Walks the fields override tree and matches errors by path prefix.
 *
 * The runtime shape of `fields` is always `Record<string, FieldOverride>`
 * after `InferFields<T, Ref>` is erased — the typed variants
 * (`FieldOverrides<U>`) and the loose `Record<string, FieldOverride>`
 * fallback share the same structural shape, so the dispatch logic only
 * needs the loose record. The previous parameter union
 * (`Record<string, FieldOverride> | FieldOverrides<unknown> |
 * undefined`) collapsed because `FieldOverrides<unknown>` reduces to
 * `{}`, contributing no extra precision while adding noise to readers.
 */
function dispatchFieldErrors(
    fields: Record<string, unknown> | undefined,
    error: unknown
): void {
    if (fields === undefined || !isObject(error)) return;

    // Zod errors have issues[] with path[] arrays
    if (!("issues" in error)) return;
    const issues = error.issues;
    if (!Array.isArray(issues)) return;

    for (const [key, override] of Object.entries(fields)) {
        if (override === undefined || typeof override !== "object") continue;
        if (override === null) continue;

        // Check if the override has an onValidationError callback
        if (!("onValidationError" in override)) continue;
        const fieldCallback = override.onValidationError;
        if (typeof fieldCallback !== "function") continue;

        // Collect errors whose path starts with this key
        const fieldErrors = issues.filter((issue: unknown): boolean => {
            if (!isObject(issue)) return false;
            if (!("path" in issue)) return false;
            const path: unknown = issue.path;
            if (!Array.isArray(path)) return false;
            const firstSegment: unknown = path[0];
            return firstSegment === key;
        });

        if (fieldErrors.length > 0 && isFieldErrorCallback(fieldCallback)) {
            fieldCallback({ issues: fieldErrors });
        }
    }
}

function isFieldErrorCallback(
    value: unknown
): value is (error: { issues: unknown[] }) => void {
    return typeof value === "function";
}

// ---------------------------------------------------------------------------
// Narrowing helpers
// ---------------------------------------------------------------------------

// Narrowing helpers imported from core/guards.ts.
// `isCodecSchema` is imported from core/adapter.ts so the codec trait
// check has one canonical implementation. `isCallable` stays local —
// it is the validation boundary's structural check for a callable
// `safeParse` / `safeEncode` / `safeDecode` member on a Zod schema.

function isCallable(value: unknown): value is (...args: unknown[]) => unknown {
    return typeof value === "function";
}
