<!--
    Read-only Svelte 5 schema renderer — counterpart to
    `<SchemaComponent>` for SSR / hydration / display-only use.

    Mirror of `react/SchemaView.tsx`. Receives the same prop bag but
    drops `onChange`, `validate`, `onValidationError`, and `onError`
    — the read-only path has no interactive state and no validation
    to dispatch. The theme adapter is passed via the `resolver` prop
    rather than `<SchemaProvider>` so the component remains usable in
    Svelte's SSR pass without depending on context propagation.

    Internally, the dispatcher chain is identical to
    `<SchemaComponent>` — `renderFieldSvelte` from `./dispatch.ts`
    handles the depth cap, widget overrides, resolver dispatch, and
    recursion sentinel. The only differences are:

      - `readOnly` is forced to `true` on the merged meta.
      - `onChange` is a noop (no event handlers fire; every renderer
        observes `readOnly === true` and skips wiring DOM handlers).
      - No global widget lookup — Svelte SSR mustn't read
        module-level mutable state.
-->
<script lang="ts" generics="T = unknown, Ref extends string | undefined = undefined">
    import { walk } from "../core/walker.ts";
    import type { WalkOptions } from "../core/walkBuilders.ts";
    import {
        normaliseSchema,
        type SchemaIoSide,
    } from "../core/adapter.ts";
    import { SchemaNormalisationError } from "../core/errors.ts";
    import type { SchemaMeta, WalkedField } from "../core/types.ts";
    import { toRecordOrUndefined } from "../core/guards.ts";
    import type {
        DiagnosticsOptions,
        Diagnostic,
    } from "../core/diagnostics.ts";
    import type {
        InferFields,
        InferredValue,
    } from "../core/inferValue.ts";
    import { renderFieldSvelte } from "./dispatch.ts";
    import RecursionSentinel from "./renderers/RecursionSentinel.svelte";
    import Fallback from "./renderers/Fallback.svelte";
    import Mount from "./renderers/Mount.svelte";
    import type {
        SvelteComponentResolver,
        SvelteRenderDescriptor,
        SvelteRenderProps,
        SvelteWidgetMap,
    } from "./types.ts";

    interface Props {
        schema: T;
        schemaRef?: Ref;
        io?: SchemaIoSide;
        value?: InferredValue<T, Ref, undefined, "output">;
        fields?: InferFields<T, Ref>;
        meta?: SchemaMeta;
        description?: string;
        /** Theme resolver — Svelte SSR has no context fallthrough, pass explicitly. */
        resolver?: SvelteComponentResolver;
        /** Instance-scoped widgets. */
        widgets?: SvelteWidgetMap;
        onDiagnostic?: (diagnostic: Diagnostic) => void;
        strict?: boolean;
        idPrefix?: string;
    }

    const {
        schema,
        schemaRef,
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
    }: Props = $props();

    /**
     * Per-mount fallback prefix — matches `<SchemaComponent>`'s
     * default so a `<SchemaView>` and a sibling `<SchemaComponent>`
     * on the same page can never collide.
     */
    const fallbackPrefix = `sc-svelte-view-${String(nextViewInstanceId())}`;
    const rootPath = $derived(idPrefix ?? fallbackPrefix);

    const mergedMeta = $derived<SchemaMeta>({
        ...componentMeta,
        readOnly: true,
        ...(description !== undefined ? { description } : {}),
    });

    const diagnostics: DiagnosticsOptions | undefined = $derived(
        onDiagnostic !== undefined || strict === true
            ? {
                  ...(onDiagnostic !== undefined
                      ? { diagnostics: onDiagnostic }
                      : {}),
                  ...(strict !== undefined ? { strict } : {}),
              }
            : undefined
    );

    interface NormalisedShape {
        jsonSchema: Record<string, unknown>;
        rootMeta: SchemaMeta | undefined;
        rootDocument: Record<string, unknown>;
    }

    const normalisedResult = $derived<NormalisedShape>(
        normaliseOrThrow(schema, schemaRef, io, diagnostics)
    );

    const fieldsRecord = $derived(toRecordOrUndefined(fields));

    const walkOptions = $derived<WalkOptions>({
        componentMeta: mergedMeta,
        ...(normalisedResult.rootMeta !== undefined
            ? { rootMeta: normalisedResult.rootMeta }
            : {}),
        ...(fieldsRecord !== undefined
            ? { fieldOverrides: fieldsRecord }
            : {}),
        rootDocument: normalisedResult.rootDocument,
        ...(diagnostics !== undefined ? { diagnostics } : {}),
    });

    const tree = $derived<WalkedField>(
        walk(normalisedResult.jsonSchema, walkOptions)
    );

    function readOnlyOnChange(_v: unknown): void {
        /* intentional no-op — SchemaView is read-only. */
    }

    function makeRenderChild(
        currentDepth: number,
        parentPath: string
    ): SvelteRenderProps["renderChild"] {
        return (
            childTree: WalkedField,
            childValue: unknown,
            _childOnChange: (v: unknown) => void,
            pathSuffix?: string
        ): SvelteRenderDescriptor | null => {
            const childPath = joinPath(parentPath, pathSuffix);
            return renderFieldSvelte(
                childTree,
                childValue,
                readOnlyOnChange,
                resolver,
                makeRenderChild(currentDepth + 1, childPath),
                childPath,
                widgets,
                undefined,
                currentDepth + 1,
                Fallback,
                RecursionSentinel
            );
        };
    }

    const renderChild = $derived(makeRenderChild(0, rootPath));

    const rootDescriptor = $derived<SvelteRenderDescriptor | null>(
        renderFieldSvelte(
            tree,
            value ?? tree.defaultValue,
            readOnlyOnChange,
            resolver,
            renderChild,
            rootPath,
            widgets,
            undefined,
            0,
            Fallback,
            RecursionSentinel
        )
    );

    /**
     * Path-suffix join, mirror of `SchemaComponent.svelte :: joinPath`
     * and `react/SchemaComponent.tsx :: joinPath`.
     */
    function joinPath(parent: string, suffix: string | undefined): string {
        if (suffix === undefined || suffix.length === 0) return parent;
        if (parent.length === 0) return suffix;
        if (suffix.startsWith("[")) return `${parent}${suffix}`;
        return `${parent}.${suffix}`;
    }

    function normaliseOrThrow(
        schemaInput: unknown,
        refInput: string | undefined,
        ioSide: SchemaIoSide | undefined,
        diags: DiagnosticsOptions | undefined
    ): NormalisedShape {
        try {
            const opts =
                diags !== undefined || ioSide !== undefined
                    ? {
                          ...(diags !== undefined ? { diagnostics: diags } : {}),
                          ...(ioSide !== undefined ? { io: ioSide } : {}),
                      }
                    : undefined;
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
</script>

<script lang="ts" module>
    let viewInstanceCounter = 0;
    /**
     * Module-scoped counter feeding the default `idPrefix` for every
     * `<SchemaView>` instance. Separate from the `<SchemaComponent>`
     * counter so the two namespaces never overlap; ids stay unique
     * across all schema-driven Svelte components on a page.
     *
     * @returns The next per-instance integer (1, 2, …).
     */
    export function nextViewInstanceId(): number {
        viewInstanceCounter += 1;
        return viewInstanceCounter;
    }
</script>

{#if rootDescriptor !== null}
    <Mount descriptor={rootDescriptor} />
{/if}
