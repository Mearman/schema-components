/**
 * Top-level SchemaBuilder component — holds schema state, renders the
 * field list + add button + optional JSON preview.
 */
import { useState, useCallback } from "react";
import type { BuilderField, BuilderSchema, FieldType } from "./types.ts";
import { defaultConstraints } from "./toJsonSchema.ts";
import { FieldList } from "./FieldList.tsx";
import { SchemaPreview } from "./SchemaPreview.tsx";

let nextId = 1;

function createField(name: string, type: FieldType = "string"): BuilderField {
    return {
        id: `field_${nextId++}`,
        name,
        type,
        required: false,
        description: "",
        constraints: defaultConstraints(type),
    };
}

const EMPTY_SCHEMA: BuilderSchema = {
    title: "",
    fields: [],
};

export interface SchemaBuilderProps {
    /** Controlled value. When omitted, the builder manages its own state. */
    readonly value?: BuilderSchema;
    /** Called when the schema changes. */
    readonly onChange?: (schema: BuilderSchema) => void;
    /** Show the JSON Schema preview panel. @default true */
    readonly showPreview?: boolean;
}

export function SchemaBuilder({
    value,
    onChange,
    showPreview = true,
}: SchemaBuilderProps) {
    const [internal, setInternal] = useState<BuilderSchema>(EMPTY_SCHEMA);
    const schema = value ?? internal;

    const update = useCallback(
        (next: BuilderSchema) => {
            if (value === undefined) setInternal(next);
            onChange?.(next);
        },
        [value, onChange]
    );

    const handleTitleChange = (title: string) => {
        update({ ...schema, title });
    };

    const handleFieldChange = (id: string, patch: Partial<BuilderField>) => {
        const fields = schema.fields.map((f) =>
            f.id === id ? { ...f, ...patch } : f
        );
        update({ ...schema, fields });
    };

    const handleFieldRemove = (id: string) => {
        const fields = schema.fields.filter((f) => f.id !== id);
        update({ ...schema, fields });
    };

    const handleReorder = (fields: readonly BuilderField[]) => {
        update({ ...schema, fields });
    };

    const handleAddField = () => {
        const index = schema.fields.length + 1;
        const field = createField(`field_${index}`);
        update({ ...schema, fields: [...schema.fields, field] });
    };

    return (
        <div className="sb-builder">
            <label className="sb-builder__title-label">
                Schema title
                <input
                    type="text"
                    className="sb-builder__title-input"
                    value={schema.title}
                    placeholder="MySchema"
                    onChange={(e) => {
                        handleTitleChange(e.target.value);
                    }}
                />
            </label>

            <FieldList
                fields={schema.fields}
                onChange={handleFieldChange}
                onRemove={handleFieldRemove}
                onReorder={handleReorder}
            />

            <button
                type="button"
                className="sb-builder__add"
                onClick={handleAddField}
            >
                + Add field
            </button>

            {showPreview && <SchemaPreview schema={schema} />}
        </div>
    );
}
