/**
 * `<sc-discriminated>` — Custom Element renderer for
 * `DiscriminatedUnionField`.
 *
 * Implements the WAI-ARIA "Tabs with Automatic Activation" pattern in
 * parity with React's `DiscriminatedUnionTabs`:
 *
 * - `ArrowRight` / `ArrowLeft` move between tabs with wrap-around
 * - `Home` / `End` jump to the first / last tab
 * - `role="tablist"` / `"tab"` / `"tabpanel"`, `aria-selected`,
 *   `aria-controls`, `aria-labelledby`
 * - Roving tabindex: the active tab carries `tabindex="0"`, the rest
 *   `tabindex="-1"`
 * - Selection and focus stay aligned on every keystroke
 *
 * Parts: `tablist`, `tab`, `tab-active`, `panel`.
 *
 * @packageDocumentation
 */

import { html, type TemplateResult } from "lit";
import { isObject } from "../../core/guards.ts";
import { panelIdFor, tabIdFor } from "../../core/idPath.ts";
import { EM_DASH } from "../../core/cssClasses.ts";
import { resolveDiscriminatedActive } from "../../core/unionMatch.ts";
import { BaseScElement } from "./baseElement.ts";

/**
 * Pure helper: convert a tab index into the new value the discriminated
 * union should emit. Mirrors React's
 * `discriminatedUnionValueForTab` so the contract is unit-testable
 * without instantiating the Custom Element.
 */
export function discriminatedUnionValueForTabLit(
    optionLabels: readonly string[],
    discKey: string,
    newIndex: number
): Record<string, string> | undefined {
    const label = optionLabels[newIndex];
    if (label === undefined) return undefined;
    return { [discKey]: label };
}

/**
 * Lit Custom Element rendering a discriminated-union schema field.
 *
 * Tag: `<sc-discriminated>` (registered by `registerSchemaComponents`).
 */
export class ScDiscriminated extends BaseScElement {
    // Tracks whether the next render should move focus to the active
    // tab. Set on every keyboard-driven tab change; cleared after the
    // focus call so initial mount and click changes never steal focus.
    private pendingFocus = false;

    override render(): TemplateResult {
        if (this.tree.type !== "discriminatedUnion") {
            if (this.value === undefined || this.value === null) {
                return html`<span part="value">${EM_DASH}</span>`;
            }
            return html`<span part="value"
                >${JSON.stringify(this.value)}</span
            >`;
        }

        const { options, discriminator: discKey } = this.tree;
        if (options.length === 0) {
            if (this.value === undefined || this.value === null) {
                return html`<span part="value">${EM_DASH}</span>`;
            }
            return html`<span part="value"
                >${JSON.stringify(this.value)}</span
            >`;
        }

        const valueObject = isObject(this.value) ? this.value : undefined;
        const { optionLabels, activeIndex, activeOption } =
            resolveDiscriminatedActive(options, discKey, valueObject);

        if (this.readOnly) {
            if (activeOption !== undefined) {
                return this.renderChild(activeOption, this.value, (next) => {
                    this.emitChange(next);
                });
            }
            return html`<span part="value">${EM_DASH}</span>`;
        }

        const panelId = panelIdFor(this.path);

        const wrapIndex = (index: number): number =>
            ((index % options.length) + options.length) % options.length;

        const handleTabChange = (newIndex: number): void => {
            const next = discriminatedUnionValueForTabLit(
                optionLabels,
                discKey,
                newIndex
            );
            if (next === undefined) return;
            this.emitChange(next);
        };

        const handleKeyDown = (e: KeyboardEvent): void => {
            let target: number | undefined;
            if (e.key === "ArrowRight") target = wrapIndex(activeIndex + 1);
            else if (e.key === "ArrowLeft") target = wrapIndex(activeIndex - 1);
            else if (e.key === "Home") target = 0;
            else if (e.key === "End") target = options.length - 1;
            if (target === undefined) return;
            e.preventDefault();
            if (target === activeIndex) return;
            this.pendingFocus = true;
            handleTabChange(target);
        };

        return html`<div part="container">
            <div
                part="tablist"
                role="tablist"
                aria-label="Select variant"
                aria-orientation="horizontal"
                @keydown=${handleKeyDown}
            >
                ${options.map((_opt, i) => {
                    const tabId = tabIdFor(this.path, i);
                    const isActive = i === activeIndex;
                    return html`<button
                        part=${isActive ? "tab tab-active" : "tab"}
                        type="button"
                        role="tab"
                        id=${tabId}
                        aria-selected=${isActive ? "true" : "false"}
                        aria-controls=${panelId}
                        tabindex=${isActive ? 0 : -1}
                        @click=${() => {
                            handleTabChange(i);
                        }}
                    >
                        ${optionLabels[i]}
                    </button>`;
                })}
            </div>
            <div
                part="panel"
                role="tabpanel"
                id=${panelId}
                aria-labelledby=${tabIdFor(this.path, activeIndex)}
            >
                ${activeOption === undefined
                    ? html``
                    : this.renderChild(activeOption, this.value, (next) => {
                          this.emitChange(next);
                      })}
            </div>
        </div>`;
    }

    override updated(): void {
        // After a keyboard-driven activeIndex change, move focus to the
        // newly active tab. Skipped on initial mount, after clicks, and
        // when the rendered tree is in a read-only state because
        // pendingFocus is only set inside handleKeyDown.
        if (!this.pendingFocus) return;
        this.pendingFocus = false;
        if (this.tree.type !== "discriminatedUnion") return;
        const { options, discriminator: discKey } = this.tree;
        const valueObject = isObject(this.value) ? this.value : undefined;
        const { activeIndex } = resolveDiscriminatedActive(
            options,
            discKey,
            valueObject
        );
        const id = tabIdFor(this.path, activeIndex);
        const root = this.shadowRoot;
        if (root === null) return;
        const tab = root.getElementById(id);
        if (tab !== null && tab instanceof HTMLElement) {
            tab.focus();
        }
    }
}
