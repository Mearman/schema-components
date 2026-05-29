/**
 * Per-field configuration panel — description, required toggle, type-specific
 * constraints.
 */
import type {
    BuilderField,
    OnFieldChange,
    StringConstraints,
    NumberConstraints,
    EnumConstraints,
} from "./types.ts";

export function FieldConfig({
    field,
    onChange,
}: {
    readonly field: BuilderField;
    readonly onChange: OnFieldChange;
}) {
    return (
        <div className="sb-field-config">
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

            <label className="sb-field-config__check">
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
                Required
            </label>

            {renderConstraints(field, onChange)}
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
                        const narrowed = field;
                        onChange(() => ({ ...narrowed, constraints: c }));
                    }}
                />
            );
        case "number":
        case "integer":
            return (
                <NumberConfig
                    constraints={field.constraints}
                    onChange={(c) => {
                        const narrowed = field;
                        onChange(() => ({ ...narrowed, constraints: c }));
                    }}
                />
            );
        case "enum":
            return (
                <EnumConfig
                    constraints={field.constraints}
                    onChange={(c) => {
                        const narrowed = field;
                        onChange(() => ({ ...narrowed, constraints: c }));
                    }}
                />
            );
        case "boolean":
            return null;
    }
}

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
                </select>
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
                                values: next.length === 0
                                    ? ["option1"]
                                    : next,
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
