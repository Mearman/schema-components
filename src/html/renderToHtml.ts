/**
 * HTML renderer — produces semantic HTML strings from schemas.
 *
 * Framework-agnostic alternative to the React rendering pipeline.
 * Uses the same walker and adapter (normalise → walk → render) but
 * outputs HTML strings instead of ReactNode.
 *
 * Usage:
 *   import { renderToHtml } from "@scalar/schema-components/html/renderToHtml";
 *   const html = renderToHtml(userSchema, { value: userData });
 *
 * Custom resolver:
 *   const html = renderToHtml(schema, {
 *     value,
 *     resolver: { string: (props) => `<b>${escapeHtml(String(props.value))}</b>` },
 *   });
 */

import { normaliseSchema } from "../core/adapter.ts";
import type {
    FieldConstraints,
    SchemaMeta,
    WalkedField,
} from "../core/types.ts";
import { walk, type WalkOptions } from "../core/walker.ts";

// ---------------------------------------------------------------------------
// HTML resolver interface
// ---------------------------------------------------------------------------

/** Props passed to every HTML render function. */
export interface HtmlRenderProps {
    /** Current field value. */
    value: unknown;
    /** Whether to render as read-only display. */
    readOnly: boolean;
    /** Whether to render as an empty input. */
    writeOnly: boolean;
    /** Schema metadata for this field. */
    meta: SchemaMeta;
    /** Constraints from schema checks. */
    constraints: FieldConstraints;
    /** Dot-separated path from root. */
    path: string;
    /** For enums: the allowed values. */
    enumValues?: string[];
    /** For arrays: the element schema. */
    element?: WalkedField;
    /** For objects: map of field name → WalkedField. */
    fields?: Record<string, WalkedField>;
    /** For unions: the option schemas. */
    options?: WalkedField[];
    /** For discriminated unions: the discriminator key. */
    discriminator?: string;
    /** For records: key and value schemas. */
    keyType?: WalkedField;
    valueType?: WalkedField;
    /** Walked field tree for the current node. */
    tree: WalkedField;
    /**
     * Render a child field to HTML. Theme adapters call this to
     * recursively render nested structures.
     */
    renderChild: (tree: WalkedField, value: unknown) => string;
}

/** An HTML render function returns a string. */
export type HtmlRenderFunction = (props: HtmlRenderProps) => string;

/**
 * HTML resolver — maps schema types to HTML string renderers.
 * Mirror of ComponentResolver but returns string instead of unknown.
 */
export interface HtmlResolver {
    string?: HtmlRenderFunction;
    number?: HtmlRenderFunction;
    boolean?: HtmlRenderFunction;
    enum?: HtmlRenderFunction;
    object?: HtmlRenderFunction;
    array?: HtmlRenderFunction;
    record?: HtmlRenderFunction;
    union?: HtmlRenderFunction;
    literal?: HtmlRenderFunction;
    file?: HtmlRenderFunction;
    unknown?: HtmlRenderFunction;
}

// ---------------------------------------------------------------------------
// HTML resolver lookup
// ---------------------------------------------------------------------------

function getHtmlRenderFunction(
    type: WalkedField["type"],
    resolver: HtmlResolver
): HtmlRenderFunction | undefined {
    switch (type) {
        case "string":
            return resolver.string;
        case "number":
            return resolver.number;
        case "boolean":
            return resolver.boolean;
        case "enum":
            return resolver.enum;
        case "object":
            return resolver.object;
        case "array":
            return resolver.array;
        case "record":
            return resolver.record;
        case "union":
        case "discriminatedUnion":
            return resolver.union;
        case "literal":
            return resolver.literal;
        case "file":
            return resolver.file;
        default:
            return resolver.unknown;
    }
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface RenderToHtmlOptions {
    /** The data value to render. */
    value?: unknown;
    /** For OpenAPI: a ref string like "#/components/schemas/User". */
    ref?: string;
    /** Per-field meta overrides. */
    fields?: Record<string, unknown>;
    /** Meta overrides applied to the root schema. */
    meta?: SchemaMeta;
    /** Force all fields read-only. */
    readOnly?: boolean;
    /** Force all fields as inputs. */
    writeOnly?: boolean;
    /** Root description. */
    description?: string;
    /** Custom HTML resolver. Falls back to defaultHtmlResolver. */
    resolver?: HtmlResolver;
}

// ---------------------------------------------------------------------------
// HTML escaping
// ---------------------------------------------------------------------------

function escapeHtml(str: string): string {
    return str
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

// ---------------------------------------------------------------------------
// Default HTML renderers
// ---------------------------------------------------------------------------

function renderStringHtml(props: HtmlRenderProps): string {
    if (props.readOnly) {
        const strValue =
            typeof props.value === "string" ? props.value : undefined;
        if (strValue === undefined || strValue.length === 0) {
            return '<span class="sc-value sc-value--empty">—</span>';
        }
        const format = props.constraints.format;
        if (format === "email") {
            return `<a class="sc-value" href="mailto:${escapeHtml(strValue)}">${escapeHtml(strValue)}</a>`;
        }
        if (format === "uri" || format === "url") {
            return `<a class="sc-value" href="${escapeHtml(strValue)}">${escapeHtml(strValue)}</a>`;
        }
        return `<span class="sc-value">${escapeHtml(strValue)}</span>`;
    }

    const strValue = typeof props.value === "string" ? props.value : "";
    const inputType =
        props.constraints.format === "email"
            ? "email"
            : props.constraints.format === "uri"
              ? "url"
              : "text";
    const name = escapeHtml(props.path);
    const placeholder =
        typeof props.meta.description === "string"
            ? ` placeholder="${escapeHtml(props.meta.description)}"`
            : "";
    const minLength =
        props.constraints.minLength !== undefined
            ? ` minlength="${String(props.constraints.minLength)}"`
            : "";
    const maxLength =
        props.constraints.maxLength !== undefined
            ? ` maxlength="${String(props.constraints.maxLength)}"`
            : "";
    const value = props.writeOnly ? "" : ` value="${escapeHtml(strValue)}"`;

    return `<input class="sc-input" type="${inputType}" name="${name}"${value}${placeholder}${minLength}${maxLength}>`;
}

function renderNumberHtml(props: HtmlRenderProps): string {
    if (props.readOnly) {
        if (typeof props.value !== "number") {
            return '<span class="sc-value sc-value--empty">—</span>';
        }
        return `<span class="sc-value">${escapeHtml(props.value.toLocaleString())}</span>`;
    }

    const numValue = typeof props.value === "number" ? String(props.value) : "";
    const name = escapeHtml(props.path);
    const min =
        props.constraints.minimum !== undefined
            ? ` min="${String(props.constraints.minimum)}"`
            : "";
    const max =
        props.constraints.maximum !== undefined
            ? ` max="${String(props.constraints.maximum)}"`
            : "";
    const value = props.writeOnly ? "" : ` value="${escapeHtml(numValue)}"`;

    return `<input class="sc-input" type="number" name="${name}"${value}${min}${max}>`;
}

function renderBooleanHtml(props: HtmlRenderProps): string {
    if (props.readOnly) {
        if (typeof props.value !== "boolean") {
            return '<span class="sc-value sc-value--empty">—</span>';
        }
        return props.value
            ? '<span class="sc-value sc-value--boolean">Yes</span>'
            : '<span class="sc-value sc-value--boolean">No</span>';
    }

    const name = escapeHtml(props.path);
    const checked = props.value === true ? " checked" : "";

    return `<input class="sc-input" type="checkbox" name="${name}"${checked}>`;
}

function renderEnumHtml(props: HtmlRenderProps): string {
    const enumValue = typeof props.value === "string" ? props.value : "";

    if (props.readOnly) {
        if (enumValue.length === 0) {
            return '<span class="sc-value sc-value--empty">—</span>';
        }
        return `<span class="sc-value">${escapeHtml(enumValue)}</span>`;
    }

    const name = escapeHtml(props.path);
    const selectedValue = props.writeOnly ? "" : enumValue;
    const options = (props.enumValues ?? [])
        .map((v) => {
            const sel = v === selectedValue ? " selected" : "";
            return `<option value="${escapeHtml(v)}"${sel}>${escapeHtml(v)}</option>`;
        })
        .join("");

    return `<select class="sc-input" name="${name}"><option value="">Select…</option>${options}</select>`;
}

function renderObjectHtml(props: HtmlRenderProps): string {
    const fields = props.fields;
    if (fields === undefined) return "";

    const isRecord = (v: unknown): v is Record<string, unknown> =>
        typeof v === "object" && v !== null && !Array.isArray(v);
    const obj = isRecord(props.value) ? props.value : {};

    if (props.readOnly) {
        const entries = Object.entries(fields)
            .map(([key, field]) => {
                const label =
                    typeof field.meta.description === "string"
                        ? escapeHtml(field.meta.description)
                        : escapeHtml(key);
                const childValue = obj[key];
                const childHtml = props.renderChild(field, childValue);
                return `<dt class="sc-label">${label}</dt><dd class="sc-value">${childHtml}</dd>`;
            })
            .join("");

        const legend =
            typeof props.meta.description === "string"
                ? `<legend>${escapeHtml(props.meta.description)}</legend>`
                : "";
        return `<dl class="sc-object">${legend}${entries}</dl>`;
    }

    const entries = Object.entries(fields)
        .map(([key, field]) => {
            const label =
                typeof field.meta.description === "string"
                    ? escapeHtml(field.meta.description)
                    : escapeHtml(key);
            const inputId = `sc-${escapeHtml(props.path ? `${props.path}-${key}` : key)}`;
            const childValue = obj[key];
            const childHtml = props.renderChild(field, childValue);
            return `<div class="sc-field"><label class="sc-label" for="${inputId}">${label}</label>${childHtml}</div>`;
        })
        .join("");

    const legend =
        typeof props.meta.description === "string"
            ? `<legend>${escapeHtml(props.meta.description)}</legend>`
            : "";
    return `<fieldset class="sc-object">${legend}${entries}</fieldset>`;
}

function renderArrayHtml(props: HtmlRenderProps): string {
    const arr = Array.isArray(props.value) ? props.value : [];
    const element = props.element;
    if (element === undefined) return "";

    const items = arr
        .map((item) => {
            const childHtml = props.renderChild(element, item);
            return `<li class="sc-item">${childHtml}</li>`;
        })
        .join("");

    if (props.readOnly) {
        return `<ul class="sc-array">${items}</ul>`;
    }

    return `<div class="sc-array">${items}</div>`;
}

function renderRecordHtml(props: HtmlRenderProps): string {
    const isRecord = (v: unknown): v is Record<string, unknown> =>
        typeof v === "object" && v !== null && !Array.isArray(v);
    const obj = isRecord(props.value) ? props.value : {};
    const valueType = props.valueType;
    if (valueType === undefined) return "";

    const entries = Object.entries(obj)
        .map(([key, val]) => {
            const childHtml = props.renderChild(valueType, val);
            const label = escapeHtml(key);
            if (props.readOnly) {
                return `<dt class="sc-label">${label}</dt><dd class="sc-value">${childHtml}</dd>`;
            }
            return `<div class="sc-field"><label class="sc-label">${label}</label>${childHtml}</div>`;
        })
        .join("");

    if (props.readOnly) return `<dl class="sc-record">${entries}</dl>`;
    return `<div class="sc-record">${entries}</div>`;
}

function renderLiteralHtml(props: HtmlRenderProps): string {
    const values = props.tree.literalValues;
    if (values === undefined || values.length === 0) {
        return '<span class="sc-value sc-value--empty">—</span>';
    }
    const display = values
        .map((v) => (v === null ? "null" : escapeHtml(String(v))))
        .join(", ");
    return `<span class="sc-value">${display}</span>`;
}

function renderUnionHtml(props: HtmlRenderProps): string {
    // For unions, try to render the first matching option
    const options = props.options;
    if (options === undefined || options.length === 0) {
        if (props.value === undefined || props.value === null) {
            return '<span class="sc-value sc-value--empty">—</span>';
        }
        return `<span class="sc-value">${escapeHtml(JSON.stringify(props.value))}</span>`;
    }

    // Render using the first option that matches the value type
    const matched = matchUnionOption(options, props.value);
    if (matched !== undefined) {
        return props.renderChild(matched, props.value);
    }

    // Fallback: render with the first option
    const firstOption = options[0];
    if (firstOption !== undefined) {
        return props.renderChild(firstOption, props.value);
    }
    return '<span class="sc-value sc-value--empty">—</span>';
}

function renderUnknownHtml(props: HtmlRenderProps): string {
    if (props.readOnly) {
        if (props.value === undefined || props.value === null) {
            return '<span class="sc-value sc-value--empty">—</span>';
        }
        if (typeof props.value === "string") {
            return `<span class="sc-value">${escapeHtml(props.value)}</span>`;
        }
        return `<span class="sc-value">${escapeHtml(JSON.stringify(props.value))}</span>`;
    }

    const strValue = typeof props.value === "string" ? props.value : "";
    const name = escapeHtml(props.path);
    const value = props.writeOnly ? "" : ` value="${escapeHtml(strValue)}"`;

    return `<input class="sc-input" type="text" name="${name}"${value}>`;
}

// ---------------------------------------------------------------------------
// Union matching heuristic
// ---------------------------------------------------------------------------

function matchUnionOption(
    options: WalkedField[],
    value: unknown
): WalkedField | undefined {
    if (typeof value === "string") {
        return options.find((o) => o.type === "string" || o.type === "enum");
    }
    if (typeof value === "number") {
        return options.find((o) => o.type === "number");
    }
    if (typeof value === "boolean") {
        return options.find((o) => o.type === "boolean");
    }
    if (Array.isArray(value)) {
        return options.find((o) => o.type === "array");
    }
    if (typeof value === "object" && value !== null) {
        return options.find((o) => o.type === "object");
    }
    return undefined;
}

// ---------------------------------------------------------------------------
// Default resolver
// ---------------------------------------------------------------------------

export const defaultHtmlResolver: HtmlResolver = {
    string: renderStringHtml,
    number: renderNumberHtml,
    boolean: renderBooleanHtml,
    enum: renderEnumHtml,
    object: renderObjectHtml,
    array: renderArrayHtml,
    record: renderRecordHtml,
    literal: renderLiteralHtml,
    union: renderUnionHtml,
    unknown: renderUnknownHtml,
};

// ---------------------------------------------------------------------------
// renderToHtml — main entry point
// ---------------------------------------------------------------------------

/**
 * Render a schema to an HTML string.
 *
 * @param schema - Zod schema, JSON Schema, or OpenAPI document
 * @param options - Value, overrides, and resolver options
 * @returns Semantic HTML string with `sc-` prefixed classes
 */
export function renderToHtml(
    schema: unknown,
    options: RenderToHtmlOptions = {}
): string {
    const mergedMeta: SchemaMeta = { ...options.meta };
    if (options.readOnly === true) mergedMeta.readOnly = true;
    if (options.writeOnly === true) mergedMeta.writeOnly = true;
    if (options.description !== undefined)
        mergedMeta.description = options.description;

    // Normalise input → JSON Schema
    const normalised = normaliseSchema(schema, options.ref);
    const { jsonSchema, rootMeta, rootDocument } = normalised;

    // Walk the JSON Schema tree
    const walkOptions: WalkOptions = {
        componentMeta: mergedMeta,
        rootMeta,
        fieldOverrides: options.fields,
        rootDocument,
    };

    const tree = walk(jsonSchema, walkOptions);

    // Render to HTML
    const resolver = options.resolver ?? defaultHtmlResolver;

    const renderChild = (
        childTree: WalkedField,
        childValue: unknown
    ): string => {
        return renderFieldHtml(
            childTree,
            childValue,
            resolver,
            childTree.meta.description ?? "",
            renderChild
        );
    };

    return renderFieldHtml(tree, options.value, resolver, "", renderChild);
}

// ---------------------------------------------------------------------------
// Field rendering
// ---------------------------------------------------------------------------

function renderFieldHtml(
    tree: WalkedField,
    value: unknown,
    resolver: HtmlResolver,
    path: string,
    renderChild: (tree: WalkedField, value: unknown) => string
): string {
    const mergedResolver = mergeHtmlResolvers(resolver, defaultHtmlResolver);
    const renderFn = getHtmlRenderFunction(tree.type, mergedResolver);

    if (renderFn !== undefined) {
        const props: HtmlRenderProps = {
            value,
            readOnly: tree.editability === "presentation",
            writeOnly: tree.editability === "input",
            meta: tree.meta,
            constraints: tree.constraints,
            path,
            tree,
            renderChild,
        };
        if (tree.enumValues !== undefined) props.enumValues = tree.enumValues;
        if (tree.element !== undefined) props.element = tree.element;
        if (tree.fields !== undefined) props.fields = tree.fields;
        if (tree.options !== undefined) props.options = tree.options;
        if (tree.discriminator !== undefined)
            props.discriminator = tree.discriminator;
        if (tree.keyType !== undefined) props.keyType = tree.keyType;
        if (tree.valueType !== undefined) props.valueType = tree.valueType;

        return renderFn(props);
    }

    // Fallback for unhandled types
    if (value === undefined || value === null) {
        return '<span class="sc-value sc-value--empty">—</span>';
    }
    return `<span class="sc-value">${escapeHtml(typeof value === "string" ? value : JSON.stringify(value))}</span>`;
}

// ---------------------------------------------------------------------------
// Resolver merge — user overrides fill gaps in the default
// ---------------------------------------------------------------------------

function mergeHtmlResolvers(
    user: HtmlResolver,
    fallback: HtmlResolver
): HtmlResolver {
    const merged: HtmlResolver = {};
    const userStr = user.string ?? fallback.string;
    if (userStr !== undefined) merged.string = userStr;
    const userNum = user.number ?? fallback.number;
    if (userNum !== undefined) merged.number = userNum;
    const userBool = user.boolean ?? fallback.boolean;
    if (userBool !== undefined) merged.boolean = userBool;
    const userEnum = user.enum ?? fallback.enum;
    if (userEnum !== undefined) merged.enum = userEnum;
    const userObj = user.object ?? fallback.object;
    if (userObj !== undefined) merged.object = userObj;
    const userArr = user.array ?? fallback.array;
    if (userArr !== undefined) merged.array = userArr;
    const userRec = user.record ?? fallback.record;
    if (userRec !== undefined) merged.record = userRec;
    const userUnion = user.union ?? fallback.union;
    if (userUnion !== undefined) merged.union = userUnion;
    const userLit = user.literal ?? fallback.literal;
    if (userLit !== undefined) merged.literal = userLit;
    const userFile = user.file ?? fallback.file;
    if (userFile !== undefined) merged.file = userFile;
    const userUnk = user.unknown ?? fallback.unknown;
    if (userUnk !== undefined) merged.unknown = userUnk;
    return merged;
}
