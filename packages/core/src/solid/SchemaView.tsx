/** @jsxImportSource solid-js */
/**
 * Solid read-only schema renderer.
 *
 * Mirror of `react/SchemaView.tsx` for Solid. Renders a schema in
 * read-only mode without any context — the theme adapter is passed
 * explicitly via the `resolver` prop, matching the React Server
 * Component contract.
 *
 * The compute primitive used is `createUniqueId()` plus a single
 * recursive render dispatcher. There is no per-render hook state; the
 * tree is walked once per render and dispatched to the resolver.
 *
 * SSR note: Solid Start ships a server-component equivalent
 * (server-only directives, etc.) but the API is still moving.
 * `<SchemaView>` is documented as the read-only entry point and works
 * as a normal Solid component inside an SSR-rendered tree; consumers
 * using Solid Start can place it anywhere, including in a server-
 * rendered route. A dedicated Solid Start server-only surface can be
 * added as a thin wrapper once the upstream API stabilises.
 */

import { createUniqueId, type JSX } from "solid-js";
import { normaliseSchema, type SchemaIoSide } from "../core/adapter.ts";
import { MAX_RENDER_DEPTH } from "../core/limits.ts";
import { walk } from "../core/walker.ts";
import type { WalkOptions } from "../core/walkBuilders.ts";
import type { SchemaMeta, WalkedField } from "../core/types.ts";
import { SchemaNormalisationError, SchemaRenderError } from "../core/errors.ts";
import { toRecordOrUndefined } from "../core/guards.ts";
import type { DiagnosticsOptions, Diagnostic } from "../core/diagnostics.ts";
import type { RejectUnrepresentableZod } from "../core/typeInference.ts";
import { headlessSolidResolver } from "./headless.ts";
import {
    joinPath,
    sanitisePrefix,
    type InferFields,
    type InferredValue,
} from "./SchemaComponent.tsx";
import type {
    SolidComponentResolver,
    SolidRenderFunction,
    SolidRenderProps,
    SolidWidgetMap,
} from "./types.ts";

/**
 * Props accepted by {@link SchemaView}.
 *
 * Mirrors `<SchemaComponent>` for the read-only path — no `onChange`,
 * no `validate`, and the theme is supplied via the `resolver` prop
 * rather than `SchemaProvider` so it can be rendered without a
 * Solid context binding.
 *
 * @group Components
 */
export interface SchemaViewProps<
    T = unknown,
    SchemaRef extends string | undefined = undefined,
    Mode extends SchemaIoSide = "output",
> {
    schema: RejectUnrepresentableZod<T>;
    schemaRef?: SchemaRef;
    io?: Mode;
    value?: InferredValue<T, SchemaRef, undefined, Mode>;
    fields?: InferFields<T, SchemaRef>;
    meta?: SchemaMeta;
    description?: string;
    /** Theme resolver. Falls back to the headless resolver if omitted. */
    resolver?: SolidComponentResolver;
    widgets?: SolidWidgetMap;
    onDiagnostic?: (diagnostic: Diagnostic) => void;
    strict?: boolean;
    idPrefix?: string;
}

/**
 * Read-only Solid renderer that is safe to use outside a Solid context
 * subtree — the theme adapter is passed via the `resolver` prop.
 *
 * Always renders read-only; pair with `SchemaComponent` for editable
 * forms. Mirrors the contract of the React `<SchemaView>`.
 *
 * @group Components
 * @example
 * ```tsx
 * import { SchemaView } from "schema-components/solid/SchemaView";
 *
 * export default function UserCard(props: { user: User }) {
 *   return <SchemaView schema={userSchema} value={props.user} />;
 * }
 * ```
 */
export function SchemaView<
    T = unknown,
    SchemaRef extends string | undefined = undefined,
    Mode extends SchemaIoSide = "output",
>(props: SchemaViewProps<T, SchemaRef, Mode>): JSX.Element {
    const generatedId = createUniqueId();
    const rootPath = props.idPrefix ?? sanitisePrefix(generatedId);
    const mergedMeta: SchemaMeta = { ...props.meta, readOnly: true };
    if (props.description !== undefined)
        mergedMeta.description = props.description;

    const diagnostics: DiagnosticsOptions | undefined =
        props.onDiagnostic !== undefined || props.strict === true
            ? {
                  ...(props.onDiagnostic !== undefined
                      ? { diagnostics: props.onDiagnostic }
                      : {}),
                  ...(props.strict !== undefined
                      ? { strict: props.strict }
                      : {}),
              }
            : undefined;

    let jsonSchema: Record<string, unknown>;
    let rootMeta: SchemaMeta | undefined;
    let rootDocument: Record<string, unknown>;
    try {
        const normaliseOptions =
            diagnostics !== undefined || props.io !== undefined
                ? {
                      ...(diagnostics !== undefined ? { diagnostics } : {}),
                      ...(props.io !== undefined ? { io: props.io } : {}),
                  }
                : undefined;
        const normalised = normaliseSchema(
            props.schema,
            props.schemaRef,
            normaliseOptions
        );
        jsonSchema = normalised.jsonSchema;
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

    const fieldsRecord = toRecordOrUndefined(props.fields);

    const walkOptions: WalkOptions = {
        componentMeta: mergedMeta,
        rootMeta,
        fieldOverrides: fieldsRecord,
        rootDocument,
        ...(diagnostics !== undefined ? { diagnostics } : {}),
    };

    const tree = walk(jsonSchema, walkOptions);

    const resolver: SolidComponentResolver =
        props.resolver !== undefined
            ? mergeSolidResolvers(props.resolver, headlessSolidResolver)
            : headlessSolidResolver;

    const makeRenderChild =
        (currentDepth: number, parentPath: string) =>
        (
            childTree: WalkedField,
            childValue: unknown,
            _childOnChange: (v: unknown) => void,
            pathSuffix?: string
        ): JSX.Element => {
            const childPath = joinPath(parentPath, pathSuffix);
            if (currentDepth >= MAX_RENDER_DEPTH) {
                const label =
                    typeof childTree.meta.description === "string"
                        ? childTree.meta.description
                        : "schema";
                return (
                    <fieldset>
                        <em>↻ {label} (recursive)</em>
                    </fieldset>
                );
            }
            return renderFieldServer(
                childTree,
                childValue,
                resolver,
                makeRenderChild(currentDepth + 1, childPath),
                childPath,
                props.widgets
            );
        };

    const renderChild = makeRenderChild(0, rootPath);

    return renderFieldServer(
        tree,
        props.value ?? tree.defaultValue,
        resolver,
        renderChild,
        rootPath,
        props.widgets
    );
}

// ---------------------------------------------------------------------------
// Field rendering for read-only mode. Mirrors renderField but discards
// any onChange that bubbles through the dispatcher.
// ---------------------------------------------------------------------------

function renderFieldServer(
    tree: WalkedField,
    value: unknown,
    resolver: SolidComponentResolver,
    renderChild: (
        tree: WalkedField,
        value: unknown,
        onChange: (v: unknown) => void,
        pathSuffix?: string
    ) => JSX.Element,
    path: string,
    widgets?: SolidWidgetMap
): JSX.Element {
    if (path.length === 0) {
        throw new Error(
            "renderFieldServer requires a non-empty path. Pass the root " +
                "path at the top and join children via joinPath()."
        );
    }

    const componentHint = tree.meta.component;
    if (typeof componentHint === "string") {
        const widget = widgets?.get(componentHint);
        if (widget !== undefined) {
            const props: SolidRenderProps = {
                value,
                readOnly: true,
                writeOnly: false,
                meta: tree.meta,
                constraints: tree.constraints,
                path,
                tree,
                onChange: () => {
                    /* read-only: noop */
                },
                renderChild,
                ...(tree.examples !== undefined
                    ? { examples: tree.examples }
                    : {}),
            };
            const result = widget(props);
            if (result !== null && result !== undefined) return result;
        }
    }

    const renderFn: SolidRenderFunction | undefined = resolver[tree.type];
    if (renderFn !== undefined) {
        try {
            const result = renderFn({
                value,
                readOnly: true,
                writeOnly: false,
                meta: tree.meta,
                constraints: tree.constraints,
                path,
                tree,
                onChange: () => {
                    /* read-only: noop */
                },
                renderChild,
                ...(tree.examples !== undefined
                    ? { examples: tree.examples }
                    : {}),
            });
            if (result !== null && result !== undefined) return result;
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

    if (value === undefined || value === null) return <span>—</span>;
    return (
        <span>{typeof value === "string" ? value : JSON.stringify(value)}</span>
    );
}

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
