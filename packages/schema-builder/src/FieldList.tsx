/**
 * Drag-and-drop sortable field list.
 */
import {
    DndContext,
    closestCenter,
    PointerSensor,
    useSensor,
    useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import {
    SortableContext,
    verticalListSortingStrategy,
    arrayMove,
} from "@dnd-kit/sortable";
import type { BuilderField } from "./types.ts";
import { FieldRow } from "./FieldRow.tsx";

export function FieldList({
    fields,
    onChange,
    onRemove,
    onReorder,
}: {
    readonly fields: readonly BuilderField[];
    readonly onChange: (id: string, patch: Partial<BuilderField>) => void;
    readonly onRemove: (id: string) => void;
    readonly onReorder: (fields: readonly BuilderField[]) => void;
}) {
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
    );

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (over === null || active.id === over.id) return;

        const oldIndex = fields.findIndex((f) => f.id === active.id);
        const newIndex = fields.findIndex((f) => f.id === over.id);
        if (oldIndex === -1 || newIndex === -1) return;

        onReorder(arrayMove([...fields], oldIndex, newIndex));
    };

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
        >
            <SortableContext
                items={fields.map((f) => f.id)}
                strategy={verticalListSortingStrategy}
            >
                <div className="sb-field-list">
                    {fields.map((field) => (
                        <FieldRow
                            key={field.id}
                            field={field}
                            onChange={(patch) => {
                                onChange(field.id, patch);
                            }}
                            onRemove={() => {
                                onRemove(field.id);
                            }}
                        />
                    ))}
                </div>
            </SortableContext>
        </DndContext>
    );
}
