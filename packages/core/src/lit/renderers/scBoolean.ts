/**
 * `<sc-boolean>` — Custom Element renderer for `BooleanField`.
 *
 * Mirrors React's `renderBoolean`: `<input type="checkbox">` in
 * editable mode, `Yes` / `No` text in read-only mode.
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
 * Lit Custom Element rendering a boolean-valued schema field.
 *
 * Tag: `<sc-boolean>` (registered by `registerSchemaComponents`).
 */
export class ScBoolean extends BaseScElement {
    override render(): TemplateResult {
        const id = fieldDomId(this.path);

        if (this.readOnly) {
            if (typeof this.value !== "boolean") {
                return html`<span part="value" id=${id}>${EM_DASH}</span>`;
            }
            return html`<span part="value" id=${id}
                >${this.value ? "Yes" : "No"}</span
            >`;
        }

        const ariaLabel =
            typeof this.meta.description === "string"
                ? this.meta.description
                : undefined;

        return html`<input
            part="input"
            id=${id}
            type="checkbox"
            .checked=${this.writeOnly ? false : this.value === true}
            aria-label=${ariaLabel ?? ""}
            @change=${this.handleChange}
        />`;
    }

    private handleChange = (e: Event): void => {
        const target = e.target;
        if (!(target instanceof HTMLInputElement)) return;
        this.emitChange(target.checked);
    };
}
