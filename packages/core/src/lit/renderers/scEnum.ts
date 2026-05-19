/**
 * `<sc-enum>` — Custom Element renderer for `EnumField`.
 *
 * Mirrors React's `renderEnum`: `<select>` listing each option, with
 * a hint advertising any pattern / format constraints.
 *
 * Parts: `input`, `value`, `hint`.
 *
 * @packageDocumentation
 */

import { html, type TemplateResult } from "lit";
import { fieldDomId, hintIdFor } from "../../core/idPath.ts";
import { EM_DASH, ELLIPSIS } from "../../core/cssClasses.ts";
import { displayJsonValue } from "../../core/walkBuilders.ts";
import { constraintHint } from "../../core/constraintHint.ts";
import { BaseScElement } from "./baseElement.ts";

/**
 * Lit Custom Element rendering an enumerated string-valued schema
 * field.
 *
 * Tag: `<sc-enum>` (registered by `registerSchemaComponents`).
 */
export class ScEnum extends BaseScElement {
    override render(): TemplateResult {
        const id = fieldDomId(this.path);
        const enumValue = typeof this.value === "string" ? this.value : "";

        if (this.readOnly) {
            return html`<span part="value" id=${id}
                >${enumValue.length === 0 ? EM_DASH : enumValue}</span
            >`;
        }

        const enumValues =
            this.tree.type === "enum" ? this.tree.enumValues : [];
        const hint = constraintHint(this.constraints);
        const describedBy = hint !== undefined ? hintIdFor(id) : undefined;
        const selected = this.writeOnly ? "" : enumValue;

        return html`
            <select
                part="input"
                id=${id}
                .value=${selected}
                aria-describedby=${describedBy ?? ""}
                @change=${this.handleChange}
            >
                <option value="">Select${ELLIPSIS}</option>
                ${enumValues.map((v) => {
                    const display = displayJsonValue(v);
                    return html`<option
                        value=${display}
                        ?selected=${display === selected}
                    >
                        ${display}
                    </option>`;
                })}
            </select>
            ${hint === undefined
                ? html``
                : html`<small part="hint" id=${hintIdFor(id)} class="sc-hint"
                      >${hint}</small
                  >`}
        `;
    }

    private handleChange = (e: Event): void => {
        const target = e.target;
        if (!(target instanceof HTMLSelectElement)) return;
        this.emitChange(target.value);
    };
}
