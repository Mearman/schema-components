/**
 * `<sc-array>` — Custom Element renderer for `ArrayField`.
 *
 * Mirrors React's `renderArray`: an ordered list in read-only mode,
 * an editable list with per-item remove and footer add buttons in
 * editable mode. Uses the same `defaultRecordValue()` helper as the
 * record renderer for new entries — the resolver-agnostic default
 * lives in `lit/recordHelpers.ts`.
 *
 * Parts: `list`, `item`, `remove`, `add`.
 *
 * @packageDocumentation
 */

import { html, type TemplateResult } from "lit";
import type { WalkedField } from "../../core/types.ts";
import { BaseScElement } from "./baseElement.ts";
import { defaultRecordValueLit } from "./recordHelpers.ts";

function ariaLabel(description: unknown): string | undefined {
    return typeof description === "string" ? description : undefined;
}

/**
 * Lit Custom Element rendering an array schema field.
 *
 * Tag: `<sc-array>` (registered by `registerSchemaComponents`).
 */
export class ScArray extends BaseScElement {
    override render(): TemplateResult {
        if (this.tree.type !== "array") return html``;
        const arr = Array.isArray(this.value) ? this.value : [];
        const element: WalkedField | undefined = this.tree.element;
        if (element === undefined) return html``;

        const label = ariaLabel(this.meta.description);

        if (this.readOnly) {
            if (arr.length === 0) return html``;
            return html`<ul part="list" role="group" aria-label=${label ?? ""}>
                ${arr.map(
                    (item, i) =>
                        html`<li part="item">
                            ${this.renderChild(
                                element,
                                item,
                                () => {
                                    /* read-only: no propagation */
                                },
                                `[${String(i)}]`
                            )}
                        </li>`
                )}
            </ul>`;
        }

        const handleRemove = (index: number): void => {
            const next = arr.slice();
            next.splice(index, 1);
            this.emitChange(next);
        };
        const handleAdd = (): void => {
            const next = arr.slice();
            next.push(defaultRecordValueLit(element));
            this.emitChange(next);
        };

        return html`<div role="group" aria-label=${label ?? ""}>
            <ul part="list">
                ${arr.map((item, i) => {
                    const childChange = (v: unknown): void => {
                        const nextArr = arr.slice();
                        nextArr[i] = v;
                        this.emitChange(nextArr);
                    };
                    return html`<li part="item">
                        ${this.renderChild(
                            element,
                            item,
                            childChange,
                            `[${String(i)}]`
                        )}
                        <button
                            part="remove"
                            type="button"
                            aria-label="Remove item ${String(i)}"
                            @click=${() => {
                                handleRemove(i);
                            }}
                        >
                            Remove
                        </button>
                    </li>`;
                })}
            </ul>
            <button
                part="add"
                type="button"
                aria-label="Add item"
                @click=${handleAdd}
            >
                Add
            </button>
        </div>`;
    }
}
