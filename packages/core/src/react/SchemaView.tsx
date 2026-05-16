/**
 * React Server Component for read-only schema rendering.
 *
 * This component has zero hooks — no `useContext`, no `useMemo`,
 * no `useCallback`. It can run in a React Server Component environment
 * without the `"use client"` directive.
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

import { createElement, isValidElement, type ReactNode } from "react";
import type { ComponentResolver, RenderProps } from "../core/renderer.ts";
import { mergeResolvers, getRenderFunction } from "../core/renderer.ts";
import type { WidgetMap } from "./SchemaComponent.tsx";
import { headlessResolver } from "./headless.tsx";
import { normaliseSchema } from "../core/adapter.ts";
import { walk } from "../core/walker.ts";
import type { WalkOptions } from "../core/walkBuilders.ts";
import type { SchemaMeta, WalkedField } from "../core/types.ts";
import { SchemaNormalisationError, SchemaRenderError } from "../core/errors.ts";
import type { DiagnosticsOptions, Diagnostic } from "../core/diagnostics.ts";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SchemaViewProps {
    /** Zod schema, JSON Schema object, or OpenAPI document. */
    schema: unknown;
    /** For OpenAPI: a ref string like "#/components/schemas/User". */
    ref?: string;
    /** Current value to render. */
    value?: unknown;
    /** Per-field meta overrides. */
    fields?: Record<string, unknown>;
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
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function noop() {
    /* intentional no-op */
}

/**
 * Server-safe schema renderer — no hooks, no context, no state.
 *
 * Always renders in read-only mode. For editable forms, use
 * `<SchemaComponent>` with `"use client"`.
 */
export function SchemaView({
    schema: schemaInput,
    ref: refInput,
    value,
    fields,
    meta: componentMeta,
    description,
    resolver,
    widgets,
    onDiagnostic,
    strict,
}: SchemaViewProps): ReactNode {
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

    // Normalise input → JSON Schema
    let jsonSchema: Record<string, unknown>;
    let rootMeta: SchemaMeta | undefined;
    let rootDocument: Record<string, unknown>;
    try {
        const normalised = normaliseSchema(
            schemaInput,
            refInput,
            diagnostics !== undefined ? { diagnostics } : undefined
        );
        jsonSchema = normalised.jsonSchema;
        rootMeta = normalised.rootMeta;
        rootDocument = normalised.rootDocument;
    } catch (err: unknown) {
        throw new SchemaNormalisationError(
            err instanceof Error ? err.message : "Failed to normalise schema",
            schemaInput,
            "unknown"
        );
    }

    // Walk the JSON Schema tree
    const walkOptions: WalkOptions = {
        componentMeta: mergedMeta,
        rootMeta,
        fieldOverrides: fields,
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
    const MAX_SERVER_DEPTH = 10;
    const makeRenderChild =
        (currentDepth: number) =>
        (childTree: WalkedField, childValue: unknown): ReactNode => {
            if (currentDepth >= MAX_SERVER_DEPTH) {
                const label =
                    typeof childTree.meta.description === "string"
                        ? childTree.meta.description
                        : childTree.type === "recursive"
                          ? childTree.refTarget
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
                makeRenderChild(currentDepth + 1),
                widgets
            );
        };

    const renderChild = makeRenderChild(0);

    return renderFieldServer(
        tree,
        value ?? tree.defaultValue,
        userResolver,
        renderChild,
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
    renderChild: (tree: WalkedField, value: unknown) => ReactNode,
    widgets?: WidgetMap
): ReactNode {
    // Check widgets before resolver — instance widgets take priority
    const componentHint = tree.meta.component;
    if (typeof componentHint === "string") {
        const widget = widgets?.get(componentHint);
        if (widget !== undefined) {
            const props: RenderProps = {
                value,
                onChange: noop,
                readOnly: true,
                writeOnly: false,
                meta: tree.meta,
                constraints: tree.constraints,
                path: "",
                tree,
                renderChild: (childTree: WalkedField, childValue: unknown) =>
                    renderChild(childTree, childValue),
            };
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
        const props: RenderProps = {
            value,
            onChange: noop,
            readOnly: true,
            writeOnly: false,
            meta: tree.meta,
            constraints: tree.constraints,
            path: "",
            tree,
            renderChild: (childTree: WalkedField, childValue: unknown) =>
                renderChild(childTree, childValue),
        };
        if (tree.type === "enum") props.enumValues = tree.enumValues;
        if (tree.type === "array" && tree.element !== undefined)
            props.element = tree.element;
        if (tree.type === "object") props.fields = tree.fields;
        if (tree.type === "union" || tree.type === "discriminatedUnion")
            props.options = tree.options;
        if (tree.type === "discriminatedUnion")
            props.discriminator = tree.discriminator;
        if (tree.type === "record") props.keyType = tree.keyType;
        if (tree.type === "record") props.valueType = tree.valueType;
        if (tree.type === "tuple") props.prefixItems = tree.prefixItems;
        if (tree.type === "conditional") props.ifClause = tree.ifClause;
        if (tree.type === "conditional" && tree.thenClause !== undefined)
            props.thenClause = tree.thenClause;
        if (tree.type === "conditional" && tree.elseClause !== undefined)
            props.elseClause = tree.elseClause;
        if (tree.type === "negation") props.negated = tree.negated;
        if (tree.type === "recursive") props.refTarget = tree.refTarget;
        if (tree.type === "literal") props.literalValues = tree.literalValues;

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
    if (value === undefined || value === null) return <span>\u2014</span>;
    return (
        <span>{typeof value === "string" ? value : JSON.stringify(value)}</span>
    );
}
