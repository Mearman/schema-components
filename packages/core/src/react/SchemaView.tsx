/**
 * React Server Component for read-only schema rendering.
 *
 * Uses no React state, context, or effects — no `useContext`, `useMemo`,
 * `useCallback`, `useState`, or `useEffect`. The single hook called is
 * `useId()`, which is one of the few hooks permitted inside a React
 * Server Component (it is RSC-safe by design) and is used solely to
 * derive a stable per-instance `idPrefix`. The component therefore runs
 * in an RSC environment without the `"use client"` directive.
 *
 * **Read-only only.** For interactive forms with `onChange`, use
 * `<SchemaComponent>` (which requires `"use client"`).
 *
 * Usage in a Server Component:
 * ```tsx
 * import { SchemaView } from "schema-components/react/SchemaView";
 *
 * export default async function Page() {
 *   const user = await getUser();
 *   return <SchemaView schema={userSchema} value={user} />;
 * }
 * ```
 *
 * The `resolver` prop replaces the `SchemaProvider` context —
 * Server Components cannot use React context, so the resolver
 * is passed explicitly.
 */

import { createElement, isValidElement, useId, type ReactNode } from "react";
import type {
    ComponentResolver,
    RenderProps,
    WidgetMap,
} from "../core/renderer.ts";
import {
    buildRenderProps,
    getRenderFunction,
    mergeResolvers,
} from "../core/renderer.ts";
import {
    joinPath,
    sanitisePrefix,
    type InferFields,
    type InferredValue,
} from "./SchemaComponent.tsx";
import { headlessResolver } from "./headless.tsx";
import { normaliseSchema, type SchemaIoSide } from "../core/adapter.ts";
import { MAX_RENDER_DEPTH } from "../core/limits.ts";
import { walk } from "../core/walker.ts";
import type { WalkOptions } from "../core/walkBuilders.ts";
import type { SchemaMeta, WalkedField } from "../core/types.ts";
import { SchemaNormalisationError, SchemaRenderError } from "../core/errors.ts";
import { toRecordOrUndefined } from "../core/guards.ts";
import type { DiagnosticsOptions, Diagnostic } from "../core/diagnostics.ts";
import type { RejectUnrepresentableZod } from "../core/typeInference.ts";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

/**
 * Props accepted by {@link SchemaView}.
 *
 * Mirrors `SchemaComponentProps` for the read-only / RSC path — no
 * `onChange`, no `validate`, and the theme is supplied via the
 * `resolver` prop because Server Components cannot read React context.
 *
 * @group Components
 */
export interface SchemaViewProps<
    T = unknown,
    Ref extends string | undefined = undefined,
    Mode extends SchemaIoSide = "output",
> {
    /**
     * Zod schema, JSON Schema object, or OpenAPI document.
     *
     * Subject to the same compile-time rejection of unrepresentable
     * Zod 4 types as the `schema` prop on `<SchemaComponent>` — see
     * {@link RejectUnrepresentableZod}.
     */
    schema: RejectUnrepresentableZod<T>;
    /** For OpenAPI: a ref string like "#/components/schemas/User". */
    ref?: Ref;
    /**
     * Which side of every transform / pipe / codec to render. Mirrors
     * `<SchemaComponent io>`. Defaults to `"output"` — the inferred
     * shape consumers receive from the server. Switch to `"input"`
     * to render the INPUT side (omits `readOnly` properties for
     * JSON Schema inputs, picks the input half of a `z.codec(...)`).
     * Has no effect for plain JSON Schema or OpenAPI inputs without
     * codec/transform constructs.
     */
    io?: Mode;
    /**
     * Current value to render. Typed against `InferSchemaValue<T,
     * Ref, Mode>` so the prop tracks the schema's inferred shape for
     * the chosen `io` direction. Falls back to `unknown` for runtime
     * schemas where the value type cannot be statically inferred.
     */
    value?: InferredValue<T, Ref, undefined, Mode>;
    /**
     * Per-field meta overrides — nested object mirroring schema shape.
     * Typed against {@link InferFields} so a typed `schema` prop drives
     * autocomplete on the override map, matching `<SchemaComponent>`.
     */
    fields?: InferFields<T, Ref>;
    /** Meta overrides applied to the root schema. */
    meta?: SchemaMeta;
    /** Convenience: sets description on the root. */
    description?: string;
    /**
     * Theme resolver. In a Server Component you pass this explicitly
     * since `SchemaProvider` (React context) is unavailable.
     * Falls back to the headless resolver if omitted.
     */
    resolver?: ComponentResolver;
    /** Instance-scoped widgets. */
    widgets?: WidgetMap;
    /** Called with each diagnostic emitted during schema processing. */
    onDiagnostic?: (diagnostic: Diagnostic) => void;
    /** When true, any diagnostic becomes a thrown error. */
    strict?: boolean;
    /**
     * Prefix used for every input `id`/label `htmlFor` in this view subtree.
     * Defaults to a per-instance value from `useId()`; pass a deterministic
     * value when stable ids matter (e.g. snapshot tests).
     */
    idPrefix?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Read-only schema renderer that is safe to use inside a React Server
 * Component.
 *
 * Uses no context, state, or effects — the only hook called is
 * `useId()`, which is RSC-safe. Always renders read-only; pair with
 * `SchemaComponent` (which requires `"use client"`) when an editable
 * form is required. Because Server Components cannot read React
 * context, the theme adapter is passed via the `resolver` prop rather
 * than `SchemaProvider`.
 *
 * @group Components
 * @example
 * ```tsx
 * import { SchemaView } from "schema-components/react/SchemaView";
 *
 * export default async function Page() {
 *   const user = await getUser();
 *   return <SchemaView schema={userSchema} value={user} />;
 * }
 * ```
 */
export function SchemaView<
    T = unknown,
    Ref extends string | undefined = undefined,
    Mode extends SchemaIoSide = "output",
>({
    schema: schemaInput,
    ref: refInput,
    io,
    value,
    fields,
    meta: componentMeta,
    description,
    resolver,
    widgets,
    onDiagnostic,
    strict,
    idPrefix,
}: SchemaViewProps<T, Ref, Mode>): ReactNode {
    const generatedId = useId();
    const rootPath = idPrefix ?? sanitisePrefix(generatedId);
    const mergedMeta: SchemaMeta = { ...componentMeta, readOnly: true };
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

    // Normalise input → JSON Schema. `io` flows through to
    // `z.toJSONSchema(..., { io })` so the rendered shape matches the
    // direction the consumer requested.
    let jsonSchema: Record<string, unknown>;
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

    // Coerce the typed `fields` into the loose runtime record shape
    // the walker consumes. `InferFields<T, Ref>` widens to a union that
    // includes `__SchemaInferenceFellBack` (Swagger 2.0) and typed
    // `FieldOverrides<...>` variants — neither is structurally
    // assignable to the walker's `Record<string, unknown>` slot.
    const fieldsRecord = toRecordOrUndefined(fields);

    // Walk the JSON Schema tree
    const walkOptions: WalkOptions = {
        componentMeta: mergedMeta,
        rootMeta,
        fieldOverrides: fieldsRecord,
        rootDocument,
        ...(diagnostics !== undefined ? { diagnostics } : {}),
    };

    const tree = walk(jsonSchema, walkOptions);

    // Build resolver: explicit prop → headless fallback
    const userResolver =
        resolver !== undefined
            ? mergeResolvers(resolver, headlessResolver)
            : headlessResolver;

    // Recursive render — no hooks, pure functions. Depth limit prevents
    // infinite recursion on circular schema references.
    const makeRenderChild =
        (currentDepth: number, parentPath: string) =>
        (
            childTree: WalkedField,
            childValue: unknown,
            pathSuffix?: string
        ): ReactNode => {
            const childPath = joinPath(parentPath, pathSuffix);
            if (currentDepth >= MAX_RENDER_DEPTH) {
                const label =
                    typeof childTree.meta.description === "string"
                        ? childTree.meta.description
                        : "schema";
                return createElement(
                    "fieldset",
                    null,
                    createElement("em", null, `\u21bb ${label} (recursive)`)
                );
            }
            return renderFieldServer(
                childTree,
                childValue,
                userResolver,
                makeRenderChild(currentDepth + 1, childPath),
                childPath,
                widgets
            );
        };

    const renderChild = makeRenderChild(0, rootPath);

    return renderFieldServer(
        tree,
        value ?? tree.defaultValue,
        userResolver,
        renderChild,
        rootPath,
        widgets
    );
}

// ---------------------------------------------------------------------------
// Field rendering — mirrors renderField from SchemaComponent but
// without hooks, error boundaries, or widget registry.
// ---------------------------------------------------------------------------

function renderFieldServer(
    tree: WalkedField,
    value: unknown,
    resolver: ComponentResolver,
    renderChild: (
        tree: WalkedField,
        value: unknown,
        pathSuffix?: string
    ) => ReactNode,
    path: string,
    widgets?: WidgetMap
): ReactNode {
    if (path.length === 0) {
        throw new Error(
            "renderFieldServer requires a non-empty path. Pass ROOT_PATH at the root and join children via joinPath()."
        );
    }
    // Adapt the read-only renderChild (3-arg) to the RenderProps shape
    // (4-arg). SchemaView discards child onChange because the tree is
    // rendered read-only.
    const adaptedRenderChild: RenderProps["renderChild"] = (
        childTree,
        childValue,
        _childOnChange,
        pathSuffix
    ) => renderChild(childTree, childValue, pathSuffix);

    // Check widgets before resolver — instance widgets take priority
    const componentHint = tree.meta.component;
    if (typeof componentHint === "string") {
        const widget = widgets?.get(componentHint);
        if (widget !== undefined) {
            const props = buildRenderProps(
                tree,
                value,
                undefined,
                adaptedRenderChild,
                path
            );
            const result: unknown = widget(props);
            if (result !== undefined && result !== null) {
                if (isValidElement(result)) return result;
                if (typeof result === "string" || typeof result === "number")
                    return result;
            }
        }
    }

    const renderFn = getRenderFunction(tree.type, resolver);

    if (renderFn !== undefined) {
        const props = buildRenderProps(
            tree,
            value,
            undefined,
            adaptedRenderChild,
            path
        );

        try {
            const result: unknown = renderFn(props);
            if (result !== undefined && result !== null) {
                if (isValidElement(result)) return result;
                if (typeof result === "string" || typeof result === "number")
                    return result;
            }
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
    }

    // Fallback
    if (value === undefined || value === null) return <span>{"\u2014"}</span>;
    return (
        <span>{typeof value === "string" ? value : JSON.stringify(value)}</span>
    );
}
