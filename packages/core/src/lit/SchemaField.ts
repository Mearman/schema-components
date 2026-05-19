/**
 * `<schema-field>` — Lit Custom Element rendering a single field from
 * a schema by dot-separated `path`.
 *
 * Parallel to React's `<SchemaField>`. The element walks the supplied
 * schema, resolves the field at `path`, and renders just that branch.
 * Useful for forms where the layout is hand-built and each field
 * needs its own renderer slot.
 *
 * Implementation note: `<schema-field>` extends `<schema-component>`
 * so the normalisation / dispatch logic is inherited. The override
 * here intercepts the post-walk tree and substitutes the path-
 * targeted branch.
 *
 * @packageDocumentation
 */

import { html, type TemplateResult } from "lit";
import { walk } from "../core/walker.ts";
import type { WalkOptions } from "../core/walkBuilders.ts";
import { normaliseSchema } from "../core/adapter.ts";
import type { SchemaMeta, WalkedField } from "../core/types.ts";
import { SchemaFieldError, SchemaNormalisationError } from "../core/errors.ts";
import { toRecordOrUndefined } from "../core/guards.ts";
import { isObject } from "../core/guards.ts";
import { createDefaultLitResolver } from "./defaultResolver.ts";
import { SchemaComponent } from "./SchemaComponent.ts";

/**
 * Lit Custom Element rendering a single sub-field of a schema.
 *
 * Tag: `<schema-field>` (registered by `registerSchemaComponents`).
 */
export class SchemaField extends SchemaComponent {
    /**
     * Dot-separated path identifying the field to render
     * (e.g. `"address.city"` or `"tags[0]"`). Declared via `declare`
     * so Lit's accessor (installed by the static `properties` table)
     * is not shadowed by a class-field initialiser.
     */
    declare path: string;

    static override readonly properties = {
        ...SchemaComponent.properties,
        path: { attribute: false },
    };

    constructor() {
        super();
        this.path = "";
    }

    override render(): TemplateResult {
        if (this.schema === undefined || this.path.length === 0) {
            return html``;
        }

        let jsonSchema: Record<string, unknown>;
        let rootMeta: SchemaMeta | undefined;
        let rootDocument: Record<string, unknown>;
        try {
            const normalised = normaliseSchema(this.schema, this.ref);
            jsonSchema = normalised.jsonSchema;
            rootMeta = normalised.rootMeta;
            rootDocument = normalised.rootDocument;
        } catch (err: unknown) {
            if (err instanceof SchemaNormalisationError) throw err;
            throw new SchemaNormalisationError(
                err instanceof Error
                    ? err.message
                    : "Failed to normalise schema",
                this.schema,
                "unknown"
            );
        }

        const walkOptions: WalkOptions = {
            componentMeta: this.meta,
            rootMeta,
            fieldOverrides: toRecordOrUndefined(this.fields),
            rootDocument,
        };
        const root = walk(jsonSchema, walkOptions);
        const located = locateField(root, this.path);
        if (located === undefined) {
            throw new SchemaFieldError(
                `No field at path ${this.path}`,
                root,
                this.path
            );
        }
        const { tree, value } = located;
        const valueToRender = value ?? tree.defaultValue;
        const userResolver = this.resolver ?? createDefaultLitResolver();
        const renderChild = this.makeRenderChild(0, this.path, userResolver);
        return this.renderField(
            tree,
            valueToRender,
            (next) => {
                this.dispatchEvent(
                    new CustomEvent("change", {
                        detail: { value: next, path: this.path },
                    })
                );
            },
            userResolver,
            renderChild,
            this.path
        );
    }
}

// ---------------------------------------------------------------------------
// Path resolution — pure helpers, kept inline so the layer-boundary lint
// doesn't have to gain a `lit → react` exception just for fieldPath.
// ---------------------------------------------------------------------------

/**
 * Resolve a dot-separated path through a walked field tree, also
 * tracking the value at the same position. Mirrors
 * `react/fieldPath.ts::resolvePath` + `resolveValue` rolled into one.
 *
 * @internal
 */
function locateField(
    root: WalkedField,
    path: string
): { tree: WalkedField; value: unknown } | undefined {
    const segments = splitPath(path);
    let currentTree: WalkedField = root;
    let currentValue: unknown = undefined;
    for (const segment of segments) {
        const numericIndex = parseIndex(segment);
        if (numericIndex !== undefined) {
            if (currentTree.type === "array" && currentTree.element) {
                currentTree = currentTree.element;
                currentValue = Array.isArray(currentValue)
                    ? currentValue[numericIndex]
                    : undefined;
                continue;
            }
            if (currentTree.type === "tuple") {
                const next = currentTree.prefixItems[numericIndex];
                if (next === undefined) return undefined;
                currentTree = next;
                currentValue = Array.isArray(currentValue)
                    ? currentValue[numericIndex]
                    : undefined;
                continue;
            }
            return undefined;
        }
        if (currentTree.type === "object") {
            const next = currentTree.fields[segment];
            if (next === undefined) return undefined;
            currentTree = next;
            currentValue = isObject(currentValue)
                ? currentValue[segment]
                : undefined;
            continue;
        }
        if (currentTree.type === "record") {
            currentTree = currentTree.valueType;
            currentValue = isObject(currentValue)
                ? currentValue[segment]
                : undefined;
            continue;
        }
        return undefined;
    }
    return { tree: currentTree, value: currentValue };
}

/**
 * Split a dot-separated path with bracketed indices into its
 * structural segments. `"a.b[0].c"` → `["a", "b", "[0]", "c"]`.
 */
function splitPath(path: string): string[] {
    const out: string[] = [];
    let current = "";
    for (const ch of path) {
        if (ch === ".") {
            if (current.length > 0) {
                out.push(current);
                current = "";
            }
            continue;
        }
        if (ch === "[") {
            if (current.length > 0) {
                out.push(current);
            }
            current = "[";
            continue;
        }
        if (ch === "]") {
            current += "]";
            out.push(current);
            current = "";
            continue;
        }
        current += ch;
    }
    if (current.length > 0) out.push(current);
    return out;
}

/**
 * Parse a `[i]` bracketed-index segment to a number. Returns
 * `undefined` for non-numeric or non-bracketed input.
 */
function parseIndex(segment: string): number | undefined {
    if (!segment.startsWith("[") || !segment.endsWith("]")) return undefined;
    const inner = segment.slice(1, -1);
    if (inner.length === 0) return undefined;
    const n = Number(inner);
    if (!Number.isInteger(n) || n < 0) return undefined;
    return n;
}
