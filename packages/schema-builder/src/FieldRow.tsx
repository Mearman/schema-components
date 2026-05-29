/**
 * Single field row — drag handle, name input, type picker, expand/config, remove.
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
import { FieldTypePicker } from "./FieldTypePicker.tsx";
import { FieldConfig } from "./FieldConfig.tsx";
import { FieldList } from "./FieldList.tsx";

export function FieldRow({
    field,
    onChange,
    onRemove,
}: {
    readonly field: BuilderField;
    readonly onChange: OnFieldChange;
    readonly onRemove: () => void;
}) {
    const [expanded, setExpanded] = useState(false);

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

    const handleTypeChange = (next: FieldType) => {
        const fresh = createField(field.name, next, {
            id: field.id,
            required: field.required,
            description: field.description,
            meta: field.meta,
        });
        onChange(() => fresh);
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
                    className="sb-field-row__name"
                    value={field.name}
                    placeholder="field_name"
                    onChange={(e) => {
                        onChange((f) => ({ ...f, name: e.target.value }));
                    }}
                />

                <FieldTypePicker
                    value={field.type}
                    onChange={handleTypeChange}
                />

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

            {/* Inline item field editor for array type */}
            {field.type === "array" && (
                <div className="sb-field-children">
                    <p className="sb-field-children__label">Items schema</p>
                    <FieldRow
                        field={field.itemField}
                        onChange={(updater) => {
                            onChange(() => ({
                                ...field,
                                itemField: updater(field.itemField),
                            }));
                        }}
                        onRemove={() => {
                            // Item field cannot be removed — reset to default string.
                            onChange(() => ({
                                ...field,
                                itemField: createField("item"),
                            }));
                        }}
                    />
                </div>
            )}

            {/* Inline value schema editor for record type */}
            {field.type === "record" && (
                <div className="sb-field-children">
                    <p className="sb-field-children__label">Value schema</p>
                    <FieldRow
                        field={field.valueField}
                        onChange={(updater) => {
                            onChange(() => ({
                                ...field,
                                valueField: updater(field.valueField),
                            }));
                        }}
                        onRemove={() => {
                            onChange(() => ({
                                ...field,
                                valueField: createField("value"),
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
