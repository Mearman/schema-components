/**
 * `<sc-number>` — Custom Element renderer for `NumberField`.
 *
 * Mirrors React's `renderNumber`: `<input type="number">` with
 * integer-vs-decimal `step` and `inputmode` selection. The host
 * element narrows on `tree.type === "number"` to read `isInteger`.
 *
 * Parts: `input`, `value`, `hint`.
 *
 * @packageDocumentation
 */

import { html, type TemplateResult } from "lit";
import { fieldDomId, hintIdFor } from "../../core/idPath.ts";
import { EM_DASH } from "../../core/cssClasses.ts";
import { constraintHint } from "../../core/constraintHint.ts";
import { BaseScElement } from "./baseElement.ts";

/**
 * Lit Custom Element rendering a number-valued schema field.
 *
 * Tag: `<sc-number>` (registered by `registerSchemaComponents`).
 */
export class ScNumber extends BaseScElement {
    override render(): TemplateResult {
        const id = fieldDomId(this.path);

        if (this.readOnly) {
            if (typeof this.value !== "number") {
                return html`<span part="value" id=${id}>${EM_DASH}</span>`;
            }
            return html`<span part="value" id=${id}
                >${this.value.toLocaleString()}</span
            >`;
        }

        const numValue = typeof this.value === "number" ? this.value : "";
        const isInteger =
            this.tree.type === "number" ? this.tree.isInteger : false;
        const inputMode = isInteger ? "numeric" : "decimal";
        const multipleOf = this.constraints.multipleOf;
        const step =
            multipleOf !== undefined
                ? String(multipleOf)
                : isInteger
                  ? "1"
                  : undefined;
        const hint = constraintHint(this.constraints);
        const describedBy = hint !== undefined ? hintIdFor(id) : undefined;

        return html`
            <input
                part="input"
                id=${id}
                type="number"
                inputmode=${inputMode}
                step=${step ?? ""}
                .value=${String(this.writeOnly ? "" : numValue)}
                min=${this.constraints.minimum ?? ""}
                max=${this.constraints.maximum ?? ""}
                aria-describedby=${describedBy ?? ""}
                @input=${this.handleInput}
            />
            ${hint === undefined
                ? html``
                : html`<small part="hint" id=${hintIdFor(id)} class="sc-hint"
                      >${hint}</small
                  >`}
        `;
    }

    private handleInput = (e: Event): void => {
        const target = e.target;
        if (!(target instanceof HTMLInputElement)) return;
        this.emitChange(Number(target.value));
    };
}
