/**
 * `<sc-unknown>` — Custom Element renderer for `UnknownField`.
 *
 * Mirrors React's `renderUnknown`: a JSON-encoded fallback for
 * unconstrained values — `<input type="text">` in editable mode, a
 * `<span>` showing the stringified value in read-only mode.
 *
 * Parts: `input`, `value`.
 *
 * @packageDocumentation
 */

import { html, type TemplateResult } from "lit";
import { fieldDomId } from "../../core/idPath.ts";
import { EM_DASH } from "../../core/cssClasses.ts";
import { BaseScElement } from "./baseElement.ts";

/**
 * Lit Custom Element rendering an unconstrained (`unknown`) schema field.
 *
 * Tag: `<sc-unknown>` (registered by `registerSchemaComponents`).
 */
export class ScUnknown extends BaseScElement {
    override render(): TemplateResult {
        const id = fieldDomId(this.path);

        if (this.readOnly) {
            if (this.value === undefined || this.value === null) {
                return html`<span part="value" id=${id}>${EM_DASH}</span>`;
            }
            const display =
                typeof this.value === "string"
                    ? this.value
                    : JSON.stringify(this.value);
            return html`<span part="value" id=${id}>${display}</span>`;
        }

        const strValue = typeof this.value === "string" ? this.value : "";
        return html`<input
            part="input"
            id=${id}
            type="text"
            .value=${this.writeOnly ? "" : strValue}
            @input=${this.handleInput}
        />`;
    }

    private handleInput = (e: Event): void => {
        const target = e.target;
        if (!(target instanceof HTMLInputElement)) return;
        this.emitChange(target.value);
    };
}
