/**
 * Single field row — drag handle, name input, type picker, expand/config, remove.
 */
import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { BuilderField, FieldType } from "./types.ts";
import { defaultConstraints } from "./toJsonSchema.ts";
import { FieldTypePicker } from "./FieldTypePicker.tsx";
import { FieldConfig } from "./FieldConfig.tsx";

export function FieldRow({
    field,
    onChange,
    onRemove,
}: {
    readonly field: BuilderField;
    readonly onChange: (patch: Partial<BuilderField>) => void;
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
        // Reset constraints when the type changes.
        onChange({ type: next, constraints: defaultConstraints(next) });
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
                        onChange({ name: e.target.value });
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
        </div>
    );
}
