<!--
    Editable Svelte 5 entry point that renders UI from a Zod schema,
    JSON Schema, or OpenAPI document.

    Mirror of `react/SchemaComponent.tsx :: SchemaComponent` adapted
    to Svelte 5 runes:

      - `$props<…>()` destructures inputs (no React `useContext` /
        `useId` / `useMemo` / `useCallback`).
      - `$derived(...)` for memoised values (the merged meta, the
        normalised JSON schema, the walked tree, the dispatcher's
        rootPath).
      - `$state` for the per-mount default `idPrefix` (computed once
        and held; `useId()` equivalent provided by Svelte 5's
        `$props.id()` rune is intentionally not used here — every
        path generated downstream is structurally suffixed and
        passing a deterministic `idPrefix` is the contracted
        override for snapshot tests).
      - The dispatcher is the same `dispatchRenderField` shared with
        the React and HTML adapters, wired through `renderFieldSvelte`
        in `./dispatch.ts`.

    External-value reactivity contract: `value` is consumed as an
    immutable prop and any internal edit fires `onChange(next)` with
    a freshly cloned object. Consumers can either:

      - Pass a plain object and a function `onChange` that mutates
        local state — typical controlled-component pattern; works
        identically across React / Solid / Svelte.
      - Use Svelte's `bind:value` ergonomics — Svelte translates
        `bind:value` into an `onChange` that mutates the bound
        reference, so this component does not need to know about
        the binding.

    Svelte's reactivity tracks reference identity on the `value`
    prop. Internal edits emit fresh objects (`{ ...obj, key: v }`)
    rather than mutating the prop, so consumers using
    `$state(value)` see new identities propagated correctly. Deep
    mutations of the prop object from outside the component — e.g.
    `value.foo = "bar"` — would not be observed; that is the same
    constraint Vue, Solid, and React impose on shared mutable
    state and is documented in the package README.
-->
<script lang="ts" generics="T = unknown, Ref extends string | undefined = undefined">
    import { z } from "zod";
    import { walk } from "../core/walker.ts";
    import type { WalkOptions } from "../core/walkBuilders.ts";
    import {
        isCodecSchema,
        normaliseSchema,
        type SchemaIoSide,
    } from "../core/adapter.ts";
    import type {
        DiagnosticsOptions,
        Diagnostic,
    } from "../core/diagnostics.ts";
    import { SchemaNormalisationError } from "../core/errors.ts";
    import type { SchemaMeta, WalkedField } from "../core/types.ts";
    import type { SchemaError } from "../core/errors.ts";
    import { isObject, toRecordOrUndefined } from "../core/guards.ts";
    import type {
        InferFields,
        InferSchemaValue,
    } from "../core/inferValue.ts";
    import { resolverContext, widgetsContext } from "./contexts.ts";
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
        /** Zod 4, JSON Schema, or OpenAPI document. */
        schema: T;
        /** OpenAPI ref string, e.g. "#/components/schemas/User". */
        ref?: Ref;
        /** Direction (`"output"` / `"input"`) for codec / transform schemas. */
        io?: SchemaIoSide;
        /** Current value to render. */
        value?: InferSchemaValue<T, Ref, "output">;
        /** Called when the value changes. */
        onChange?: (value: InferSchemaValue<T, Ref, "output">) => void;
        /** Run `safeParse` / `safeEncode` on change. */
        validate?: boolean;
        /** Called with the ZodError on validation failure. */
        onValidationError?: (error: unknown) => void;
        /** Called when schema normalisation or rendering fails. */
        onError?: (error: SchemaError) => void;
        /** Called with each diagnostic emitted during processing. */
        onDiagnostic?: (diagnostic: Diagnostic) => void;
        /** When true, any diagnostic becomes a thrown error. */
        strict?: boolean;
        /** Per-field meta overrides. */
        fields?: InferFields<T, Ref>;
        /** Meta overrides applied to the root schema. */
        meta?: SchemaMeta;
        /** Convenience: sets readOnly on all fields. */
        readOnly?: boolean;
        /** Convenience: sets writeOnly on all fields. */
        writeOnly?: boolean;
        /** Convenience: sets description on the root. */
        description?: string;
        /** Instance-scoped widgets. */
        widgets?: SvelteWidgetMap;
        /**
         * Prefix used for every input `id` / label `for` in this
         * component subtree. Defaults to a sanitised, mount-stable
         * value derived from `crypto.randomUUID()` when available
         * (falling back to a counter). Override for deterministic
         * ids in snapshot tests.
         */
        idPrefix?: string;
    }

    const {
        schema,
        ref,
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
    }: Props = $props();

    const userResolver = resolverContext.consume();
    const contextWidgets = widgetsContext.consume();

    /**
     * Per-mount fallback prefix used when the consumer doesn't pass
     * `idPrefix`. Module-level counter incremented once per
     * component instance — deterministic enough for typical
     * applications without requiring `crypto.randomUUID()` in
     * non-browser environments.
     */
    const fallbackPrefix = `sc-svelte-${String(nextInstanceId())}`;
    const rootPath = $derived(idPrefix ?? fallbackPrefix);

    const mergedMeta = $derived<SchemaMeta>({
        ...componentMeta,
        ...(readOnly === true ? { readOnly: true } : {}),
        ...(writeOnly === true ? { writeOnly: true } : {}),
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
        zodSchema: unknown;
        rootMeta: SchemaMeta | undefined;
        rootDocument: Record<string, unknown>;
    }

    const normalisedResult = $derived<NormalisedShape | SchemaError>(
        normaliseSafely(schema, ref, io, diagnostics)
    );

    /**
     * If normalisation failed and the consumer wired up `onError`,
     * surface the structured error through the callback once per
     * change. Mirrors the React adapter's behaviour where
     * `SchemaNormalisationError` is routed through `onError` rather
     * than thrown at render time.
     */
    $effect(() => {
        if (normalisedResult instanceof Error && onError !== undefined) {
            onError(normalisedResult);
        }
    });

    const fieldsRecord = $derived(toRecordOrUndefined(fields));

    const walkOptions = $derived<WalkOptions | undefined>(
        normalisedResult instanceof Error
            ? undefined
            : {
                  componentMeta: mergedMeta,
                  ...(normalisedResult.rootMeta !== undefined
                      ? { rootMeta: normalisedResult.rootMeta }
                      : {}),
                  ...(fieldsRecord !== undefined
                      ? { fieldOverrides: fieldsRecord }
                      : {}),
                  rootDocument: normalisedResult.rootDocument,
                  ...(diagnostics !== undefined ? { diagnostics } : {}),
              }
    );

    const tree = $derived<WalkedField | undefined>(
        normalisedResult instanceof Error || walkOptions === undefined
            ? undefined
            : walk(normalisedResult.jsonSchema, walkOptions)
    );

    function handleChange(nextValue: unknown): void {
        if (validate === true && !(normalisedResult instanceof Error)) {
            const error = runValidation(
                normalisedResult.zodSchema,
                normalisedResult.jsonSchema,
                nextValue,
                io,
                onDiagnostic
            );
            if (error !== undefined) onValidationError?.(error);
        }
        if (onChange !== undefined) {
            // Library boundary identical to the React adapter — the
            // walker produces `unknown` typed values that downstream
            // call sites receive as the inferred schema shape. The
            // contravariant assignment cannot be proven by
            // TypeScript and is the same pattern used in
            // `react/SchemaComponent.tsx`.
            onChange(nextValue as InferSchemaValue<T, Ref, "output">);
        }
    }

    function makeRenderChild(
        currentDepth: number,
        parentPath: string,
        currentValue: unknown,
        currentOnChange: (v: unknown) => void
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
                makeRenderChild(
                    currentDepth + 1,
                    childPath,
                    childValue,
                    childOnChange
                ),
                childPath,
                instanceWidgets,
                contextWidgets,
                currentDepth + 1,
                Fallback,
                RecursionSentinel
            );
        };
    }

    const renderChild = $derived(
        tree === undefined
            ? undefined
            : makeRenderChild(0, rootPath, value ?? tree.defaultValue, handleChange)
    );

    const effectiveValue = $derived(
        tree === undefined ? value : (value ?? tree.defaultValue)
    );

    const rootDescriptor = $derived<SvelteRenderDescriptor | null>(
        tree === undefined || renderChild === undefined
            ? null
            : renderFieldSvelte(
                  tree,
                  effectiveValue,
                  handleChange,
                  userResolver,
                  renderChild,
                  rootPath,
                  instanceWidgets,
                  contextWidgets,
                  0,
                  Fallback,
                  RecursionSentinel
              )
    );

    /**
     * Append a child path suffix to a parent path. When the suffix
     * is omitted (e.g. transparent wrappers like union options), the
     * parent path is returned unchanged so the child inherits the
     * parent's id. Matches `react/SchemaComponent.tsx :: joinPath`.
     */
    function joinPath(parent: string, suffix: string | undefined): string {
        if (suffix === undefined || suffix.length === 0) return parent;
        if (parent.length === 0) return suffix;
        if (suffix.startsWith("[")) return `${parent}${suffix}`;
        return `${parent}.${suffix}`;
    }

    function normaliseSafely(
        schemaInput: unknown,
        refInput: string | undefined,
        ioSide: SchemaIoSide | undefined,
        diags: DiagnosticsOptions | undefined
    ): NormalisedShape | SchemaError {
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
            if (err instanceof SchemaNormalisationError) return err;
            return new SchemaNormalisationError(
                err instanceof Error
                    ? err.message
                    : "Failed to normalise schema",
                schemaInput,
                "unknown"
            );
        }
    }

    function runValidation(
        zodSchema: unknown,
        jsonSchema: Record<string, unknown>,
        nextValue: unknown,
        ioSide: SchemaIoSide | undefined,
        diag: ((diagnostic: Diagnostic) => void) | undefined
    ): unknown {
        if (zodSchema !== undefined && isObject(zodSchema)) {
            const resolvedIo: SchemaIoSide = ioSide ?? "output";
            const useSafeEncode =
                isCodecSchema(zodSchema) && resolvedIo === "output";
            const validateFn = useSafeEncode
                ? zodSchema.safeEncode
                : zodSchema.safeParse;
            if (typeof validateFn === "function") {
                const result: unknown = validateFn(nextValue);
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
        } catch (err: unknown) {
            if (diag !== undefined) {
                const message =
                    err instanceof Error
                        ? err.message
                        : "z.fromJSONSchema threw a non-Error value";
                diag({
                    code: "unsupported-type",
                    message:
                        "Skipping fallback validation: z.fromJSONSchema could not " +
                        `round-trip the normalised JSON Schema. Original message: ${message}`,
                    pointer: "",
                    detail: { source: "z.fromJSONSchema" },
                });
                return undefined;
            }
            return undefined;
        }
        if (isObject(parsed) && typeof parsed.safeParse === "function") {
            const result: unknown = parsed.safeParse(nextValue);
            if (
                isObject(result) &&
                "success" in result &&
                result.success !== true
            ) {
                return result.error;
            }
        }
        return undefined;
    }
</script>

<script lang="ts" module>
    let instanceCounter = 0;
    /**
     * Module-scoped counter feeding the default `idPrefix` for every
     * `<SchemaComponent>` instance. Bumped once per mount so two
     * components on the same page never share generated ids.
     *
     * Counter rather than `crypto.randomUUID()` because the renderer
     * also runs in SSR / Node environments where the Web Crypto API
     * is conditional. A monotonically increasing integer per process
     * is sufficient for the per-page-uniqueness contract.
     *
     * @returns The next per-instance integer (1, 2, …).
     */
    export function nextInstanceId(): number {
        instanceCounter += 1;
        return instanceCounter;
    }
</script>

{#if rootDescriptor !== null}
    <Mount descriptor={rootDescriptor} />
{/if}
