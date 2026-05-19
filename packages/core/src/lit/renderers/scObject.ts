/**
 * `<sc-object>` — Custom Element renderer for `ObjectField`.
 *
 * Mirrors React's `renderObject`: a `<fieldset>` with one `<label>`
 * plus child renderer per property. Visibility / field-order respects
 * the same `meta.visible === false` skip and `sortFieldsByOrder()`
 * ordering as the React side.
 *
 * Parts: `fieldset`, `legend`, `field`, `label`.
 *
 * @packageDocumentation
 */

import { html, type TemplateResult } from "lit";
import { isObject } from "../../core/guards.ts";
import { sortFieldsByOrder } from "../../core/fieldOrder.ts";
import { fieldDomId } from "../../core/idPath.ts";
import { BaseScElement } from "./baseElement.ts";

/**
 * Lit Custom Element rendering an object schema field.
 *
 * Tag: `<sc-object>` (registered by `registerSchemaComponents`).
 */
export class ScObject extends BaseScElement {
    override render(): TemplateResult {
        if (this.tree.type !== "object") return html``;
        const obj = isObject(this.value) ? this.value : {};
        const sortedEntries = sortFieldsByOrder(this.tree.fields);

        return html`<fieldset part="fieldset">
            ${typeof this.meta.description === "string"
                ? html`<legend part="legend">${this.meta.description}</legend>`
                : html``}
            ${sortedEntries
                .filter(([, field]) => field.meta.visible !== false)
                .map(([key, field]) => {
                    const childValue = obj[key];
                    const childId = fieldDomId(`${this.path}.${key}`);
                    const childChange = (v: unknown): void => {
                        const updated: Record<string, unknown> = {};
                        for (const [k, val] of Object.entries(obj)) {
                            updated[k] = val;
                        }
                        updated[key] = v;
                        this.emitChange(updated);
                    };
                    const labelText =
                        typeof field.meta.description === "string"
                            ? field.meta.description
                            : key;
                    return html`<div part="field">
                        <label part="label" for=${childId}>
                            ${labelText}
                            ${field.isOptional === false
                                ? html`<span
                                      aria-hidden="true"
                                      class="sc-required"
                                  >
                                      *
                                  </span>`
                                : html``}
                        </label>
                        ${this.renderChild(field, childValue, childChange, key)}
                    </div>`;
                })}
        </fieldset>`;
    }
}
