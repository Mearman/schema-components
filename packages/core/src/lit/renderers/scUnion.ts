/**
 * `<sc-union>` — Custom Element renderer for plain `UnionField`.
 *
 * Mirrors React's `renderUnion`: picks the structurally matching option
 * via {@link matchUnionOption} and delegates to `renderChild`. Falls
 * back to the first option when no match is found, or to the em-dash
 * placeholder when the union has no options.
 *
 * Parts: `value`.
 *
 * @packageDocumentation
 */

import { html, type TemplateResult } from "lit";
import { EM_DASH } from "../../core/cssClasses.ts";
import { matchUnionOption } from "../../core/unionMatch.ts";
import { BaseScElement } from "./baseElement.ts";

/**
 * Lit Custom Element rendering a plain union schema field.
 *
 * Tag: `<sc-union>` (registered by `registerSchemaComponents`).
 */
export class ScUnion extends BaseScElement {
    override render(): TemplateResult {
        const options =
            this.tree.type === "union" ||
            this.tree.type === "discriminatedUnion"
                ? this.tree.options
                : undefined;

        if (options === undefined || options.length === 0) {
            if (this.value === undefined || this.value === null) {
                return html`<span part="value">${EM_DASH}</span>`;
            }
            return html`<span part="value"
                >${JSON.stringify(this.value)}</span
            >`;
        }

        const matched = matchUnionOption(options, this.value);
        if (matched !== undefined) {
            return this.renderChild(matched, this.value, (next) => {
                this.emitChange(next);
            });
        }

        const firstOption = options[0];
        if (firstOption !== undefined) {
            return this.renderChild(firstOption, this.value, (next) => {
                this.emitChange(next);
            });
        }

        return html`<span part="value">${EM_DASH}</span>`;
    }
}
