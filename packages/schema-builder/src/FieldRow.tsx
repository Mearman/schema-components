/**
 * Single field row — drag handle, name input, type select, required toggle,
 * expand/config, remove.
 *
 * For composite types (object, array, record, tuple), renders child fields
 * inline below the config panel.
 */
import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type {
    BuilderField,
    OnFieldChange,
    FieldType,
    FieldUpdater,
} from "./types.ts";
import { createField } from "./SchemaBuilder.tsx";
import { FieldConfig } from "./FieldConfig.tsx";
import { FieldList } from "./FieldList.tsx";

// ---------------------------------------------------------------------------
// Field type list
// ---------------------------------------------------------------------------

const FIELD_TYPES: readonly {
    readonly value: FieldType;
    readonly label: string;
}[] = [
    { value: "string", label: "String" },
    { value: "number", label: "Number" },
    { value: "integer", label: "Integer" },
    { value: "boolean", label: "Boolean" },
    { value: "enum", label: "Enum" },
    { value: "object", label: "Object" },
    { value: "array", label: "Array" },
    { value: "record", label: "Record" },
    { value: "tuple", label: "Tuple" },
    { value: "literal", label: "Literal" },
    { value: "null", label: "Null" },
    { value: "file", label: "File" },
];

function isFieldType(x: unknown): x is FieldType {
    return FIELD_TYPES.some((t) => t.value === x);
}

function typeLabel(type: FieldType): string {
    return FIELD_TYPES.find((t) => t.value === type)?.label ?? type;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function willLoseData(field: BuilderField): boolean {
    if (field.type === "object") return field.children.length > 0;
    if (field.type === "tuple") return field.prefixItems.length > 0;
    if (field.type === "array") {
        const item = field.itemField;
        return (
            Object.keys(field.constraints).length > 0 ||
            item.type !== "string" ||
            Object.keys(item.constraints).length > 0
        );
    }
    if (field.type === "record") {
        const val = field.valueField;
        return (
            Object.keys(field.constraints).length > 0 ||
            val.type !== "string" ||
            Object.keys(val.constraints).length > 0
        );
    }
    return Object.keys(field.constraints).length > 0;
}

// ---------------------------------------------------------------------------
// Type select
// ---------------------------------------------------------------------------

function TypeSelect({
    value,
    onChange,
}: {
    readonly value: FieldType;
    readonly onChange: (next: FieldType) => void;
}) {
    return (
        <select
            className="sb-field-row__type"
            value={value}
            onChange={(e) => {
                const val = e.target.value;
                if (isFieldType(val)) onChange(val);
            }}
        >
            {FIELD_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                    {t.label}
                </option>
            ))}
        </select>
    );
}

// ---------------------------------------------------------------------------
// Confirm dialog
// ---------------------------------------------------------------------------

function TypeChangeConfirm({
    pendingType,
    onConfirm,
    onCancel,
}: {
    readonly pendingType: FieldType;
    readonly onConfirm: () => void;
    readonly onCancel: () => void;
}) {
    return (
        <div className="sb-field-row__confirm" role="alert">
            <span className="sb-field-row__confirm-text">
                ⚠ Change to {typeLabel(pendingType)}? This discards all
                constraints and child fields.
            </span>
            <button
                type="button"
                className="sb-field-row__confirm-btn sb-field-row__confirm-btn--ok"
                onClick={onConfirm}
            >
                Confirm
            </button>
            <button
                type="button"
                className="sb-field-row__confirm-btn"
                onClick={onCancel}
            >
                Cancel
            </button>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Wrapper row — array items / record value (no drag, no remove)
// ---------------------------------------------------------------------------

function WrapperFieldRow({
    label,
    field,
    onChange,
}: {
    readonly label: string;
    readonly field: BuilderField;
    readonly onChange: OnFieldChange;
}) {
    const [expanded, setExpanded] = useState(false);
    const [pendingType, setPendingType] = useState<FieldType | null>(null);

    const handleTypeChange = (next: FieldType) => {
        if (willLoseData(field)) {
            setPendingType(next);
        } else {
            onChange(() =>
                createField(field.name, next, {
                    id: field.id,
                    description: field.description,
                    meta: field.meta,
                })
            );
        }
    };

    return (
        <div className="sb-wrapper-row">
            <div className="sb-wrapper-row__header">
                <span className="sb-wrapper-row__label">{label}</span>
                <TypeSelect value={field.type} onChange={handleTypeChange} />
                <button
                    type="button"
                    className="sb-field-row__expand"
                    aria-expanded={expanded}
                    aria-label={expanded ? "Collapse config" : "Expand config"}
                    onClick={() => {
                        setExpanded((e) => !e);
                    }}
                >
                    {expanded ? "▾" : "▸"}
                </button>
            </div>

            {pendingType !== null && (
                <TypeChangeConfirm
                    pendingType={pendingType}
                    onConfirm={() => {
                        setPendingType(null);
                        onChange(() =>
                            createField(field.name, pendingType, {
                                id: field.id,
                                description: field.description,
                                meta: field.meta,
                            })
                        );
                    }}
                    onCancel={() => {
                        setPendingType(null);
                    }}
                />
            )}

            {expanded && <FieldConfig field={field} onChange={onChange} />}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Main field row
// ---------------------------------------------------------------------------

export function FieldRow({
    field,
    siblingNames,
    onChange,
    onRemove,
}: {
    readonly field: BuilderField;
    readonly siblingNames?: readonly string[];
    readonly onChange: OnFieldChange;
    readonly onRemove: () => void;
}) {
    const [expanded, setExpanded] = useState(false);
    const [pendingType, setPendingType] = useState<FieldType | null>(null);

    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: field.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    const nameError: string | undefined = (() => {
        if (field.name.trim() === "") return "Name is required";
        if (siblingNames?.includes(field.name))
            return "Duplicate name — another field uses this name";
        return undefined;
    })();

    const handleTypeChange = (next: FieldType) => {
        if (willLoseData(field)) {
            setPendingType(next);
        } else {
            onChange(() =>
                createField(field.name, next, {
                    id: field.id,
                    required: field.required,
                    description: field.description,
                    meta: field.meta,
                })
            );
        }
    };

    // Handlers for object children.
    const handleChildChange = (id: string, updater: FieldUpdater) => {
        if (field.type !== "object") return;
        const children = field.children.map((c) =>
            c.id === id ? updater(c) : c
        );
        onChange(() => ({ ...field, children }));
    };
    const handleChildRemove = (id: string) => {
        if (field.type !== "object") return;
        const children = field.children.filter((c) => c.id !== id);
        onChange(() => ({ ...field, children }));
    };
    const handleChildReorder = (children: readonly BuilderField[]) => {
        if (field.type !== "object") return;
        onChange(() => ({ ...field, children }));
    };
    const handleAddChild = () => {
        if (field.type !== "object") return;
        const index = field.children.length + 1;
        const child = createField(`field_${String(index)}`);
        onChange(() => ({ ...field, children: [...field.children, child] }));
    };

    // Handlers for tuple prefixItems.
    const handleTupleItemChange = (id: string, updater: FieldUpdater) => {
        if (field.type !== "tuple") return;
        const prefixItems = field.prefixItems.map((c) =>
            c.id === id ? updater(c) : c
        );
        onChange(() => ({ ...field, prefixItems }));
    };
    const handleTupleItemRemove = (id: string) => {
        if (field.type !== "tuple") return;
        const prefixItems = field.prefixItems.filter((c) => c.id !== id);
        onChange(() => ({ ...field, prefixItems }));
    };
    const handleTupleItemReorder = (prefixItems: readonly BuilderField[]) => {
        if (field.type !== "tuple") return;
        onChange(() => ({ ...field, prefixItems }));
    };
    const handleAddTupleItem = () => {
        if (field.type !== "tuple") return;
        const index = field.prefixItems.length + 1;
        const item = createField(`item_${String(index)}`);
        onChange(() => ({
            ...field,
            prefixItems: [...field.prefixItems, item],
        }));
    };

    return (
        <div ref={setNodeRef} style={style} className="sb-field-row">
            <div className="sb-field-row__header">
                <button
                    type="button"
                    className="sb-field-row__drag"
                    aria-label="Drag to reorder"
                    {...attributes}
                    {...listeners}
                >
                    ⠿
                </button>

                <input
                    type="text"
                    className={
                        nameError !== undefined
                            ? "sb-field-row__name sb-field-row__name--error"
                            : "sb-field-row__name"
                    }
                    value={field.name}
                    placeholder="field_name"
                    aria-invalid={nameError !== undefined}
                    onChange={(e) => {
                        onChange((f) => ({ ...f, name: e.target.value }));
                    }}
                />

                <TypeSelect value={field.type} onChange={handleTypeChange} />

                <label
                    className="sb-field-row__required-label"
                    title="Mark this field as required in the JSON Schema output"
                >
                    <input
                        type="checkbox"
                        checked={field.required}
                        onChange={(e) => {
                            onChange((f) => ({
                                ...f,
                                required: e.target.checked,
                            }));
                        }}
                    />
                    Req
                </label>

                <button
                    type="button"
                    className="sb-field-row__expand"
                    aria-expanded={expanded}
                    aria-label={expanded ? "Collapse config" : "Expand config"}
                    onClick={() => {
                        setExpanded((e) => !e);
                    }}
                >
                    {expanded ? "▾" : "▸"}
                </button>

                <button
                    type="button"
                    className="sb-field-row__remove"
                    aria-label={`Remove ${field.name}`}
                    onClick={onRemove}
                >
                    ×
                </button>
            </div>

            {nameError !== undefined && (
                <p className="sb-field-row__name-hint" role="alert">
                    {nameError}
                </p>
            )}

            {pendingType !== null && (
                <TypeChangeConfirm
                    pendingType={pendingType}
                    onConfirm={() => {
                        setPendingType(null);
                        onChange(() =>
                            createField(field.name, pendingType, {
                                id: field.id,
                                required: field.required,
                                description: field.description,
                                meta: field.meta,
                            })
                        );
                    }}
                    onCancel={() => {
                        setPendingType(null);
                    }}
                />
            )}

            {expanded && <FieldConfig field={field} onChange={onChange} />}

            {/* Recursive child list for object type */}
            {field.type === "object" && (
                <div className="sb-field-children">
                    <FieldList
                        fields={field.children}
                        onChange={handleChildChange}
                        onRemove={handleChildRemove}
                        onReorder={handleChildReorder}
                    />
                    <button
                        type="button"
                        className="sb-field-children__add"
                        onClick={handleAddChild}
                    >
                        + Add property
                    </button>
                </div>
            )}

            {/* Wrapper row for array items — no drag, no remove */}
            {field.type === "array" && (
                <div className="sb-field-children">
                    <WrapperFieldRow
                        label="Items schema"
                        field={field.itemField}
                        onChange={(updater) => {
                            onChange(() => ({
                                ...field,
                                itemField: updater(field.itemField),
                            }));
                        }}
                    />
                </div>
            )}

            {/* Wrapper row for record values — no drag, no remove */}
            {field.type === "record" && (
                <div className="sb-field-children">
                    <WrapperFieldRow
                        label="Value schema"
                        field={field.valueField}
                        onChange={(updater) => {
                            onChange(() => ({
                                ...field,
                                valueField: updater(field.valueField),
                            }));
                        }}
                    />
                </div>
            )}

            {/* Ordered tuple items */}
            {field.type === "tuple" && (
                <div className="sb-field-children">
                    <p className="sb-field-children__label">Tuple items</p>
                    <FieldList
                        fields={field.prefixItems}
                        onChange={handleTupleItemChange}
                        onRemove={handleTupleItemRemove}
                        onReorder={handleTupleItemReorder}
                    />
                    <button
                        type="button"
                        className="sb-field-children__add"
                        onClick={handleAddTupleItem}
                    >
                        + Add item
                    </button>
                </div>
            )}
        </div>
    );
}
