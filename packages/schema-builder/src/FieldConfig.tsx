/**
 * Per-field configuration panel — tabbed into Basics, Validation, and
 * Schema meta to prevent the wall-of-fieldsets anti-pattern.
 */
import { useState } from "react";
import type {
    BuilderField,
    FieldMeta,
    OnFieldChange,
    StringConstraints,
    NumberConstraints,
    EnumConstraints,
    ArrayConstraints,
    ObjectConstraints,
    RecordConstraints,
    LiteralConstraints,
    FileConstraints,
} from "./types.ts";

type ConfigTab = "basics" | "validation" | "meta";

// ---------------------------------------------------------------------------
// Live JSON parse feedback
// ---------------------------------------------------------------------------

function JsonFeedback({ raw }: { readonly raw: string | undefined }) {
    if (raw === undefined || raw.trim() === "") return null;
    try {
        const parsed: unknown = JSON.parse(raw);
        const typeStr = (() => {
            if (parsed === null) return "null";
            if (Array.isArray(parsed)) return `array(${String(parsed.length)})`;
            if (typeof parsed === "object") return "object";
            return typeof parsed;
        })();
        const preview = (() => {
            if (typeof parsed === "string") {
                const s = parsed.slice(0, 20);
                return `"${s}${parsed.length > 20 ? "…" : ""}"`;
            }
            if (typeof parsed === "number" || typeof parsed === "boolean")
                return String(parsed);
            return undefined;
        })();
        return (
            <span className="sb-field-config__json-chip">
                {typeStr}
                {preview !== undefined ? ` · ${preview}` : ""}
            </span>
        );
    } catch (err) {
        return (
            <span className="sb-field-config__json-error">
                {err instanceof Error ? err.message : "Invalid JSON"}
            </span>
        );
    }
}

// ---------------------------------------------------------------------------
// Main config panel
// ---------------------------------------------------------------------------

export function FieldConfig({
    field,
    onChange,
}: {
    readonly field: BuilderField;
    readonly onChange: OnFieldChange;
}) {
    const [activeTab, setActiveTab] = useState<ConfigTab>("basics");

    return (
        <div className="sb-field-config">
            <div className="sb-field-config__tabs" role="tablist">
                {(["basics", "validation", "meta"] as const).map((tab) => (
                    <button
                        key={tab}
                        type="button"
                        role="tab"
                        aria-selected={activeTab === tab}
                        className={
                            activeTab === tab
                                ? "sb-field-config__tab sb-field-config__tab--active"
                                : "sb-field-config__tab"
                        }
                        onClick={() => {
                            setActiveTab(tab);
                        }}
                    >
                        {tab === "basics"
                            ? "Basics"
                            : tab === "validation"
                              ? "Validation"
                              : "Schema meta"}
                    </button>
                ))}
            </div>

            {activeTab === "basics" && (
                <div className="sb-field-config__panel">
                    <label className="sb-field-config__label">
                        Description
                        <input
                            type="text"
                            className="sb-field-config__input"
                            value={field.description}
                            placeholder="Field description"
                            onChange={(e) => {
                                onChange((f) => ({
                                    ...f,
                                    description: e.target.value,
                                }));
                            }}
                        />
                    </label>
                </div>
            )}

            {activeTab === "validation" && (
                <div className="sb-field-config__panel">
                    {renderConstraints(field, onChange) ?? (
                        <p className="sb-field-config__empty-hint">
                            No constraints for this type.
                        </p>
                    )}
                </div>
            )}

            {activeTab === "meta" && (
                <div className="sb-field-config__panel">
                    <SchemaMetaPanel
                        meta={field.meta}
                        onChange={(meta) => {
                            onChange((f) => ({ ...f, meta }));
                        }}
                    />
                </div>
            )}
        </div>
    );
}

function renderConstraints(field: BuilderField, onChange: OnFieldChange) {
    switch (field.type) {
        case "string":
            return (
                <StringConfig
                    constraints={field.constraints}
                    onChange={(c) => {
                        onChange(() => ({ ...field, constraints: c }));
                    }}
                />
            );
        case "number":
        case "integer":
            return (
                <NumberConfig
                    constraints={field.constraints}
                    onChange={(c) => {
                        onChange(() => ({ ...field, constraints: c }));
                    }}
                />
            );
        case "enum":
            return (
                <EnumConfig
                    constraints={field.constraints}
                    onChange={(c) => {
                        onChange(() => ({ ...field, constraints: c }));
                    }}
                />
            );
        case "object":
            return (
                <ObjectConfig
                    constraints={field.constraints}
                    onChange={(c) => {
                        onChange(() => ({ ...field, constraints: c }));
                    }}
                />
            );
        case "array":
            return (
                <ArrayConfig
                    constraints={field.constraints}
                    onChange={(c) => {
                        onChange(() => ({ ...field, constraints: c }));
                    }}
                />
            );
        case "record":
            return (
                <RecordConfig
                    constraints={field.constraints}
                    onChange={(c) => {
                        onChange(() => ({ ...field, constraints: c }));
                    }}
                />
            );
        case "tuple":
            return (
                <label className="sb-field-config__check">
                    <input
                        type="checkbox"
                        checked={field.closed}
                        onChange={(e) => {
                            onChange(() => ({
                                ...field,
                                closed: e.target.checked,
                            }));
                        }}
                    />
                    Closed tuple (no additional items)
                </label>
            );
        case "literal":
            return (
                <LiteralConfig
                    constraints={field.constraints}
                    onChange={(c) => {
                        onChange(() => ({ ...field, constraints: c }));
                    }}
                />
            );
        case "file":
            return (
                <FileConfig
                    constraints={field.constraints}
                    onChange={(c) => {
                        onChange(() => ({ ...field, constraints: c }));
                    }}
                />
            );
        case "boolean":
        case "null":
            return null;
    }
}

// ---------------------------------------------------------------------------
// Schema meta panel
// ---------------------------------------------------------------------------

function SchemaMetaPanel({
    meta,
    onChange,
}: {
    readonly meta: FieldMeta;
    readonly onChange: (meta: FieldMeta) => void;
}) {
    const examplesCount = meta.examplesRaw
        ? meta.examplesRaw
              .split(",")
              .map((s) => s.trim())
              .filter((s) => s.length > 0).length
        : 0;

    return (
        <div className="sb-field-config__meta-grid">
            <label className="sb-field-config__label">
                Title
                <input
                    type="text"
                    className="sb-field-config__input"
                    value={meta.title ?? ""}
                    placeholder="Human-readable title"
                    onChange={(e) => {
                        const v = e.target.value;
                        onChange({
                            ...meta,
                            ...(v === "" ? {} : { title: v }),
                        });
                    }}
                />
            </label>
            <label className="sb-field-config__label">
                Default (JSON)
                <input
                    type="text"
                    className="sb-field-config__input"
                    value={meta.defaultRaw ?? ""}
                    placeholder='e.g. "hello" or 42 or true'
                    onChange={(e) => {
                        const v = e.target.value;
                        onChange({
                            ...meta,
                            ...(v === "" ? {} : { defaultRaw: v }),
                        });
                    }}
                />
                <JsonFeedback raw={meta.defaultRaw} />
            </label>
            <label className="sb-field-config__label">
                Examples (comma-separated)
                <input
                    type="text"
                    className="sb-field-config__input"
                    value={meta.examplesRaw ?? ""}
                    placeholder="foo, bar, baz"
                    onChange={(e) => {
                        const v = e.target.value;
                        onChange({
                            ...meta,
                            ...(v === "" ? {} : { examplesRaw: v }),
                        });
                    }}
                />
                {examplesCount > 0 && (
                    <span className="sb-field-config__json-chip">
                        {examplesCount} example
                        {examplesCount !== 1 ? "s" : ""}
                    </span>
                )}
            </label>
            <label className="sb-field-config__label">
                Widget hint
                <input
                    type="text"
                    className="sb-field-config__input"
                    value={meta.component ?? ""}
                    placeholder="e.g. RichTextEditor"
                    onChange={(e) => {
                        const v = e.target.value;
                        onChange({
                            ...meta,
                            ...(v === "" ? {} : { component: v }),
                        });
                    }}
                />
            </label>
            <label className="sb-field-config__label">
                Order
                <input
                    type="number"
                    className="sb-field-config__input sb-field-config__input--sm"
                    value={meta.order ?? ""}
                    onChange={(e) => {
                        const v = e.target.value;
                        onChange({
                            ...meta,
                            ...(v === "" ? {} : { order: Number(v) }),
                        });
                    }}
                />
            </label>
            <div className="sb-field-config__checks">
                <label className="sb-field-config__check">
                    <input
                        type="checkbox"
                        checked={meta.readOnly === true}
                        onChange={(e) => {
                            onChange({ ...meta, readOnly: e.target.checked });
                        }}
                    />
                    Read-only
                </label>
                <label className="sb-field-config__check">
                    <input
                        type="checkbox"
                        checked={meta.writeOnly === true}
                        onChange={(e) => {
                            onChange({ ...meta, writeOnly: e.target.checked });
                        }}
                    />
                    Write-only
                </label>
                <label className="sb-field-config__check">
                    <input
                        type="checkbox"
                        checked={meta.deprecated === true}
                        onChange={(e) => {
                            onChange({
                                ...meta,
                                deprecated: e.target.checked,
                            });
                        }}
                    />
                    Deprecated
                </label>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Per-type constraint panels
// ---------------------------------------------------------------------------

function StringConfig({
    constraints,
    onChange,
}: {
    readonly constraints: StringConstraints;
    readonly onChange: (c: StringConstraints) => void;
}) {
    return (
        <fieldset className="sb-field-config__group">
            <legend>String constraints</legend>
            <label className="sb-field-config__label">
                Min length
                <input
                    type="number"
                    className="sb-field-config__input sb-field-config__input--sm"
                    value={constraints.minLength ?? ""}
                    min={0}
                    onChange={(e) => {
                        const v = e.target.value;
                        onChange({
                            ...constraints,
                            ...(v === "" ? {} : { minLength: Number(v) }),
                        });
                    }}
                />
            </label>
            <label className="sb-field-config__label">
                Max length
                <input
                    type="number"
                    className="sb-field-config__input sb-field-config__input--sm"
                    value={constraints.maxLength ?? ""}
                    min={0}
                    onChange={(e) => {
                        const v = e.target.value;
                        onChange({
                            ...constraints,
                            ...(v === "" ? {} : { maxLength: Number(v) }),
                        });
                    }}
                />
            </label>
            <label className="sb-field-config__label">
                Pattern (regex)
                <input
                    type="text"
                    className="sb-field-config__input"
                    value={constraints.pattern ?? ""}
                    placeholder="^[a-z]+$"
                    onChange={(e) => {
                        const v = e.target.value;
                        onChange({
                            ...constraints,
                            ...(v === "" ? {} : { pattern: v }),
                        });
                    }}
                />
            </label>
            <label className="sb-field-config__label">
                Format
                <select
                    className="sb-field-config__select"
                    value={constraints.format ?? ""}
                    onChange={(e) => {
                        const v = e.target.value;
                        onChange({
                            ...constraints,
                            ...(v === "" ? {} : { format: v }),
                        });
                    }}
                >
                    <option value="">— none —</option>
                    <option value="email">email</option>
                    <option value="uri">uri</option>
                    <option value="date">date</option>
                    <option value="date-time">date-time</option>
                    <option value="time">time</option>
                    <option value="uuid">uuid</option>
                    <option value="hostname">hostname</option>
                    <option value="ipv4">ipv4</option>
                    <option value="ipv6">ipv6</option>
                </select>
            </label>
            <label className="sb-field-config__label">
                Content encoding
                <select
                    className="sb-field-config__select"
                    value={constraints.contentEncoding ?? ""}
                    onChange={(e) => {
                        const v = e.target.value;
                        onChange({
                            ...constraints,
                            ...(v === "" ? {} : { contentEncoding: v }),
                        });
                    }}
                >
                    <option value="">— none —</option>
                    <option value="base64">base64</option>
                    <option value="base64url">base64url</option>
                    <option value="quoted-printable">quoted-printable</option>
                </select>
            </label>
            <label className="sb-field-config__label">
                Content media type
                <input
                    type="text"
                    className="sb-field-config__input"
                    value={constraints.contentMediaType ?? ""}
                    placeholder="e.g. image/png"
                    onChange={(e) => {
                        const v = e.target.value;
                        onChange({
                            ...constraints,
                            ...(v === "" ? {} : { contentMediaType: v }),
                        });
                    }}
                />
            </label>
        </fieldset>
    );
}

function NumberConfig({
    constraints,
    onChange,
}: {
    readonly constraints: NumberConstraints;
    readonly onChange: (c: NumberConstraints) => void;
}) {
    return (
        <fieldset className="sb-field-config__group">
            <legend>Number constraints</legend>
            <label className="sb-field-config__label">
                Minimum
                <input
                    type="number"
                    className="sb-field-config__input sb-field-config__input--sm"
                    value={constraints.minimum ?? ""}
                    onChange={(e) => {
                        const v = e.target.value;
                        onChange({
                            ...constraints,
                            ...(v === "" ? {} : { minimum: Number(v) }),
                        });
                    }}
                />
            </label>
            <label className="sb-field-config__label">
                Maximum
                <input
                    type="number"
                    className="sb-field-config__input sb-field-config__input--sm"
                    value={constraints.maximum ?? ""}
                    onChange={(e) => {
                        const v = e.target.value;
                        onChange({
                            ...constraints,
                            ...(v === "" ? {} : { maximum: Number(v) }),
                        });
                    }}
                />
            </label>
            <label className="sb-field-config__label">
                Exclusive minimum
                <input
                    type="number"
                    className="sb-field-config__input sb-field-config__input--sm"
                    value={constraints.exclusiveMinimum ?? ""}
                    onChange={(e) => {
                        const v = e.target.value;
                        onChange({
                            ...constraints,
                            ...(v === ""
                                ? {}
                                : { exclusiveMinimum: Number(v) }),
                        });
                    }}
                />
            </label>
            <label className="sb-field-config__label">
                Exclusive maximum
                <input
                    type="number"
                    className="sb-field-config__input sb-field-config__input--sm"
                    value={constraints.exclusiveMaximum ?? ""}
                    onChange={(e) => {
                        const v = e.target.value;
                        onChange({
                            ...constraints,
                            ...(v === ""
                                ? {}
                                : { exclusiveMaximum: Number(v) }),
                        });
                    }}
                />
            </label>
            <label className="sb-field-config__label">
                Multiple of
                <input
                    type="number"
                    className="sb-field-config__input sb-field-config__input--sm"
                    value={constraints.multipleOf ?? ""}
                    min={0}
                    onChange={(e) => {
                        const v = e.target.value;
                        onChange({
                            ...constraints,
                            ...(v === "" ? {} : { multipleOf: Number(v) }),
                        });
                    }}
                />
            </label>
        </fieldset>
    );
}

function EnumConfig({
    constraints,
    onChange,
}: {
    readonly constraints: EnumConstraints;
    readonly onChange: (c: EnumConstraints) => void;
}) {
    return (
        <fieldset className="sb-field-config__group">
            <legend>Enum values</legend>
            {constraints.values.map((val, i) => (
                <div key={i} className="sb-field-config__enum-row">
                    <input
                        type="text"
                        className="sb-field-config__input"
                        value={val}
                        placeholder={`Option ${String(i + 1)}`}
                        onChange={(e) => {
                            const next = [...constraints.values];
                            next[i] = e.target.value;
                            onChange({ ...constraints, values: next });
                        }}
                    />
                    <button
                        type="button"
                        className="sb-field-config__enum-remove"
                        disabled={constraints.values.length <= 1}
                        onClick={() => {
                            const next = [...constraints.values];
                            next.splice(i, 1);
                            onChange({
                                ...constraints,
                                values: next.length === 0 ? ["option1"] : next,
                            });
                        }}
                        aria-label={`Remove ${val}`}
                    >
                        ×
                    </button>
                </div>
            ))}
            <button
                type="button"
                className="sb-field-config__enum-add"
                onClick={() => {
                    onChange({
                        ...constraints,
                        values: [...constraints.values, ""],
                    });
                }}
            >
                + Add option
            </button>
        </fieldset>
    );
}

function ArrayConfig({
    constraints,
    onChange,
}: {
    readonly constraints: ArrayConstraints;
    readonly onChange: (c: ArrayConstraints) => void;
}) {
    return (
        <fieldset className="sb-field-config__group">
            <legend>Array constraints</legend>
            <label className="sb-field-config__label">
                Min items
                <input
                    type="number"
                    className="sb-field-config__input sb-field-config__input--sm"
                    value={constraints.minItems ?? ""}
                    min={0}
                    onChange={(e) => {
                        const v = e.target.value;
                        onChange({
                            ...constraints,
                            ...(v === "" ? {} : { minItems: Number(v) }),
                        });
                    }}
                />
            </label>
            <label className="sb-field-config__label">
                Max items
                <input
                    type="number"
                    className="sb-field-config__input sb-field-config__input--sm"
                    value={constraints.maxItems ?? ""}
                    min={0}
                    onChange={(e) => {
                        const v = e.target.value;
                        onChange({
                            ...constraints,
                            ...(v === "" ? {} : { maxItems: Number(v) }),
                        });
                    }}
                />
            </label>
            <label className="sb-field-config__check">
                <input
                    type="checkbox"
                    checked={constraints.uniqueItems === true}
                    onChange={(e) => {
                        onChange({
                            ...constraints,
                            uniqueItems: e.target.checked,
                        });
                    }}
                />
                Unique items
            </label>
        </fieldset>
    );
}

function ObjectConfig({
    constraints,
    onChange,
}: {
    readonly constraints: ObjectConstraints;
    readonly onChange: (c: ObjectConstraints) => void;
}) {
    return (
        <fieldset className="sb-field-config__group">
            <legend>Object constraints</legend>
            <label className="sb-field-config__label">
                Min properties
                <input
                    type="number"
                    className="sb-field-config__input sb-field-config__input--sm"
                    value={constraints.minProperties ?? ""}
                    min={0}
                    onChange={(e) => {
                        const v = e.target.value;
                        onChange({
                            ...constraints,
                            ...(v === "" ? {} : { minProperties: Number(v) }),
                        });
                    }}
                />
            </label>
            <label className="sb-field-config__label">
                Max properties
                <input
                    type="number"
                    className="sb-field-config__input sb-field-config__input--sm"
                    value={constraints.maxProperties ?? ""}
                    min={0}
                    onChange={(e) => {
                        const v = e.target.value;
                        onChange({
                            ...constraints,
                            ...(v === "" ? {} : { maxProperties: Number(v) }),
                        });
                    }}
                />
            </label>
        </fieldset>
    );
}

function RecordConfig({
    constraints,
    onChange,
}: {
    readonly constraints: RecordConstraints;
    readonly onChange: (c: RecordConstraints) => void;
}) {
    return (
        <fieldset className="sb-field-config__group">
            <legend>Record constraints</legend>
            <label className="sb-field-config__label">
                Key pattern (regex)
                <input
                    type="text"
                    className="sb-field-config__input"
                    value={constraints.propertyNamesPattern ?? ""}
                    placeholder="^[a-z_]+$"
                    onChange={(e) => {
                        const v = e.target.value;
                        onChange({
                            ...constraints,
                            ...(v === "" ? {} : { propertyNamesPattern: v }),
                        });
                    }}
                />
            </label>
        </fieldset>
    );
}

function LiteralConfig({
    constraints,
    onChange,
}: {
    readonly constraints: LiteralConstraints;
    readonly onChange: (c: LiteralConstraints) => void;
}) {
    return (
        <fieldset className="sb-field-config__group">
            <legend>Literal value</legend>
            <label className="sb-field-config__label">
                Value (JSON)
                <input
                    type="text"
                    className="sb-field-config__input"
                    value={constraints.valueRaw}
                    placeholder='"hello" or 42 or true'
                    onChange={(e) => {
                        onChange({ ...constraints, valueRaw: e.target.value });
                    }}
                />
                <JsonFeedback raw={constraints.valueRaw} />
            </label>
        </fieldset>
    );
}

function FileConfig({
    constraints,
    onChange,
}: {
    readonly constraints: FileConstraints;
    readonly onChange: (c: FileConstraints) => void;
}) {
    return (
        <fieldset className="sb-field-config__group">
            <legend>File constraints</legend>
            <label className="sb-field-config__label">
                MIME type
                <input
                    type="text"
                    className="sb-field-config__input"
                    value={constraints.contentMediaType ?? ""}
                    placeholder="e.g. image/png or application/pdf"
                    onChange={(e) => {
                        const v = e.target.value;
                        onChange({
                            ...constraints,
                            ...(v === "" ? {} : { contentMediaType: v }),
                        });
                    }}
                />
            </label>
        </fieldset>
    );
}
