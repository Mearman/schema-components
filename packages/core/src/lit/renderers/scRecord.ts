/**
 * `<sc-record>` — Custom Element renderer for `RecordField`.
 *
 * Mirrors React's `renderRecord`: editable key/value rows with rename
 * (on input blur), per-row remove, and footer add. Read-only mode
 * collapses to a labelled list with no controls.
 *
 * Parts: `list`, `item`, `key`, `remove`, `add`.
 *
 * @packageDocumentation
 */

import { html, type TemplateResult } from "lit";
import { isObject } from "../../core/guards.ts";
import { fieldDomId } from "../../core/idPath.ts";
import { EM_DASH } from "../../core/cssClasses.ts";
import { BaseScElement } from "./baseElement.ts";
import {
    defaultRecordValueLit,
    nextRecordKeyLit,
    renameRecordKeyLit,
} from "./recordHelpers.ts";

function ariaLabel(description: unknown): string | undefined {
    return typeof description === "string" ? description : undefined;
}

/**
 * Lit Custom Element rendering a record schema field.
 *
 * Tag: `<sc-record>` (registered by `registerSchemaComponents`).
 */
export class ScRecord extends BaseScElement {
    override render(): TemplateResult {
        if (this.tree.type !== "record") return html``;
        const obj = isObject(this.value) ? this.value : {};
        const valueType = this.tree.valueType;
        const entries = Object.entries(obj);
        const label = ariaLabel(this.meta.description);

        if (this.readOnly) {
            if (entries.length === 0) {
                return html`<span part="value">${EM_DASH}</span>`;
            }
            return html`<div role="group" aria-label=${label ?? ""}>
                ${entries.map(([key, value]) => {
                    const childId = fieldDomId(`${this.path}.${key}`);
                    return html`<div part="item">
                        <label for=${childId}>${key}</label>
                        ${this.renderChild(
                            valueType,
                            value,
                            () => {
                                /* read-only: no propagation */
                            },
                            key
                        )}
                    </div>`;
                })}
            </div>`;
        }

        const handleRename = (oldKey: string, newKey: string): void => {
            const renamed = renameRecordKeyLit(obj, oldKey, newKey);
            if (renamed === obj) return;
            this.emitChange(renamed);
        };
        const handleValueChange = (key: string, next: unknown): void => {
            const updated: Record<string, unknown> = {};
            for (const [k, val] of Object.entries(obj)) {
                updated[k] = val;
            }
            updated[key] = next;
            this.emitChange(updated);
        };
        const handleRemove = (key: string): void => {
            const next: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(obj)) {
                if (k === key) continue;
                next[k] = v;
            }
            this.emitChange(next);
        };
        const handleAdd = (): void => {
            const newKey = nextRecordKeyLit(Object.keys(obj));
            const next: Record<string, unknown> = { ...obj };
            next[newKey] = defaultRecordValueLit(valueType);
            this.emitChange(next);
        };

        return html`<div part="list" role="group" aria-label=${label ?? ""}>
            ${entries.map(([key, value]) => {
                const childId = fieldDomId(`${this.path}.${key}`);
                const keyId = `${childId}-key`;
                return html`<div part="item">
                    <input
                        part="key"
                        id=${keyId}
                        type="text"
                        aria-label="Entry key"
                        .defaultValue=${key}
                        @blur=${(e: Event) => {
                            const target = e.target;
                            if (!(target instanceof HTMLInputElement)) return;
                            handleRename(key, target.value);
                        }}
                    />
                    ${this.renderChild(
                        valueType,
                        value,
                        (nextValue) => {
                            handleValueChange(key, nextValue);
                        },
                        key
                    )}
                    <button
                        part="remove"
                        type="button"
                        aria-label="Remove entry ${key}"
                        @click=${() => {
                            handleRemove(key);
                        }}
                    >
                        Remove
                    </button>
                </div>`;
            })}
            <button
                part="add"
                type="button"
                aria-label="Add entry"
                @click=${handleAdd}
            >
                Add
            </button>
        </div>`;
    }
}
