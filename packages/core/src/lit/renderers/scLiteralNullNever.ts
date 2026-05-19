/**
 * `<sc-literal>`, `<sc-null>`, `<sc-never>` — Custom Element renderers
 * for the three non-editable leaf types.
 *
 * Each emits a single `<span>` placeholder. The literal renderer
 * displays the literal value (or comma-separated list); the null and
 * never renderers display the em-dash and a `never matches` italic
 * note respectively. Mirrors the React headless renderers.
 *
 * Parts: `value`.
 *
 * @packageDocumentation
 */

import { html, type TemplateResult } from "lit";
import { fieldDomId } from "../../core/idPath.ts";
import { EM_DASH, SC_CLASSES } from "../../core/cssClasses.ts";
import { displayJsonValue } from "../../core/walkBuilders.ts";
import { BaseScElement } from "./baseElement.ts";

/**
 * Lit Custom Element rendering a `literal` schema field.
 *
 * Tag: `<sc-literal>` (registered by `registerSchemaComponents`).
 */
export class ScLiteral extends BaseScElement {
    override render(): TemplateResult {
        const id = fieldDomId(this.path);
        if (this.tree.type !== "literal") {
            return html`<span part="value" id=${id}>${EM_DASH}</span>`;
        }
        const values = this.tree.literalValues;
        if (values.length === 0) {
            return html`<span part="value" id=${id}>${EM_DASH}</span>`;
        }
        const display = values.map((v) => displayJsonValue(v)).join(", ");
        return html`<span part="value" id=${id}>${display}</span>`;
    }
}

/**
 * Lit Custom Element rendering a `null` schema field.
 *
 * Tag: `<sc-null>` (registered by `registerSchemaComponents`).
 */
export class ScNull extends BaseScElement {
    override render(): TemplateResult {
        const id = fieldDomId(this.path);
        return html`<span part="value" id=${id}>${EM_DASH}</span>`;
    }
}

/**
 * Lit Custom Element rendering a `never` schema field.
 *
 * Tag: `<sc-never>` (registered by `registerSchemaComponents`).
 */
export class ScNever extends BaseScElement {
    override render(): TemplateResult {
        const id = fieldDomId(this.path);
        return html`<span part="value" id=${id} class=${SC_CLASSES.never}
            ><em>never matches</em></span
        >`;
    }
}
