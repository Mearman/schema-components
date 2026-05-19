<script setup lang="ts">
/**
 * `<SchemaField>` — render a single field from a schema by dot-separated
 * path.
 *
 * Vue counterpart of `react/SchemaComponent.tsx`'s `<SchemaField>`.
 * Walks the full schema tree and resolves the field at the supplied
 * `path`, then renders only that field through the same Vue resolver
 * pipeline as `<SchemaComponent>`.
 *
 * Useful for embedding individual fields inside bespoke layouts (e.g.
 * a custom Vue form that lays out address fields manually but still
 * wants the schema-driven rendering for each).
 *
 * @group Components
 */
import { computed, toRaw, type VNode } from "vue";
import { walk } from "../core/walker.ts";
import type { WalkOptions } from "../core/walkBuilders.ts";
import { normaliseSchema } from "../core/adapter.ts";
import {
    resolvePath,
    resolveValue,
    setNestedValue,
} from "../core/fieldPath.ts";
import type { SchemaMeta, WalkedField } from "../core/types.ts";
import {
    SchemaFieldError,
    SchemaNormalisationError,
} from "../core/errors.ts";
import { VueResolverContext, VueWidgetsContext } from "./contexts.ts";
import { vueRenderField } from "./renderField.ts";
import { deriveIdPrefix, joinPath } from "./idPrefix.ts";
import type { VueRenderProps } from "./types.ts";
import { VNodeHost } from "./VNodeHost.ts";

const props = withDefaults(
    defineProps<{
        /** Dot-separated path to the field (e.g. `"address.city"`). */
        path: string;
        /** The schema to extract the field from. */
        schema: unknown;
        /** For OpenAPI: a ref string. */
        schemaRef?: string;
        /** Current value of the root object the field belongs to. */
        modelValue?: unknown;
        /** Explicit onChange callback. Wired alongside `update:modelValue`. */
        onChange?: (value: unknown) => void;
        /** Override meta for this specific field. */
        meta?: SchemaMeta;
        /** Deterministic id prefix. Defaults to a per-instance `useId()` value. */
        idPrefix?: string;
    }>(),
    {
        schemaRef: undefined,
        modelValue: undefined,
        onChange: undefined,
        meta: () => ({}),
        idPrefix: undefined,
    }
);

const emit = defineEmits<{
    "update:modelValue": [value: unknown];
    change: [value: unknown];
}>();

const contextResolver = VueResolverContext.consume();
const contextWidgets = VueWidgetsContext.consume();

interface Normalised {
    jsonSchema: Record<string, unknown>;
    rootMeta: SchemaMeta | undefined;
    rootDocument: Record<string, unknown>;
}

const normalised = computed<Normalised>(() => {
    try {
        // See the matching `toRaw` note in `SchemaComponent.vue` —
        // Zod schemas carry non-configurable members that Vue's
        // default reactive Proxy cannot mirror.
        const rawSchema = toRaw(props.schema);
        const result = normaliseSchema(rawSchema, props.schemaRef);
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

const fullTree = computed<WalkedField>(() => {
    const n = normalised.value;
    const walkOptions: WalkOptions = {
        componentMeta: props.meta,
        rootDocument: n.rootDocument,
    };
    if (n.rootMeta !== undefined) walkOptions.rootMeta = n.rootMeta;
    return walk(n.jsonSchema, walkOptions);
});

const fieldTree = computed<WalkedField>(() => {
    const found = resolvePath(fullTree.value, props.path);
    if (found === undefined) {
        throw new SchemaFieldError(
            `Field not found: ${props.path}`,
            toRaw(props.schema),
            props.path
        );
    }
    return found;
});

const fieldValue = computed<unknown>(() =>
    resolveValue(props.modelValue, props.path)
);

const rootBase = computed(() => deriveIdPrefix(props.idPrefix));
const rootPath = computed(() => joinPath(rootBase.value, props.path));

function handleFieldChange(nextField: unknown): void {
    const newRoot = setNestedValue(props.modelValue, props.path, nextField);
    emit("update:modelValue", newRoot);
    emit("change", newRoot);
    props.onChange?.(newRoot);
}

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
            contextResolver,
            makeRenderChild(currentDepth + 1, childPath),
            childPath,
            undefined,
            contextWidgets,
            currentDepth + 1
        );
    };
}

const rootVNode = computed<VNode>(() => {
    const renderChild = makeRenderChild(0, rootPath.value);
    return vueRenderField(
        fieldTree.value,
        fieldValue.value,
        handleFieldChange,
        contextResolver,
        renderChild,
        rootPath.value,
        undefined,
        contextWidgets,
        0
    );
});
</script>

<template>
    <VNodeHost :node="rootVNode" />
</template>
