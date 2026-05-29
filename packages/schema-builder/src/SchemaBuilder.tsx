/**
 * Top-level SchemaBuilder component — holds schema state, renders the
 * field list + add button + optional JSON preview.
 */
import { useState, useCallback } from "react";
import type {
    BuilderField,
    BuilderSchema,
    FieldMeta,
    FieldUpdater,
    FieldType,
} from "./types.ts";
import { emptyMeta } from "./toJsonSchema.ts";
import { FieldList } from "./FieldList.tsx";
import { SchemaPreview } from "./SchemaPreview.tsx";

let nextId = 1;

interface FieldBaseOverrides {
    readonly id?: string;
    readonly required?: boolean;
    readonly description?: string;
    readonly meta?: FieldMeta;
}

export function createField(
    name: string,
    type: FieldType = "string",
    overrides: FieldBaseOverrides = {}
): BuilderField {
    const id = overrides.id ?? `field_${String(nextId++)}`;
    const base = {
        id,
        name,
        required: overrides.required ?? false,
        description: overrides.description ?? "",
        meta: overrides.meta ?? emptyMeta,
    };
    switch (type) {
        case "string":
            return { ...base, type: "string", constraints: {} };
        case "number":
            return { ...base, type: "number", constraints: {} };
        case "integer":
            return { ...base, type: "integer", constraints: {} };
        case "boolean":
            return { ...base, type: "boolean", constraints: {} };
        case "enum":
            return {
                ...base,
                type: "enum",
                constraints: { values: ["option1"] },
            };
        case "object":
            return { ...base, type: "object", constraints: {}, children: [] };
        case "array":
            return {
                ...base,
                type: "array",
                constraints: {},
                itemField: createField("item"),
            };
        case "record":
            return {
                ...base,
                type: "record",
                constraints: {},
                valueField: createField("value"),
            };
        case "tuple":
            return {
                ...base,
                type: "tuple",
                constraints: {},
                prefixItems: [],
                closed: false,
            };
        case "literal":
            return {
                ...base,
                type: "literal",
                constraints: { valueRaw: '"value"' },
            };
        case "null":
            return { ...base, type: "null", constraints: {} };
        case "file":
            return { ...base, type: "file", constraints: {} };
    }
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
    /** Show the JSON Schema preview panel. */
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

    const handleFieldChange = (id: string, updater: FieldUpdater) => {
        const fields = schema.fields.map((f) => (f.id === id ? updater(f) : f));
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
        const field = createField(`field_${String(index)}`);
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

            {schema.fields.length === 0 ? (
                <div className="sb-builder__empty">
                    <p className="sb-builder__empty-text">No fields yet.</p>
                    <button
                        type="button"
                        className="sb-builder__add"
                        onClick={handleAddField}
                    >
                        + Add the first field
                    </button>
                </div>
            ) : (
                <>
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
                </>
            )}

            {showPreview && <SchemaPreview schema={schema} />}
        </div>
    );
}
