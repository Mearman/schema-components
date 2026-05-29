/**
 * Field type picker — dropdown selecting from primitive types.
 */
import { useState } from "react";
import type { FieldType } from "./types.ts";

const FIELD_TYPES: readonly {
    readonly value: FieldType;
    readonly label: string;
}[] = [
    { value: "string", label: "String" },
    { value: "number", label: "Number" },
    { value: "integer", label: "Integer" },
    { value: "boolean", label: "Boolean" },
    { value: "enum", label: "Enum" },
];

export function FieldTypePicker({
    value,
    onChange,
}: {
    readonly value: FieldType;
    readonly onChange: (next: FieldType) => void;
}) {
    const [open, setOpen] = useState(false);

    const current = FIELD_TYPES.find((t) => t.value === value);

    return (
        <div className="sb-type-picker">
            <button
                type="button"
                className="sb-type-picker__trigger"
                onClick={() => {
                    setOpen((o) => !o);
                }}
                aria-expanded={open}
                aria-haspopup="listbox"
            >
                {current?.label ?? value}
                <span className="sb-type-picker__arrow" aria-hidden="true">
                    ▾
                </span>
            </button>
            {open && (
                <ul className="sb-type-picker__dropdown" role="listbox">
                    {FIELD_TYPES.map((t) => (
                        <li
                            key={t.value}
                            role="option"
                            aria-selected={t.value === value}
                            className={
                                t.value === value
                                    ? "sb-type-picker__option sb-type-picker__option--active"
                                    : "sb-type-picker__option"
                            }
                            onClick={() => {
                                onChange(t.value);
                                setOpen(false);
                            }}
                        >
                            {t.label}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
