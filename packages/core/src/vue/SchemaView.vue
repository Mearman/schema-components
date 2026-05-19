<script setup lang="ts">
/**
 * `<SchemaView>` — read-only Vue renderer.
 *
 * Vue counterpart of `react/SchemaView.tsx`. Always renders read-only
 * output; the dispatch loop is identical to `<SchemaComponent>` but
 * the `onChange` callback handed to the dispatcher is a noop and
 * `mergedMeta.readOnly` is forced to `true`.
 *
 * SSR story: Vue ships a server renderer (`@vue/server-renderer`)
 * that emits HTML strings from the same render functions, so this
 * SFC is safe to use inside a Nuxt server component or a custom
 * `renderToString` pipeline. Unlike the React Server Component
 * version, there is no separate RSC restriction — Vue components
 * have a single rendering model that works in both environments.
 *
 * @group Components
 */
import { computed, h, toRaw, type VNode } from "vue";
import { walk } from "../core/walker.ts";
import type { WalkOptions } from "../core/walkBuilders.ts";
import { normaliseSchema } from "../core/adapter.ts";
import type { SchemaMeta, WalkedField } from "../core/types.ts";
import type { Diagnostic, DiagnosticsOptions } from "../core/diagnostics.ts";
import { SchemaNormalisationError } from "../core/errors.ts";
import { toRecordOrUndefined } from "../core/guards.ts";
import { vueRenderField } from "./renderField.ts";
import { deriveIdPrefix, joinPath } from "./idPrefix.ts";
import type {
    VueComponentResolver,
    VueRenderProps,
    VueWidgetMap,
} from "./types.ts";
import { VNodeHost } from "./VNodeHost.ts";

const props = withDefaults(
    defineProps<{
        /** Zod schema, JSON Schema object, or OpenAPI document. */
        schema: unknown;
        /** For OpenAPI: a ref string. */
        refPath?: string;
        /** Current value to render. */
        value?: unknown;
        /** Meta overrides applied to the root schema. */
        meta?: SchemaMeta;
        /** Convenience: sets `description` on the root. */
        description?: string;
        /** Per-field meta overrides — nested object mirroring schema shape. */
        fields?: Record<string, unknown>;
        /**
         * Theme resolver. In a Server Component environment you pass
         * this explicitly because the context-based `<SchemaProvider>`
         * may not be mounted on the server.
         */
        resolver?: VueComponentResolver;
        /** Instance-scoped widgets. */
        widgets?: VueWidgetMap;
        /** Deterministic id prefix. Defaults to a per-instance `useId()` value. */
        idPrefix?: string;
        /** Called with each diagnostic emitted during schema processing. */
        onDiagnostic?: (diagnostic: Diagnostic) => void;
        /** When `true`, any diagnostic becomes a thrown error. */
        strict?: boolean;
    }>(),
    {
        refPath: undefined,
        value: undefined,
        meta: () => ({}),
        description: undefined,
        fields: undefined,
        resolver: undefined,
        widgets: undefined,
        idPrefix: undefined,
        onDiagnostic: undefined,
        strict: false,
    }
);

const rootPath = computed(() => deriveIdPrefix(props.idPrefix));

const mergedMeta = computed<SchemaMeta>(() => {
    const merged: SchemaMeta = { ...props.meta, readOnly: true };
    if (props.description !== undefined) merged.description = props.description;
    return merged;
});

const diagnostics = computed<DiagnosticsOptions | undefined>(() => {
    if (props.onDiagnostic === undefined && !props.strict) return undefined;
    const opts: DiagnosticsOptions = {};
    if (props.onDiagnostic !== undefined) opts.diagnostics = props.onDiagnostic;
    if (props.strict) opts.strict = true;
    return opts;
});

interface Normalised {
    jsonSchema: Record<string, unknown>;
    rootMeta: SchemaMeta | undefined;
    rootDocument: Record<string, unknown>;
}

const normalised = computed<Normalised>(() => {
    const opts =
        diagnostics.value !== undefined
            ? { diagnostics: diagnostics.value }
            : undefined;
    try {
        // `toRaw` peels off Vue's reactive proxy before the schema
        // crosses into `normaliseSchema`, which expects the bare
        // object (Zod schemas in particular have non-configurable
        // `_zod` data members that Vue's default Proxy cannot mirror).
        // See the matching comment in `SchemaComponent.vue`.
        const rawSchema = toRaw(props.schema);
        const result = normaliseSchema(rawSchema, props.refPath, opts);
        return {
            jsonSchema: result.jsonSchema,
            rootMeta: result.rootMeta,
            rootDocument: result.rootDocument,
        };
    } catch (err) {
        if (err instanceof SchemaNormalisationError) throw err;
        throw new SchemaNormalisationError(
            err instanceof Error ? err.message : "Failed to normalise schema",
            toRaw(props.schema),
            "unknown"
        );
    }
});

const tree = computed<WalkedField>(() => {
    const n = normalised.value;
    const walkOptions: WalkOptions = {
        componentMeta: mergedMeta.value,
        rootDocument: n.rootDocument,
    };
    if (n.rootMeta !== undefined) walkOptions.rootMeta = n.rootMeta;
    const fieldsRecord = toRecordOrUndefined(props.fields);
    if (fieldsRecord !== undefined) walkOptions.fieldOverrides = fieldsRecord;
    if (diagnostics.value !== undefined)
        walkOptions.diagnostics = diagnostics.value;
    return walk(n.jsonSchema, walkOptions);
});

/** Noop onChange — SchemaView never propagates value changes. */
function noopChange(): void {
    /* intentional no-op */
}

function makeRenderChild(
    currentDepth: number,
    parentPath: string
): VueRenderProps["renderChild"] {
    return (
        childTree: WalkedField,
        childValue: unknown,
        _childOnChange: (v: unknown) => void,
        pathSuffix?: string
    ) => {
        const childPath = joinPath(parentPath, pathSuffix);
        return vueRenderField(
            childTree,
            childValue,
            noopChange,
            props.resolver,
            makeRenderChild(currentDepth + 1, childPath),
            childPath,
            props.widgets,
            undefined,
            currentDepth + 1
        );
    };
}

const rootVNode = computed<VNode>(() => {
    const t = tree.value;
    const renderChild = makeRenderChild(0, rootPath.value);
    return vueRenderField(
        t,
        props.value ?? t.defaultValue,
        noopChange,
        props.resolver,
        renderChild,
        rootPath.value,
        props.widgets,
        undefined,
        0
    );
});

// Silence the `h` import: kept available for downstream theme adapters
// that wrap `<SchemaView>` and need to compose extra structure around
// the render output. The SFC body itself only consumes the computed
// VNode through `<VNodeHost>`.
void h;
</script>

<template>
    <VNodeHost :node="rootVNode" />
</template>
