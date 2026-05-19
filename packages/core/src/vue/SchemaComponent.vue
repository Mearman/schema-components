<script setup lang="ts">
/**
 * `<SchemaComponent>` — Vue counterpart of the React `<SchemaComponent>`.
 *
 * Auto-detects the input format, normalises to JSON Schema via the
 * adapter, walks the JSON Schema tree, and delegates per-field
 * rendering to the {@link VueComponentResolver} supplied via
 * `<SchemaProvider>` — falling back to the headless renderer when no
 * provider is present.
 *
 * `onChange` semantics: the component accepts BOTH a `v-model`
 * binding (Vue-idiomatic — `modelValue` prop +
 * `update:modelValue` emit) and an explicit `onChange` callback prop
 * (matching the React adapter). It also emits a `change` event for
 * Vue authors who prefer event listeners. All three surfaces fire
 * together so consumers may use whichever idiom suits them.
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
import { VueResolverContext, VueWidgetsContext } from "./contexts.ts";
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
        /** For OpenAPI: a ref string like `#/components/schemas/User`. */
        schemaRef?: string;
        /** v-model binding for the current value. */
        modelValue?: unknown;
        /**
         * Explicit `onChange` callback — wired in parallel with
         * `update:modelValue` so consumers may use either surface.
         */
        onChange?: (value: unknown) => void;
        /** Convenience: sets `readOnly` on all fields. */
        readOnly?: boolean;
        /** Convenience: sets `writeOnly` on all fields. */
        writeOnly?: boolean;
        /** Convenience: sets `description` on the root. */
        description?: string;
        /** Meta overrides applied to the root schema. */
        meta?: SchemaMeta;
        /** Per-field meta overrides — nested object mirroring schema shape. */
        fields?: Record<string, unknown>;
        /** Theme resolver. Overrides the context resolver when supplied. */
        resolver?: VueComponentResolver;
        /** Instance-scoped widgets — override context and global widgets. */
        widgets?: VueWidgetMap;
        /** Deterministic id prefix. Defaults to a per-instance `useId()` value. */
        idPrefix?: string;
        /** Called with each diagnostic emitted during schema processing. */
        onDiagnostic?: (diagnostic: Diagnostic) => void;
        /** When `true`, any diagnostic becomes a thrown error. */
        strict?: boolean;
        /** Called when schema normalisation fails. */
        onError?: (error: SchemaNormalisationError) => void;
    }>(),
    {
        schemaRef: undefined,
        modelValue: undefined,
        onChange: undefined,
        readOnly: false,
        writeOnly: false,
        description: undefined,
        meta: () => ({}),
        fields: undefined,
        resolver: undefined,
        widgets: undefined,
        idPrefix: undefined,
        onDiagnostic: undefined,
        strict: false,
        onError: undefined,
    }
);

const emit = defineEmits<{
    "update:modelValue": [value: unknown];
    change: [value: unknown];
}>();

// Consume the resolver and widget contexts. Both ports return
// `undefined` when no provider is mounted in scope — the dispatcher
// then falls through to the headless resolver.
const contextResolver = VueResolverContext.consume();
const contextWidgets = VueWidgetsContext.consume();

const rootPath = computed(() => deriveIdPrefix(props.idPrefix));

const mergedMeta = computed<SchemaMeta>(() => {
    const merged: SchemaMeta = { ...props.meta };
    if (props.readOnly) merged.readOnly = true;
    if (props.writeOnly) merged.writeOnly = true;
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
    error?: SchemaNormalisationError;
}

const normalised = computed<Normalised>(() => {
    try {
        const opts =
            diagnostics.value !== undefined
                ? { diagnostics: diagnostics.value }
                : undefined;
        // Vue wraps every reactive prop in a Proxy. Zod 4 schemas
        // carry non-configurable internal data members (`_zod`) that
        // the default reactivity proxy cannot mirror — accessing them
        // through the proxy throws. `toRaw` recovers the original
        // object before passing it into `normaliseSchema`, which does
        // not need (and should not see) Vue's reactivity layer. The
        // same fix is applied to `props.modelValue` further down for
        // consistency with the React adapter, which receives raw
        // values directly.
        const rawSchema = toRaw(props.schema);
        const result = normaliseSchema(rawSchema, props.schemaRef, opts);
        return {
            jsonSchema: result.jsonSchema,
            rootMeta: result.rootMeta,
            rootDocument: result.rootDocument,
        };
    } catch (err) {
        const error =
            err instanceof SchemaNormalisationError
                ? err
                : new SchemaNormalisationError(
                      err instanceof Error
                          ? err.message
                          : "Failed to normalise schema",
                      toRaw(props.schema),
                      "unknown"
                  );
        return {
            jsonSchema: {},
            rootMeta: undefined,
            rootDocument: {},
            error,
        };
    }
});

const tree = computed<WalkedField | undefined>(() => {
    const n = normalised.value;
    if (n.error !== undefined) return undefined;
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

const effectiveValue = computed<unknown>(() => {
    if (props.modelValue !== undefined) return props.modelValue;
    return tree.value?.defaultValue;
});

function handleChange(next: unknown): void {
    emit("update:modelValue", next);
    // Vue auto-wires any `onChange="…"` template attribute as a
    // `change` event listener (the same `on<Event>` convention React
    // uses for synthetic events). To avoid invoking the same handler
    // twice — once via `emit("change", …)` and once via
    // `props.onChange(…)` — we emit the event when no explicit prop
    // handler was supplied, and call the prop directly otherwise.
    // Both paths are observable to consumers but never overlap.
    if (props.onChange !== undefined) {
        props.onChange(next);
    } else {
        emit("change", next);
    }
}

/**
 * Build the recursive `renderChild` closure. Each invocation increments
 * the depth counter so the dispatcher's `MAX_RENDER_DEPTH` cap fires
 * on truly recursive structures rather than on shallow trees.
 */
function makeRenderChild(
    currentDepth: number,
    parentPath: string
): VueRenderProps["renderChild"] {
    return (
        childTree: WalkedField,
        childValue: unknown,
        childOnChange: (v: unknown) => void,
        pathSuffix?: string
    ) => {
        const childPath = joinPath(parentPath, pathSuffix);
        return vueRenderField(
            childTree,
            childValue,
            childOnChange,
            props.resolver ?? contextResolver,
            makeRenderChild(currentDepth + 1, childPath),
            childPath,
            props.widgets,
            contextWidgets,
            currentDepth + 1
        );
    };
}

/**
 * Reactive root VNode. Recomputed whenever any reactive dependency
 * (props, contexts, tree) changes. The template renders it via
 * `<component :is="rootVNode">` — Vue accepts a VNode object as the
 * target of `:is`, which lets us drive the render from a render
 * function while keeping the SFC `<template>` block as the single
 * mount point.
 */
const rootVNode = computed<VNode>(() => {
    const t = tree.value;
    if (t === undefined) {
        const err = normalised.value.error;
        if (err !== undefined) {
            if (props.onError !== undefined) {
                props.onError(err);
                return h("span", { style: { display: "none" } });
            }
            throw err;
        }
        return h("span", { style: { display: "none" } });
    }
    const renderChild = makeRenderChild(0, rootPath.value);
    return vueRenderField(
        t,
        effectiveValue.value,
        handleChange,
        props.resolver ?? contextResolver,
        renderChild,
        rootPath.value,
        props.widgets,
        contextWidgets,
        0
    );
});
</script>

<template>
    <VNodeHost :node="rootVNode" />
</template>
