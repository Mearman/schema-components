/**
 * `<sc-conditional>` and `<sc-negation>` — Custom Element renderers
 * for the two JSON-Schema-composition variants.
 *
 * Mirror React's `renderConditional` and `renderNegation`: each clause
 * is surfaced as a labelled `<fieldset>` with a discoverable structure
 * so theme adapters and assistive tech can interpret the schema
 * constraint as well as the rendered value.
 *
 * Parts: `fieldset`, `clause`.
 *
 * @packageDocumentation
 */

import { html, type TemplateResult } from "lit";
import { SC_CLASSES } from "../../core/cssClasses.ts";
import { BaseScElement } from "./baseElement.ts";

/**
 * Lit Custom Element rendering a JSON Schema `if`/`then`/`else`
 * conditional field.
 *
 * Tag: `<sc-conditional>` (registered by `registerSchemaComponents`).
 */
export class ScConditional extends BaseScElement {
    override render(): TemplateResult {
        if (this.tree.type !== "conditional") return html``;
        const { ifClause, thenClause, elseClause } = this.tree;
        const onChange = (next: unknown): void => {
            this.emitChange(next);
        };
        return html`<fieldset part="fieldset" class=${SC_CLASSES.conditional}>
            <div part="clause" class=${SC_CLASSES.conditionalIf}>
                <strong>if:</strong>
                ${this.renderChild(ifClause, this.value, onChange)}
            </div>
            ${thenClause === undefined
                ? html``
                : html`<div part="clause" class=${SC_CLASSES.conditionalThen}>
                      <strong>then:</strong>
                      ${this.renderChild(thenClause, this.value, onChange)}
                  </div>`}
            ${elseClause === undefined
                ? html``
                : html`<div part="clause" class=${SC_CLASSES.conditionalElse}>
                      <strong>else:</strong>
                      ${this.renderChild(elseClause, this.value, onChange)}
                  </div>`}
        </fieldset>`;
    }
}

/**
 * Lit Custom Element rendering a JSON Schema `not` (negation) field.
 *
 * Tag: `<sc-negation>` (registered by `registerSchemaComponents`).
 */
export class ScNegation extends BaseScElement {
    override render(): TemplateResult {
        if (this.tree.type !== "negation") return html``;
        const onChange = (next: unknown): void => {
            this.emitChange(next);
        };
        return html`<fieldset part="fieldset" class=${SC_CLASSES.negation}>
            <strong>Must NOT match:</strong>
            ${this.renderChild(this.tree.negated, this.value, onChange)}
        </fieldset>`;
    }
}
