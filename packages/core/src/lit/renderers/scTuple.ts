/**
 * `<sc-tuple>` — Custom Element renderer for `TupleField`.
 *
 * Mirrors React's `renderTuple`: positional rendering of every
 * `prefixItems` entry, plus rest items when present. Each entry is
 * threaded with a `[i]` path suffix so child DOM ids remain unique.
 *
 * Parts: `tuple`, `item`, `rest-item`.
 *
 * @packageDocumentation
 */

import { html, type TemplateResult } from "lit";
import { BaseScElement } from "./baseElement.ts";

function ariaLabel(description: unknown): string | undefined {
    return typeof description === "string" ? description : undefined;
}

/**
 * Lit Custom Element rendering a tuple schema field.
 *
 * Tag: `<sc-tuple>` (registered by `registerSchemaComponents`).
 */
export class ScTuple extends BaseScElement {
    override render(): TemplateResult {
        if (this.tree.type !== "tuple") return html``;
        const { prefixItems, restItems } = this.tree;
        const arr = Array.isArray(this.value) ? this.value : [];
        if (
            prefixItems.length === 0 &&
            restItems === undefined &&
            arr.length === 0
        ) {
            return html``;
        }

        const restCount =
            restItems !== undefined
                ? Math.max(arr.length - prefixItems.length, 0)
                : 0;
        const label = ariaLabel(this.meta.description);

        return html`<div part="tuple" role="group" aria-label=${label ?? ""}>
            ${prefixItems.map((element, i) => {
                const itemValue: unknown = arr[i];
                const childChange = (v: unknown): void => {
                    const next = arr.slice();
                    next[i] = v;
                    this.emitChange(next);
                };
                return html`<div part="item">
                    ${this.renderChild(
                        element,
                        itemValue,
                        childChange,
                        `[${String(i)}]`
                    )}
                </div>`;
            })}
            ${restItems === undefined
                ? html``
                : Array.from({ length: restCount }, (_, j) => {
                      const i = prefixItems.length + j;
                      const itemValue: unknown = arr[i];
                      const childChange = (v: unknown): void => {
                          const next = arr.slice();
                          next[i] = v;
                          this.emitChange(next);
                      };
                      return html`<div part="rest-item">
                          ${this.renderChild(
                              restItems,
                              itemValue,
                              childChange,
                              `[${String(i)}]`
                          )}
                      </div>`;
                  })}
        </div>`;
    }
}
