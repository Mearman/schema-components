/**
 * `<sc-string>` — Custom Element renderer for `StringField`.
 *
 * Mirrors the React `renderString` headless renderer:
 * `<input type="…">` in editable mode with `format`-aware type
 * selection (`email`, `url`, `password`, date/time variants), or a
 * `<span>` in read-only mode that linkifies safe `mailto:` / `http(s)`
 * URLs and locale-formats date/time strings.
 *
 * Exposes the following CSS parts so consumers can theme without
 * piercing the Shadow DOM:
 *
 * - `input` — the inner `<input>` element
 * - `value` — the read-only `<span>` (or `<a>` for safe link formats)
 * - `hint` — the constraint hint `<small>` element
 *
 * @packageDocumentation
 */

import { html, type TemplateResult } from "lit";
import { dateInputType } from "../../core/formats.ts";
import { fieldDomId, hintIdFor } from "../../core/idPath.ts";
import { EM_DASH, ELLIPSIS } from "../../core/cssClasses.ts";
import { isSafeHyperlink, isSafeMailtoAddress } from "../../core/uri.ts";
import { displayJsonValue } from "../../core/walkBuilders.ts";
import { constraintHint } from "../../core/constraintHint.ts";
import { BaseScElement } from "./baseElement.ts";

function formatDateTime(value: unknown): string | undefined {
    if (typeof value !== "string" || value.length === 0) return undefined;
    const date = new Date(value);
    if (isNaN(date.getTime())) return undefined;
    return date.toLocaleString();
}

function formatDate(value: unknown): string | undefined {
    if (typeof value !== "string" || value.length === 0) return undefined;
    const date = new Date(value);
    if (isNaN(date.getTime())) return undefined;
    return date.toLocaleDateString();
}

function formatTime(value: unknown): string | undefined {
    if (typeof value !== "string" || value.length === 0) return undefined;
    const date = new Date(value);
    if (isNaN(date.getTime())) return undefined;
    return date.toLocaleTimeString();
}

/**
 * Lit Custom Element rendering a string-valued schema field.
 *
 * Tag: `<sc-string>` (registered by `registerSchemaComponents`).
 */
export class ScString extends BaseScElement {
    override render(): TemplateResult {
        const id = fieldDomId(this.path);
        const strValue = typeof this.value === "string" ? this.value : "";

        if (this.readOnly) {
            return this.renderReadOnly(id, strValue);
        }
        return this.renderEditable(id, strValue);
    }

    private renderReadOnly(id: string, strValue: string): TemplateResult {
        if (strValue.length === 0) {
            return html`<span part="value" id=${id}>${EM_DASH}</span>`;
        }
        const format = this.constraints.format;
        if (format === "email" && isSafeMailtoAddress(strValue)) {
            return html`<a
                part="value"
                href=${`mailto:${strValue}`}
                id=${id}
                aria-readonly="true"
                >${strValue}</a
            >`;
        }
        if (
            (format === "uri" || format === "url") &&
            isSafeHyperlink(strValue)
        ) {
            return html`<a
                part="value"
                href=${strValue}
                id=${id}
                aria-readonly="true"
                >${strValue}</a
            >`;
        }
        if (format === "date") {
            const formatted = formatDate(strValue);
            return html`<span part="value" id=${id}
                >${formatted ?? strValue}</span
            >`;
        }
        if (format === "time") {
            const formatted = formatTime(strValue);
            return html`<span part="value" id=${id}
                >${formatted ?? strValue}</span
            >`;
        }
        if (format === "date-time" || format === "datetime") {
            const formatted = formatDateTime(strValue);
            return html`<span part="value" id=${id}
                >${formatted ?? strValue}</span
            >`;
        }
        return html`<span part="value" id=${id}>${strValue}</span>`;
    }

    private renderEditable(id: string, strValue: string): TemplateResult {
        const dateType = dateInputType(this.constraints.format);
        const hint = constraintHint(this.constraints);
        const hintTpl = this.renderHintMaybe(id, hint);
        const describedBy = hint !== undefined ? hintIdFor(id) : undefined;

        if (dateType !== undefined) {
            return html`
                <input
                    part="input"
                    id=${id}
                    type=${dateType}
                    .value=${this.writeOnly ? "" : strValue}
                    aria-describedby=${describedBy ?? ""}
                    @input=${this.handleInput}
                />
                ${hintTpl}
            `;
        }

        if (this.tree.type === "enum" && this.tree.enumValues.length > 0) {
            const enumValues = this.tree.enumValues;
            const selected = this.writeOnly ? "" : strValue;
            return html`
                <select
                    part="input"
                    id=${id}
                    .value=${selected}
                    aria-describedby=${describedBy ?? ""}
                    @change=${this.handleSelect}
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
                ${hintTpl}
            `;
        }

        const isCredential =
            this.writeOnly && this.constraints.format === "password";
        const inputType = isCredential
            ? "password"
            : this.constraints.format === "email"
              ? "email"
              : this.constraints.format === "uri"
                ? "url"
                : "text";
        const autoComplete = isCredential
            ? strValue.length > 0
                ? "current-password"
                : "new-password"
            : undefined;
        const placeholder =
            typeof this.meta.description === "string"
                ? this.meta.description
                : undefined;

        return html`
            <input
                part="input"
                id=${id}
                type=${inputType}
                autocomplete=${autoComplete ?? ""}
                .value=${this.writeOnly ? "" : strValue}
                placeholder=${placeholder ?? ""}
                minlength=${this.constraints.minLength ?? ""}
                maxlength=${this.constraints.maxLength ?? ""}
                aria-describedby=${describedBy ?? ""}
                @input=${this.handleInput}
            />
            ${hintTpl}
        `;
    }

    private renderHintMaybe(
        id: string,
        hint: string | undefined
    ): TemplateResult {
        if (hint === undefined) return html``;
        return html`<small part="hint" id=${hintIdFor(id)} class="sc-hint"
            >${hint}</small
        >`;
    }

    private handleInput = (e: Event): void => {
        const target = e.target;
        if (!(target instanceof HTMLInputElement)) return;
        this.emitChange(target.value);
    };

    private handleSelect = (e: Event): void => {
        const target = e.target;
        if (!(target instanceof HTMLSelectElement)) return;
        this.emitChange(target.value);
    };
}
