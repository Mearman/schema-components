<!--
    Render a single field from a schema by dot-separated `path`.
    Mirror of `react/SchemaComponent.tsx :: SchemaField`.

    Walks the full schema tree, resolves the field at `path`, and
    renders only that subtree. Useful for embedding individual
    fields inside bespoke layouts when `<SchemaComponent>` would
    render too much.
-->
<script lang="ts" generics="T = unknown, Ref extends string | undefined = undefined">
    import { walk } from "../core/walker.ts";
    import type { WalkOptions } from "../core/walkBuilders.ts";
    import {
        normaliseSchema,
        type SchemaIoSide,
    } from "../core/adapter.ts";
    import {
        SchemaNormalisationError,
        SchemaFieldError,
    } from "../core/errors.ts";
    import type { SchemaMeta, WalkedField } from "../core/types.ts";
    import {
        resolvePath,
        resolveValue,
        setNestedValue,
    } from "../core/fieldPath.ts";
    import { resolverContext, widgetsContext } from "./contexts.ts";
    import { renderFieldSvelte } from "./dispatch.ts";
    import RecursionSentinel from "./renderers/RecursionSentinel.svelte";
    import Fallback from "./renderers/Fallback.svelte";
    import Mount from "./renderers/Mount.svelte";
    import type {
        SvelteRenderDescriptor,
        SvelteRenderProps,
    } from "./types.ts";

    interface Props {
        /** Dot-separated path (e.g. "address.city"). */
        path: string;
        /** The schema to extract the field from. */
        schema: T;
        /** OpenAPI ref string. */
        schemaRef?: Ref;
        /** Direction (`"output"` / `"input"`) for codec / transform schemas. */
        io?: SchemaIoSide;
        /** Current value of the root schema. */
        value?: unknown;
        /** Called with the updated root value when this field changes. */
        onChange?: (value: unknown) => void;
        /** Override meta for this specific field. */
        meta?: SchemaMeta;
        /**
         * Prefix used for every input `id` / label `for` in this
         * subtree. Defaults to a sanitised, mount-stable counter.
         */
        idPrefix?: string;
    }

    const {
        path,
        schema,
        schemaRef,
        io,
        value,
        onChange,
        meta: fieldMeta,
        idPrefix,
    }: Props = $props();

    const userResolver = resolverContext.consume();
    const contextWidgets = widgetsContext.consume();

    const fallbackPrefix = `sc-svelte-field-${String(nextFieldInstanceId())}`;
    const rootPath = $derived(joinPath(idPrefix ?? fallbackPrefix, path));

    interface NormalisedShape {
        jsonSchema: Record<string, unknown>;
        rootMeta: SchemaMeta | undefined;
        rootDocument: Record<string, unknown>;
    }

    const normalisedResult = $derived<NormalisedShape>(
        normaliseOrThrow(schema, schemaRef, io)
    );

    const walkOptions = $derived<WalkOptions>({
        ...(fieldMeta !== undefined ? { componentMeta: fieldMeta } : {}),
        ...(normalisedResult.rootMeta !== undefined
            ? { rootMeta: normalisedResult.rootMeta }
            : {}),
        rootDocument: normalisedResult.rootDocument,
    });

    const fullTree = $derived(walk(normalisedResult.jsonSchema, walkOptions));

    const fieldTree = $derived<WalkedField>(
        resolvePathOrThrow(fullTree, path, schema)
    );

    const fieldValue = $derived(resolveValue(value, path));

    function handleChange(nextFieldValue: unknown): void {
        const newRootValue = setNestedValue(value, path, nextFieldValue);
        onChange?.(newRootValue);
    }

    function makeRenderChild(
        currentDepth: number,
        parentPath: string
    ): SvelteRenderProps["renderChild"] {
        return (
            childTree: WalkedField,
            childValue: unknown,
            childOnChange: (v: unknown) => void,
            pathSuffix?: string
        ): SvelteRenderDescriptor | null => {
            const childPath = joinPath(parentPath, pathSuffix);
            return renderFieldSvelte(
                childTree,
                childValue,
                childOnChange,
                userResolver,
                makeRenderChild(currentDepth + 1, childPath),
                childPath,
                undefined,
                contextWidgets,
                currentDepth + 1,
                Fallback,
                RecursionSentinel
            );
        };
    }

    const renderChild = $derived(makeRenderChild(0, rootPath));

    const rootDescriptor = $derived<SvelteRenderDescriptor | null>(
        renderFieldSvelte(
            fieldTree,
            fieldValue,
            handleChange,
            userResolver,
            renderChild,
            rootPath,
            undefined,
            contextWidgets,
            0,
            Fallback,
            RecursionSentinel
        )
    );

    function joinPath(parent: string, suffix: string | undefined): string {
        if (suffix === undefined || suffix.length === 0) return parent;
        if (parent.length === 0) return suffix;
        if (suffix.startsWith("[")) return `${parent}${suffix}`;
        return `${parent}.${suffix}`;
    }

    function normaliseOrThrow(
        schemaInput: unknown,
        refInput: string | undefined,
        ioSide: SchemaIoSide | undefined
    ): NormalisedShape {
        try {
            const opts =
                ioSide !== undefined ? { io: ioSide } : undefined;
            const out = normaliseSchema(schemaInput, refInput, opts);
            return out;
        } catch (err: unknown) {
            if (err instanceof SchemaNormalisationError) throw err;
            throw new SchemaNormalisationError(
                err instanceof Error
                    ? err.message
                    : "Failed to normalise schema",
                schemaInput,
                "unknown"
            );
        }
    }

    function resolvePathOrThrow(
        tree: WalkedField,
        p: string,
        schemaInput: unknown
    ): WalkedField {
        const resolved = resolvePath(tree, p);
        if (resolved === undefined) {
            throw new SchemaFieldError(
                `Field not found: ${p}`,
                schemaInput,
                p
            );
        }
        return resolved;
    }
</script>

<script lang="ts" module>
    let fieldInstanceCounter = 0;
    /**
     * Module-scoped counter feeding the default `idPrefix` for every
     * `<SchemaField>` instance. Separate from the `<SchemaComponent>`
     * and `<SchemaView>` counters so the three namespaces never
     * overlap.
     *
     * @returns The next per-instance integer (1, 2, …).
     */
    export function nextFieldInstanceId(): number {
        fieldInstanceCounter += 1;
        return fieldInstanceCounter;
    }
</script>

{#if rootDescriptor !== null}
    <Mount descriptor={rootDescriptor} />
{/if}
