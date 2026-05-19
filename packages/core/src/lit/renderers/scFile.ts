/**
 * `<sc-file>` — Custom Element renderer for `FileField`.
 *
 * Mirrors React's `renderFile`: `<input type="file">` honouring the
 * schema's `contentMediaType` constraint via the `accept` attribute,
 * plus a constraint hint.
 *
 * Parts: `input`, `hint`.
 *
 * @packageDocumentation
 */

import { html, type TemplateResult } from "lit";
import { fieldDomId, hintIdFor } from "../../core/idPath.ts";
import { constraintHint } from "../../core/constraintHint.ts";
import { BaseScElement } from "./baseElement.ts";

/**
 * Lit Custom Element rendering a file-upload schema field.
 *
 * Tag: `<sc-file>` (registered by `registerSchemaComponents`).
 */
export class ScFile extends BaseScElement {
    override render(): TemplateResult {
        const id = fieldDomId(this.path);
        const accept = this.constraints.mimeTypes?.join(",");

        if (this.readOnly) {
            return html`<span part="value" id=${id}>File field</span>`;
        }

        const hint = constraintHint(this.constraints);
        const describedBy = hint !== undefined ? hintIdFor(id) : undefined;
        const ariaLabel =
            typeof this.meta.description === "string"
                ? this.meta.description
                : undefined;

        return html`
            <input
                part="input"
                id=${id}
                type="file"
                accept=${accept ?? ""}
                aria-describedby=${describedBy ?? ""}
                aria-label=${ariaLabel ?? ""}
                @change=${this.handleChange}
            />
            ${hint === undefined
                ? html``
                : html`<small part="hint" id=${hintIdFor(id)} class="sc-hint"
                      >${hint}</small
                  >`}
        `;
    }

    private handleChange = (e: Event): void => {
        const target = e.target;
        if (!(target instanceof HTMLInputElement)) return;
        const file = target.files?.[0];
        if (file !== undefined) {
            this.emitChange(file);
        }
    };
}
