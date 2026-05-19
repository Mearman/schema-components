/** @jsxImportSource solid-js */
/**
 * `<SchemaComponent>` — Solid renderer for Zod, JSON Schema, or OpenAPI
 * inputs.
 *
 * Auto-detects the input format, normalises it to canonical JSON Schema
 * via the shared adapter, walks the JSON Schema tree, and delegates
 * per-field rendering to the {@link SolidComponentResolver} supplied via
 * {@link SchemaProvider} — falling back to the headless renderer when
 * no provider sits above this component.
 *
 * Key differences from the React adapter:
 *
 * - State is held in plain Solid signals (`createSignal`) rather than
 *   React's `useState`; the renderer does not keep its own copy of
 *   `value` — controlled mode is the only supported pattern, matching
 *   the React surface.
 * - There are no per-render hooks. `useId` is replaced by
 *   `createUniqueId()`; `useMemo` / `useCallback` are unnecessary
 *   because Solid's fine-grained reactivity already avoids the
 *   re-allocation costs they exist to mitigate in React.
 * - `splitProps` separates the renderer-internal props from those
 *   forwarded to the host primitive.
 * - Context propagation uses Solid's `createContext` /
 *   `<Context.Provider>` (re-exported via `solid/contexts.ts`) — the
 *   public API matches the React `<SchemaProvider>` shape.
 */

import { z } from "zod";
import {
    createMemo,
    createUniqueId,
    splitProps,
    useContext,
    type JSX,
} from "solid-js";
import { walk } from "../core/walker.ts";
import type { WalkOptions } from "../core/walkBuilders.ts";
import {
    isCodecSchema,
    normaliseSchema,
    type SchemaIoSide,
} from "../core/adapter.ts";
import { MAX_RENDER_DEPTH } from "../core/limits.ts";
import { isObject, toRecordOrUndefined } from "../core/guards.ts";
import { SchemaNormalisationError, SchemaRenderError } from "../core/errors.ts";
import type { SchemaMeta, WalkedField } from "../core/types.ts";
import type { RejectUnrepresentableZod } from "../core/typeInference.ts";
import type {
    InferFields,
    InferredInputValue,
    InferredOutputValue,
    InferredValue,
    InferSchemaValue,
} from "../core/inferValue.ts";
import type { DiagnosticsOptions, Diagnostic } from "../core/diagnostics.ts";
import { UserResolverContext, WidgetsContext } from "./contexts.ts";
import { headlessSolidResolver } from "./headless.ts";
import { lookupGlobalSolidWidget } from "./widget.ts";
import type {
    SolidComponentResolver,
    SolidRenderFunction,
    SolidRenderProps,
    SolidWidgetMap,
} from "./types.ts";

// Re-export inference helpers so the public Solid surface mirrors the
// React surface exactly. Consumers can write
// `InferredOutputValue<typeof schema>` against the Solid entry point.
export type {
    InferFields,
    InferredOutputValue,
    InferredInputValue,
    InferredValue,
};

// ---------------------------------------------------------------------------
// SchemaProvider — context-binding for resolver + widgets
// ---------------------------------------------------------------------------

/**
 * Provide a theme resolver and scoped widgets to every
 * `<SchemaComponent>` rendered inside the subtree.
 *
 * Wrap an application (or a region of it) with `<SchemaProvider>` so a
 * single resolver — typically a custom Solid `SolidComponentResolver`
 * — drives every schema render. Without a provider the headless
 * resolver is used.
 *
 * @group Components
 * @example
 * ```tsx
 * import { SchemaProvider, SchemaComponent } from "schema-components/solid/SchemaComponent";
 *
 * <SchemaProvider resolver={customResolver}>
 *   <SchemaComponent schema={userSchema} value={user} onChange={setUser} />
 * </SchemaProvider>
 * ```
 */
export function SchemaProvider(props: {
    resolver: SolidComponentResolver;
    widgets?: SolidWidgetMap;
    children: JSX.Element;
}): JSX.Element {
    return (
        <UserResolverContext.Provider value={props.resolver}>
            <WidgetsContext.Provider value={props.widgets}>
                {props.children}
            </WidgetsContext.Provider>
        </UserResolverContext.Provider>
    );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

/**
 * Props accepted by {@link SchemaComponent}.
 *
 * Mirrors `react/SchemaComponent`'s `SchemaComponentProps` shape — the
 * generic parameters carry the inferred schema shape through to
 * `value`, `onChange`, and `fields` so a typed `schema` prop drives
 * typed props on the rest of the component.
 *
 * @group Components
 */
export interface SchemaComponentProps<
    T = unknown,
    SchemaRef extends string | undefined = undefined,
    Mode extends SchemaIoSide = "output",
> {
    /** Zod schema, JSON Schema object, or OpenAPI document. */
    schema: RejectUnrepresentableZod<T>;
    /** For OpenAPI: a ref string like `"#/components/schemas/User"`. */
    schemaRef?: SchemaRef;
    /** Which side of every transform / pipe / codec to render. */
    io?: Mode;
    /** Current value to render — typed against the schema's inferred shape. */
    value?: InferSchemaValue<T, SchemaRef, Mode>;
    /** Called when the value changes; receives the next value. */
    onChange?: (value: InferSchemaValue<T, SchemaRef, Mode>) => void;
    /** Run `safeParse` / `safeEncode` on change and route errors. */
    validate?: boolean;
    /** Called with the validation error when validation fails. */
    onValidationError?: (error: unknown) => void;
    /** Called when schema normalisation or rendering fails. */
    onError?: (error: import("../core/errors.ts").SchemaError) => void;
    /** Called with each diagnostic emitted during schema processing. */
    onDiagnostic?: (diagnostic: Diagnostic) => void;
    /** When true, any diagnostic becomes a thrown error. */
    strict?: boolean;
    /** Per-field meta overrides — nested object mirroring schema shape. */
    fields?: InferFields<T, SchemaRef>;
    /** Meta overrides applied to the root schema. */
    meta?: SchemaMeta;
    /** Convenience: sets readOnly on all fields. */
    readOnly?: boolean;
    /** Convenience: sets writeOnly on all fields. */
    writeOnly?: boolean;
    /** Convenience: sets description on the root. */
    description?: string;
    /** Instance-scoped widgets — override context and global widgets. */
    widgets?: SolidWidgetMap;
    /**
     * Prefix used for every input `id` / label `for` in this component
     * subtree. Defaults to a per-instance value from `createUniqueId()`
     * so multiple `<SchemaComponent>` instances on the same page never
     * collide. Override for deterministic ids in screenshot tests.
     */
    idPrefix?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Append a child path suffix to a parent path. When the suffix is
 * omitted (e.g. transparent wrappers like union options) the parent
 * path is returned unchanged so the child inherits the parent's id.
 *
 * Bracketed array indices like `"[0]"` append directly so `tags` +
 * `"[0]"` becomes `tags[0]` rather than `tags.[0]` — matching the
 * canonical form used by every shared id helper in `core/idPath.ts`.
 */
export function joinPath(parent: string, suffix: string | undefined): string {
    if (suffix === undefined || suffix.length === 0) return parent;
    if (parent.length === 0) return suffix;
    if (suffix.startsWith("[")) return `${parent}${suffix}`;
    return `${parent}.${suffix}`;
}

/**
 * Normalise a `createUniqueId()` value into a DOM-id-safe prefix.
 * Solid's `createUniqueId()` already returns a usable id, but consumers
 * may also pass a label-derived string. Replace any run of
 * non-alphanumeric characters with a single hyphen and trim leading
 * and trailing hyphens.
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
// Field rendering — widget / resolver / fallback chain
// ---------------------------------------------------------------------------

/**
 * Render a single walked field through the resolved widget / resolver /
 * headless pipeline. Used internally by {@link SchemaComponent} and
 * exported so other Solid-side components (e.g. theme adapters) can
 * dispatch into the same fallback chain.
 */
export function renderField(
    tree: WalkedField,
    value: unknown,
    onChange: (v: unknown) => void,
    userResolver: SolidComponentResolver | undefined,
    renderChild: (
        tree: WalkedField,
        value: unknown,
        onChange: (v: unknown) => void,
        pathSuffix?: string
    ) => JSX.Element,
    path: string,
    instanceWidgets?: SolidWidgetMap,
    contextWidgets?: SolidWidgetMap,
    depth = 0
): JSX.Element {
    if (path.length === 0) {
        throw new Error(
            "renderField requires a non-empty path. Pass the root path " +
                "(derived from `idPrefix` or `createUniqueId()`) for the " +
                "root field, and use renderChild's pathSuffix to derive " +
                "child paths."
        );
    }

    // 0. Depth limit — prevent infinite recursion on circular schemas.
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

    // 1. Widget hint — instance → context → global.
    const componentHint = tree.meta.component;
    if (typeof componentHint === "string") {
        const widget =
            instanceWidgets?.get(componentHint) ??
            contextWidgets?.get(componentHint) ??
            lookupGlobalSolidWidget(componentHint);
        if (widget !== undefined) {
            const props = buildSolidProps(
                tree,
                value,
                onChange,
                renderChild,
                path
            );
            const result = widget(props);
            if (result !== null && result !== undefined) return result;
        }
    }

    // 2. Merged resolver: user overrides → headless fallback.
    const resolver: SolidComponentResolver =
        userResolver !== undefined
            ? mergeSolidResolvers(userResolver, headlessSolidResolver)
            : headlessSolidResolver;

    // 3. Look up the render function for this schema type.
    const renderFn = getSolidRenderFunction(tree.type, resolver);
    if (renderFn !== undefined) {
        let result: JSX.Element;
        try {
            result = renderFn(
                buildSolidProps(tree, value, onChange, renderChild, path)
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
        if (result !== null && result !== undefined) return result;
    }

    // 4. Final fallback for unhandled types / null resolver returns.
    if (value === undefined || value === null) return <span>—</span>;
    return (
        <span>{typeof value === "string" ? value : JSON.stringify(value)}</span>
    );
}

/**
 * Build the Solid render props for a single field. Inlines the
 * editability resolution from `core/renderer.ts` `buildRenderProps`
 * because the React variant of that helper types its `renderChild`
 * parameter against React's `renderChild` signature (returns
 * `unknown`); Solid's signature returns `JSX.Element`, so we
 * compose the same shape locally rather than route through a function
 * whose static type does not accept the Solid signature.
 *
 * Editability resolution matches `buildRenderProps`:
 *
 * - `readOnly` is forced to `true` if `onChange` was supplied as the
 *   no-op (i.e. the caller passed `undefined`); the dispatcher does
 *   not currently exercise the read-only path on this surface (the
 *   Solid `<SchemaView>` component handles that) but the contract is
 *   the same.
 * - `writeOnly` is taken from `tree.editability === "input"`.
 */
function buildSolidProps(
    tree: WalkedField,
    value: unknown,
    onChange: (v: unknown) => void,
    renderChild: (
        tree: WalkedField,
        value: unknown,
        onChange: (v: unknown) => void,
        pathSuffix?: string
    ) => JSX.Element,
    path: string
): SolidRenderProps {
    // Mirror the read-only/write-only resolution that
    // `core/renderer.ts` `buildRenderProps` performs. The Solid
    // `<SchemaComponent>` always supplies a real `onChange` callback;
    // editability is therefore driven purely by `tree.editability`.
    const isReadOnly = tree.editability === "presentation";
    const isWriteOnly = tree.editability === "input";

    const props: SolidRenderProps = {
        value,
        readOnly: isReadOnly,
        writeOnly: isWriteOnly,
        meta: tree.meta,
        constraints: tree.constraints,
        path,
        tree,
        onChange,
        renderChild,
    };
    if (tree.examples !== undefined) props.examples = tree.examples;
    return props;
}

/**
 * Merge two `SolidComponentResolver` instances — user values win,
 * fallback fills gaps. Local parallel to `core/renderer.ts`
 * `mergeResolvers` (which is typed against React's resolver shape).
 */
function mergeSolidResolvers(
    user: SolidComponentResolver,
    fallback: SolidComponentResolver
): SolidComponentResolver {
    const merged: SolidComponentResolver = {};
    const keys: (keyof SolidComponentResolver)[] = [
        "string",
        "number",
        "boolean",
        "null",
        "enum",
        "object",
        "array",
        "tuple",
        "record",
        "union",
        "discriminatedUnion",
        "conditional",
        "negation",
        "literal",
        "file",
        "never",
        "unknown",
    ];
    for (const key of keys) {
        const fn = user[key] ?? fallback[key];
        if (fn !== undefined) {
            merged[key] = fn;
        }
    }
    return merged;
}

/** Look up the render function for a schema type in a Solid resolver. */
function getSolidRenderFunction(
    type: WalkedField["type"],
    resolver: SolidComponentResolver
): SolidRenderFunction | undefined {
    return resolver[type];
}

// ---------------------------------------------------------------------------
// SchemaComponent
// ---------------------------------------------------------------------------

/**
 * Render an editable (or read-only) UI from a Zod schema, JSON Schema,
 * or OpenAPI document.
 *
 * Auto-detects the input format, normalises to JSON Schema via the
 * shared adapter, walks the JSON Schema tree, and delegates per-field
 * rendering to the {@link SolidComponentResolver} supplied via
 * {@link SchemaProvider} — falling back to the headless renderer when
 * no provider is present.
 *
 * Pass `readOnly` to render a presentational view instead of inputs.
 *
 * @group Components
 * @example
 * ```tsx
 * import { z } from "zod";
 * import { SchemaComponent } from "schema-components/solid/SchemaComponent";
 *
 * const userSchema = z.object({ name: z.string(), email: z.email() });
 *
 * <SchemaComponent schema={userSchema} value={user} onChange={setUser} />
 * ```
 */
export function SchemaComponent<
    T = unknown,
    SchemaRef extends string | undefined = undefined,
    Mode extends SchemaIoSide = "output",
>(props: SchemaComponentProps<T, SchemaRef, Mode>): JSX.Element {
    const [, rest] = splitProps(props, ["schema"]);
    // Re-borrow `schema` after `splitProps` so the destructure does not
    // pull the value off the live props proxy.
    const schemaInput = props.schema;
    const generatedId = createUniqueId();

    const userResolver = readUserResolver();
    const contextWidgets = readWidgets();

    // A memo over the props ensures the schema normalisation pipeline
    // re-runs only when the inputs that drive it actually change. Solid's
    // reactivity tracks each accessed prop key automatically, so passing
    // `props` itself is sufficient — no manual dependency list.
    const computed = createMemo(() => {
        const componentMeta = rest.meta;
        const readOnly = rest.readOnly;
        const writeOnly = rest.writeOnly;
        const description = rest.description;
        const onDiagnostic = rest.onDiagnostic;
        const strict = rest.strict;
        const io = rest.io;
        const refInput = rest.schemaRef;
        const onError = rest.onError;
        const idPrefix = rest.idPrefix;

        const mergedMeta: SchemaMeta = { ...componentMeta };
        if (readOnly === true) mergedMeta.readOnly = true;
        if (writeOnly === true) mergedMeta.writeOnly = true;
        if (description !== undefined) mergedMeta.description = description;

        const diagnostics: DiagnosticsOptions | undefined =
            onDiagnostic !== undefined || strict === true
                ? {
                      ...(onDiagnostic !== undefined
                          ? { diagnostics: onDiagnostic }
                          : {}),
                      ...(strict !== undefined ? { strict } : {}),
                  }
                : undefined;

        let jsonSchema: Record<string, unknown> | undefined;
        let zodSchema: unknown;
        let rootMeta: SchemaMeta | undefined;
        let rootDocument: Record<string, unknown> | undefined;
        let normaliseError: SchemaNormalisationError | undefined;
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
            normaliseError =
                err instanceof SchemaNormalisationError
                    ? err
                    : new SchemaNormalisationError(
                          err instanceof Error
                              ? err.message
                              : "Failed to normalise schema",
                          schemaInput,
                          "unknown"
                      );
        }

        const rootPath = idPrefix ?? sanitisePrefix(generatedId);

        return {
            jsonSchema,
            zodSchema,
            rootMeta,
            rootDocument,
            mergedMeta,
            diagnostics,
            normaliseError,
            rootPath,
            onError,
            io,
        };
    });

    const renderTree = () => {
        const {
            jsonSchema,
            zodSchema,
            rootMeta,
            rootDocument,
            mergedMeta,
            diagnostics,
            normaliseError,
            rootPath,
            onError,
            io,
        } = computed();

        if (normaliseError !== undefined) {
            if (onError !== undefined) {
                onError(normaliseError);
                return null;
            }
            throw normaliseError;
        }
        if (jsonSchema === undefined || rootDocument === undefined) {
            return null;
        }

        const fieldsRecord = toRecordOrUndefined(rest.fields);

        const walkOptions: WalkOptions = {
            componentMeta: mergedMeta,
            rootMeta,
            fieldOverrides: fieldsRecord,
            rootDocument,
            ...(diagnostics !== undefined ? { diagnostics } : {}),
        };

        const tree = walk(jsonSchema, walkOptions);

        const handleChange = (nextValue: unknown) => {
            if (rest.validate === true) {
                const error = runValidation(
                    zodSchema,
                    jsonSchema,
                    nextValue,
                    io,
                    rest.onDiagnostic
                );
                if (error !== undefined) {
                    rest.onValidationError?.(error);
                    dispatchFieldErrors(fieldsRecord, error);
                }
            }
            if (rest.onChange !== undefined) {
                // The walker pipeline yields `unknown`; `onChange`
                // accepts the schema's inferred typed shape. The two
                // are guaranteed structurally equivalent by
                // construction. TypeScript cannot prove the
                // generic-parameter assignment — same library boundary
                // as `react/SchemaComponent.tsx`.
                // @ts-expect-error — contravariant onChange call, see
                // comment above.
                rest.onChange(nextValue);
            }
        };

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
                    rest.widgets,
                    contextWidgets,
                    currentDepth + 1
                );
            };

        const renderChild = makeRenderChild(0, rootPath);

        const effectiveValue = rest.value ?? tree.defaultValue;
        return renderField(
            tree,
            effectiveValue,
            handleChange,
            userResolver,
            renderChild,
            rootPath,
            rest.widgets,
            contextWidgets,
            0
        );
    };

    return renderTree();
}

// ---------------------------------------------------------------------------
// Context accessors — read the current binding inside a component body
// and return a closure so dispatchers can defer the read until call
// time. Solid's useContext must be called inside a tracked scope, so
// the closure form lets the calling component (rather than the helper)
// own the subscription.
// ---------------------------------------------------------------------------

function readUserResolver(): SolidComponentResolver | undefined {
    return useContext(UserResolverContext);
}

function readWidgets(): SolidWidgetMap | undefined {
    return useContext(WidgetsContext);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Run validation against the supplied value.
 *
 * Mirrors the React adapter's `runValidation`. Returns the validation
 * error on failure or `undefined` when the value is valid. Throws
 * `SchemaNormalisationError` (kind `zod-conversion-failed`) when the
 * `z.fromJSONSchema` fallback path is taken AND no diagnostic sink
 * is wired up — mirroring the React adapter's no-silent-fallback
 * contract.
 */
function runValidation(
    zodSchema: unknown,
    jsonSchema: Record<string, unknown>,
    value: unknown,
    io: SchemaIoSide | undefined,
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

function isCallable(value: unknown): value is (...args: unknown[]) => unknown {
    return typeof value === "function";
}

// ---------------------------------------------------------------------------
// Per-field error dispatch
// ---------------------------------------------------------------------------

function dispatchFieldErrors(
    fields: Record<string, unknown> | undefined,
    error: unknown
): void {
    if (fields === undefined || !isObject(error)) return;
    if (!("issues" in error)) return;
    const issues = error.issues;
    if (!Array.isArray(issues)) return;

    for (const [key, override] of Object.entries(fields)) {
        if (override === undefined || typeof override !== "object") continue;
        if (override === null) continue;
        if (!("onValidationError" in override)) continue;
        const fieldCallback = override.onValidationError;
        if (typeof fieldCallback !== "function") continue;

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
