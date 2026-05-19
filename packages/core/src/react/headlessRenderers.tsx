/**
 * Headless renderer functions — one per schema type.
 *
 * Produces plain React elements for every schema type. These functions
 * are composed into `headlessResolver` by `headless.tsx`.
 *
 * This module contains the individual render functions, date/time helpers,
 * ID generation, union matching, and the discriminated union tabs component.
 */

import {
    isValidElement,
    useCallback,
    useEffect,
    useRef,
    type ReactNode,
} from "react";
import type { RenderProps } from "../core/renderer.ts";
import { dateInputType } from "../core/formats.ts";
import { isObject } from "../core/guards.ts";
import { sortFieldsByOrder } from "../core/fieldOrder.ts";
import type { WalkedField } from "../core/types.ts";
import { isSafeHyperlink, isSafeMailtoAddress } from "../core/uri.ts";
import { displayJsonValue } from "../core/walkBuilders.ts";
import { fieldDomId, panelIdFor, tabIdFor } from "../core/idPath.ts";
import { EM_DASH, ELLIPSIS, SC_CLASSES } from "../core/cssClasses.ts";
import {
    matchUnionOption as matchUnionOptionShared,
    resolveDiscriminatedActive,
} from "../core/unionMatch.ts";
import { ariaLabel, buildAriaAttrs, buildHintInfo } from "./a11y.ts";

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

/**
 * Coerce an unknown render result into a React node.
 * Returns `null` for unrecognised values.
 */
export function toReactNode(value: unknown): ReactNode {
    if (value === null || value === undefined) return null;
    if (
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
    )
        return value;
    if (isValidElement(value)) return value;
    return null;
}

// ---------------------------------------------------------------------------
// Date/time formatting helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Accessibility: ID generation
// ---------------------------------------------------------------------------

/**
 * Build a stable, unique input ID from the path.
 *
 * Re-exported alias for {@link fieldDomId} so external themes (shadcn,
 * MUI, mantine, radix) keep importing `inputId` from the React entry
 * point. Both the React and HTML renderers must derive the same id from
 * the same path — `fieldDomId` in `core/idPath.ts` is the single
 * source-of-truth.
 *
 * Throws on an empty path; see `fieldDomId` for the rationale.
 */
export function inputId(path: string): string {
    return fieldDomId(path);
}

// ---------------------------------------------------------------------------
// Headless renderers — one per schema type
// ---------------------------------------------------------------------------

/** Headless renderer for `StringField` — plain `<input>` / `<span>`. */
export function renderString(props: RenderProps): ReactNode {
    const id = inputId(props.path);

    if (props.readOnly) {
        const strValue =
            typeof props.value === "string" ? props.value : undefined;
        if (strValue === undefined || strValue.length === 0)
            return <span id={id}>{EM_DASH}</span>;
        const format = props.constraints.format;
        if (format === "email" && isSafeMailtoAddress(strValue))
            return (
                <a href={`mailto:${strValue}`} id={id} aria-readonly="true">
                    {strValue}
                </a>
            );
        if ((format === "uri" || format === "url") && isSafeHyperlink(strValue))
            return (
                <a href={strValue} id={id} aria-readonly="true">
                    {strValue}
                </a>
            );
        // Either the format is plain text, the URI scheme is unsafe
        // (e.g. `javascript:`), or the email contains characters that
        // could inject mailto header lines. Fall through to text
        // rendering so the value is never interpreted as a navigable URI.
        if (format === "date") {
            const formatted = formatDate(strValue);
            return <span id={id}>{formatted ?? strValue}</span>;
        }
        if (format === "time") {
            const formatted = formatTime(strValue);
            return <span id={id}>{formatted ?? strValue}</span>;
        }
        if (format === "date-time" || format === "datetime") {
            const formatted = formatDateTime(strValue);
            return <span id={id}>{formatted ?? strValue}</span>;
        }
        return <span id={id}>{strValue}</span>;
    }

    const strValue = typeof props.value === "string" ? props.value : "";
    const dateType = dateInputType(props.constraints.format);

    const ariaAttrs = buildAriaAttrs(props.tree);
    // Mirror the HTML pipeline: emit `aria-describedby` plus a sibling
    // `<small class="sc-hint">` whenever the field carries constraints
    // worth announcing. The hint id is derived from the input id so the
    // attribute resolves cleanly. When no constraints are advertised the
    // helper returns `undefined` and the renderer emits the input on its
    // own — keeping the existing single-element contract that the
    // headless-union tests rely on.
    const hintInfo = buildHintInfo(id, props.constraints);

    const renderHint = (): ReactNode =>
        hintInfo === undefined ? null : (
            <small id={hintInfo.id} className="sc-hint">
                {hintInfo.hint}
            </small>
        );

    if (dateType !== undefined) {
        const dateInput = (
            <input
                id={id}
                type={dateType}
                value={props.writeOnly ? "" : strValue}
                onChange={(e) => {
                    props.onChange(e.target.value);
                }}
                aria-describedby={hintInfo?.ariaDescribedBy}
                {...ariaAttrs}
            />
        );
        if (hintInfo === undefined) return dateInput;
        return (
            <>
                {dateInput}
                {renderHint()}
            </>
        );
    }

    if (props.tree.type === "enum" && props.tree.enumValues.length > 0) {
        const enumValues = props.tree.enumValues;
        const select = (
            <select
                id={id}
                value={strValue}
                onChange={(e) => {
                    props.onChange(e.target.value);
                }}
                aria-describedby={hintInfo?.ariaDescribedBy}
                {...ariaAttrs}
            >
                <option value="">Select{ELLIPSIS}</option>
                {enumValues.map((v) => {
                    const display = displayJsonValue(v);
                    return (
                        <option key={display} value={display}>
                            {display}
                        </option>
                    );
                })}
            </select>
        );
        if (hintInfo === undefined) return select;
        return (
            <>
                {select}
                {renderHint()}
            </>
        );
    }

    const input = (
        <input
            id={id}
            type={
                props.constraints.format === "email"
                    ? "email"
                    : props.constraints.format === "uri"
                      ? "url"
                      : "text"
            }
            value={props.writeOnly ? "" : strValue}
            onChange={(e) => {
                props.onChange(e.target.value);
            }}
            placeholder={
                typeof props.meta.description === "string"
                    ? props.meta.description
                    : undefined
            }
            minLength={props.constraints.minLength}
            maxLength={props.constraints.maxLength}
            aria-describedby={hintInfo?.ariaDescribedBy}
            {...ariaAttrs}
        />
    );
    if (hintInfo === undefined) return input;
    return (
        <>
            {input}
            {renderHint()}
        </>
    );
}

/** Headless renderer for `NumberField` — plain `<input type="number">`. */
export function renderNumber(props: RenderProps): ReactNode {
    const id = inputId(props.path);

    if (props.readOnly) {
        if (typeof props.value !== "number")
            return <span id={id}>{EM_DASH}</span>;
        return <span id={id}>{props.value.toLocaleString()}</span>;
    }

    const numValue = typeof props.value === "number" ? props.value : "";
    const ariaAttrs = buildAriaAttrs(props.tree);
    const hintInfo = buildHintInfo(id, props.constraints);

    // `tree.type === "number"` is guaranteed by the resolver dispatch.
    // Narrowing exposes `isInteger`, which controls the mobile keypad
    // hint (`inputmode`) and the spinner step.
    const isInteger =
        props.tree.type === "number" ? props.tree.isInteger : false;
    const inputMode = isInteger ? "numeric" : "decimal";
    const multipleOf = props.constraints.multipleOf;
    // Prefer the schema-declared `multipleOf` for `step`; integer
    // schemas without `multipleOf` default to `step="1"` so the spinner
    // increments cleanly. Decimal schemas without `multipleOf` omit
    // `step` so the browser default (`any`) applies.
    const step =
        multipleOf !== undefined
            ? String(multipleOf)
            : isInteger
              ? "1"
              : undefined;

    const numberInput = (
        <input
            id={id}
            type="number"
            inputMode={inputMode}
            step={step}
            value={props.writeOnly ? "" : numValue}
            onChange={(e) => {
                props.onChange(Number(e.target.value));
            }}
            min={props.constraints.minimum}
            max={props.constraints.maximum}
            aria-describedby={hintInfo?.ariaDescribedBy}
            {...ariaAttrs}
        />
    );
    if (hintInfo === undefined) return numberInput;
    return (
        <>
            {numberInput}
            <small id={hintInfo.id} className="sc-hint">
                {hintInfo.hint}
            </small>
        </>
    );
}

/** Headless renderer for `BooleanField` — plain `<input type="checkbox">`. */
export function renderBoolean(props: RenderProps): ReactNode {
    const id = inputId(props.path);

    if (props.readOnly) {
        if (typeof props.value !== "boolean")
            return <span id={id}>{EM_DASH}</span>;
        return <span id={id}>{props.value ? "Yes" : "No"}</span>;
    }

    const ariaAttrs = buildAriaAttrs(props.tree, props.meta.description);

    return (
        <input
            id={id}
            type="checkbox"
            checked={props.writeOnly ? false : props.value === true}
            onChange={(e) => {
                props.onChange(e.target.checked);
            }}
            {...ariaAttrs}
        />
    );
}

/** Headless renderer for `EnumField` — plain `<select>` listing each option. */
export function renderEnum(props: RenderProps): ReactNode {
    const id = inputId(props.path);
    const enumValue = typeof props.value === "string" ? props.value : "";

    if (props.readOnly) {
        return <span id={id}>{enumValue || EM_DASH}</span>;
    }

    const ariaAttrs = buildAriaAttrs(props.tree);
    const hintInfo = buildHintInfo(id, props.constraints);

    const enumValues = props.tree.type === "enum" ? props.tree.enumValues : [];

    const select = (
        <select
            id={id}
            value={props.writeOnly ? "" : enumValue}
            onChange={(e) => {
                props.onChange(e.target.value);
            }}
            aria-describedby={hintInfo?.ariaDescribedBy}
            {...ariaAttrs}
        >
            <option value="">Select{ELLIPSIS}</option>
            {enumValues.map((v) => {
                const display = displayJsonValue(v);
                return (
                    <option key={display} value={display}>
                        {display}
                    </option>
                );
            })}
        </select>
    );
    if (hintInfo === undefined) return select;
    return (
        <>
            {select}
            <small id={hintInfo.id} className="sc-hint">
                {hintInfo.hint}
            </small>
        </>
    );
}

/** Headless renderer for `ObjectField` — `<fieldset>` per object with one child per property. */
export function renderObject(props: RenderProps): ReactNode {
    if (props.tree.type !== "object") return null;
    const obj = isObject(props.value) ? props.value : {};
    const fields = props.tree.fields;

    const sortedEntries = sortFieldsByOrder(fields);

    return (
        <fieldset>
            {typeof props.meta.description === "string" && (
                <legend>{props.meta.description}</legend>
            )}
            {sortedEntries
                .filter(([, field]) => field.meta.visible !== false)
                .map(([key, field]) => {
                    const childValue = obj[key];
                    const childId = inputId(`${props.path}.${key}`);
                    const childOnChange = (v: unknown) => {
                        const updated: Record<string, unknown> = {};
                        for (const [k, val] of Object.entries(obj)) {
                            updated[k] = val;
                        }
                        updated[key] = v;
                        props.onChange(updated);
                    };
                    const child = toReactNode(
                        props.renderChild(field, childValue, childOnChange, key)
                    );
                    // Suppress the label when the child renders nothing
                    // (e.g. empty array in read-only mode)
                    if (child === null || child === undefined) return null;
                    // Mirror the HTML pipeline: fall back to the
                    // structural key when no description is supplied so
                    // every input has an accessible name. Without this,
                    // an undecorated `z.object({ name: z.string() })`
                    // produced an input with no `<label>` and no
                    // `aria-label`.
                    const labelText =
                        typeof field.meta.description === "string"
                            ? field.meta.description
                            : key;
                    return (
                        <div key={key}>
                            <label htmlFor={childId}>
                                {labelText}
                                {field.isOptional === false && (
                                    <span
                                        aria-hidden="true"
                                        style={{ color: "#dc2626" }}
                                    >
                                        {" "}
                                        *
                                    </span>
                                )}
                            </label>
                            {child}
                        </div>
                    );
                })}
        </fieldset>
    );
}

/**
 * Compute the default value for a freshly added record entry based on the
 * record's value-type schema. Mirrors the read of `defaultValue` used
 * elsewhere in the renderer, falling back to a type-appropriate empty value.
 */
export function defaultRecordValue(valueType: WalkedField): unknown {
    if (valueType.defaultValue !== undefined) return valueType.defaultValue;
    switch (valueType.type) {
        case "string":
            return "";
        case "number":
            return 0;
        case "boolean":
            return false;
        case "array":
            return [];
        case "object":
        case "record":
            return {};
        default:
            return undefined;
    }
}

/**
 * Generate a unique, currently-unused key for a new record entry.
 * Picks the first of `key`, `key-1`, `key-2`, … that is not in `existing`.
 */
export function nextRecordKey(
    existing: readonly string[],
    base = "key"
): string {
    if (!existing.includes(base)) return base;
    let i = 1;
    while (existing.includes(`${base}-${String(i)}`)) i += 1;
    return `${base}-${String(i)}`;
}

/**
 * Rename a key in an object while preserving insertion order. Returns the
 * original object reference when the rename is a no-op (oldKey === newKey)
 * or when newKey collides with an existing key.
 */
export function renameRecordKey(
    obj: Record<string, unknown>,
    oldKey: string,
    newKey: string
): Record<string, unknown> {
    if (oldKey === newKey) return obj;
    if (newKey in obj && newKey !== oldKey) return obj;
    const renamed: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
        renamed[k === oldKey ? newKey : k] = v;
    }
    return renamed;
}

/** Headless renderer for `RecordField` — editable key/value rows with add/remove controls. */
export function renderRecord(props: RenderProps): ReactNode {
    if (props.tree.type !== "record") return null;
    const obj = isObject(props.value) ? props.value : {};
    const valueType = props.tree.valueType;

    const entries = Object.entries(obj);

    // Read-only mode: simple labelled entries, no controls. An empty record
    // renders the em-dash placeholder to indicate no data.
    if (props.readOnly) {
        if (entries.length === 0) {
            // No `aria-readonly` — ARIA 1.2 restricts the attribute to
            // widget roles (textbox, combobox, etc.). The empty record is
            // structurally read-only by virtue of containing no controls.
            return <span>{EM_DASH}</span>;
        }
        return (
            <div role="group" aria-label={ariaLabel(props.meta.description)}>
                {entries.map(([key, value]) => {
                    const childId = inputId(`${props.path}.${key}`);
                    return (
                        <div key={key}>
                            <label htmlFor={childId}>{key}</label>
                            {toReactNode(
                                props.renderChild(
                                    valueType,
                                    value,
                                    () => {
                                        /* read-only: noop */
                                    },
                                    key
                                )
                            )}
                        </div>
                    );
                })}
            </div>
        );
    }

    // Editable mode: every key is renameable, every row has a Remove
    // button, and an Add button appends a new entry. Empty records still
    // expose the Add button so the user can populate the record.
    const handleRename = (oldKey: string, newKey: string) => {
        // Trim trailing whitespace but allow intermediate edits — empty
        // and duplicate names are simply rejected by renameRecordKey.
        const renamed = renameRecordKey(obj, oldKey, newKey);
        if (renamed === obj) return;
        props.onChange(renamed);
    };

    const handleValueChange = (key: string, nextValue: unknown) => {
        const updated: Record<string, unknown> = {};
        for (const [k, val] of Object.entries(obj)) {
            updated[k] = val;
        }
        updated[key] = nextValue;
        props.onChange(updated);
    };

    const handleRemove = (key: string) => {
        const next: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(obj)) {
            if (k === key) continue;
            next[k] = v;
        }
        props.onChange(next);
    };

    const handleAdd = () => {
        const newKey = nextRecordKey(Object.keys(obj));
        const next: Record<string, unknown> = { ...obj };
        next[newKey] = defaultRecordValue(valueType);
        props.onChange(next);
    };

    // `meta.description` is typed `unknown`; narrow it through `ariaLabel`
    // so a non-string truthy value (e.g. `{}`) is dropped rather than being
    // coerced to `"[object Object]"`. The previous `?? "Record"` fallback
    // would also have masked missing descriptions with a generic literal.
    return (
        <div role="group" aria-label={ariaLabel(props.meta.description)}>
            {entries.map(([key, value]) => {
                const childId = inputId(`${props.path}.${key}`);
                const keyId = `${childId}-key`;
                return (
                    <div key={key}>
                        <input
                            id={keyId}
                            type="text"
                            aria-label="Entry key"
                            defaultValue={key}
                            onBlur={(e) => {
                                handleRename(key, e.target.value);
                            }}
                        />
                        {toReactNode(
                            props.renderChild(
                                valueType,
                                value,
                                (nextValue: unknown) => {
                                    handleValueChange(key, nextValue);
                                },
                                key
                            )
                        )}
                        <button
                            type="button"
                            aria-label={`Remove entry ${key}`}
                            onClick={() => {
                                handleRemove(key);
                            }}
                        >
                            Remove
                        </button>
                    </div>
                );
            })}
            <button type="button" aria-label="Add entry" onClick={handleAdd}>
                Add
            </button>
        </div>
    );
}

/** Headless renderer for `ArrayField` — ordered list with add/remove controls. */
export function renderArray(props: RenderProps): ReactNode {
    if (props.tree.type !== "array") return null;
    const arr = Array.isArray(props.value) ? props.value : [];
    const element = props.tree.element;
    if (element === undefined) return null;

    // Read-only mode: render the list without controls. An empty array
    // produces no list so leaf nodes in recursive schemas do not get
    // orphaned "Children" labels.
    if (props.readOnly) {
        if (arr.length === 0) return null;
        return (
            <ul role="group" aria-label={ariaLabel(props.meta.description)}>
                {arr.map((item, i) => (
                    <li key={String(i)}>
                        {toReactNode(
                            props.renderChild(
                                element,
                                item,
                                () => {
                                    /* read-only: noop */
                                },
                                `[${String(i)}]`
                            )
                        )}
                    </li>
                ))}
            </ul>
        );
    }

    // Editable mode: every row has a Remove button and a footer Add
    // button appends a new entry. Mirrors `renderRecord`'s contract. Use
    // `<button type="button">` so the controls work keyboard-accessibly
    // (Space / Enter) without needing custom key handlers, and so they
    // don't accidentally submit an enclosing form.
    const handleRemove = (index: number) => {
        const next = arr.slice();
        next.splice(index, 1);
        props.onChange(next);
    };

    const handleAdd = () => {
        const next = arr.slice();
        next.push(defaultRecordValue(element));
        props.onChange(next);
    };

    return (
        <div role="group" aria-label={ariaLabel(props.meta.description)}>
            <ul>
                {arr.map((item, i) => {
                    const childOnChange = (v: unknown) => {
                        const nextArr = arr.slice();
                        nextArr[i] = v;
                        props.onChange(nextArr);
                    };
                    return (
                        <li key={String(i)}>
                            {toReactNode(
                                props.renderChild(
                                    element,
                                    item,
                                    childOnChange,
                                    `[${String(i)}]`
                                )
                            )}
                            <button
                                type="button"
                                aria-label={`Remove item ${String(i)}`}
                                onClick={() => {
                                    handleRemove(i);
                                }}
                            >
                                Remove
                            </button>
                        </li>
                    );
                })}
            </ul>
            <button type="button" aria-label="Add item" onClick={handleAdd}>
                Add
            </button>
        </div>
    );
}

/** Headless renderer for plain `UnionField` — picks the matching option and renders it. */
export function renderUnion(props: RenderProps): ReactNode {
    const options =
        props.tree.type === "union" || props.tree.type === "discriminatedUnion"
            ? props.tree.options
            : undefined;
    if (options === undefined || options.length === 0) {
        if (props.value === undefined || props.value === null)
            return <span>{EM_DASH}</span>;
        return <span>{JSON.stringify(props.value)}</span>;
    }

    const matched = matchUnionOptionShared(options, props.value);
    if (matched !== undefined) {
        return toReactNode(
            props.renderChild(matched, props.value, props.onChange)
        );
    }

    const firstOption = options[0];
    if (firstOption !== undefined) {
        return toReactNode(
            props.renderChild(firstOption, props.value, props.onChange)
        );
    }

    return <span>{EM_DASH}</span>;
}

// ---------------------------------------------------------------------------
// Discriminated union — WAI-ARIA tabs pattern
// ---------------------------------------------------------------------------

/** Headless renderer for `DiscriminatedUnionField` — tabbed UI driven by the discriminator. */
export function renderDiscriminatedUnion(props: RenderProps): ReactNode {
    // Narrow once at the top — the surrounding props.tree.type check
    // guarantees `discriminator: string` (see DiscriminatedUnionField in
    // core/types.ts). The previous `discriminator ?? ""` fallback was dead
    // and masked the type-system guarantee.
    if (props.tree.type !== "discriminatedUnion") {
        if (props.value === undefined || props.value === null)
            return <span>{EM_DASH}</span>;
        return <span>{JSON.stringify(props.value)}</span>;
    }
    const { options, discriminator: discKey } = props.tree;
    if (options.length === 0) {
        if (props.value === undefined || props.value === null)
            return <span>{EM_DASH}</span>;
        return <span>{JSON.stringify(props.value)}</span>;
    }

    const valueObject = isObject(props.value) ? props.value : undefined;
    const { optionLabels, activeIndex, activeOption } =
        resolveDiscriminatedActive(options, discKey, valueObject);

    if (props.readOnly) {
        if (activeOption !== undefined) {
            return toReactNode(
                props.renderChild(activeOption, props.value, props.onChange)
            );
        }
        return <span>{EM_DASH}</span>;
    }

    return (
        <DiscriminatedUnionTabs
            options={options}
            optionLabels={optionLabels}
            activeIndex={activeIndex}
            path={props.path}
            discKey={discKey}
            props={props}
        />
    );
}

/**
 * Pure helper: convert a tab index into the new value the discriminated
 * union should emit. Returns `undefined` when the index is out of bounds.
 *
 * Extracted from `DiscriminatedUnionTabs` so the contract is unit-testable
 * without rendering the tabs component (which relies on React hooks).
 */
export function discriminatedUnionValueForTab(
    optionLabels: readonly string[],
    discKey: string,
    newIndex: number
): Record<string, string> | undefined {
    const label = optionLabels[newIndex];
    if (label === undefined) return undefined;
    return { [discKey]: label };
}

/**
 * WAI-ARIA tabs component for discriminated unions.
 *
 * Implements the WAI-ARIA "Tabs with Automatic Activation" pattern
 * (https://www.w3.org/WAI/ARIA/apg/patterns/tabs/):
 * - ArrowRight / ArrowLeft move between tabs, wrapping at the extremes
 * - Home / End jump to the first / last tab
 * - aria-selected, aria-controls, role="tablist" / "tab" / "tabpanel"
 * - Roving tabindex: the active tab has tabindex=0, the rest tabindex=-1
 *
 * "Automatic activation" means each arrow key both moves focus and
 * activates the new tab in one step — selection and focus stay aligned.
 */
function DiscriminatedUnionTabs({
    options,
    optionLabels,
    activeIndex,
    path,
    discKey,
    props,
}: {
    options: readonly WalkedField[];
    optionLabels: readonly string[];
    activeIndex: number;
    path: string;
    discKey: string;
    props: RenderProps;
}): ReactNode {
    const panelId = panelIdFor(path);
    const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
    // Set whenever a keyboard event triggers a tab change. The effect
    // below reads and clears this flag so focus only follows selection
    // when the change originated from the keyboard — never on initial
    // mount and never after a click (the click already moved focus).
    const pendingFocusRef = useRef(false);

    const handleTabChange = useCallback(
        (newIndex: number) => {
            const next = discriminatedUnionValueForTab(
                optionLabels,
                discKey,
                newIndex
            );
            if (next === undefined) return;
            props.onChange(next);
        },
        [optionLabels, discKey, props.onChange]
    );

    // Wrap any signed index into a valid tab index using floored modulo.
    const wrapIndex = useCallback(
        (index: number): number =>
            ((index % options.length) + options.length) % options.length,
        [options.length]
    );

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            let target: number | undefined;
            if (e.key === "ArrowRight") target = wrapIndex(activeIndex + 1);
            else if (e.key === "ArrowLeft") target = wrapIndex(activeIndex - 1);
            else if (e.key === "Home") target = 0;
            else if (e.key === "End") target = options.length - 1;
            if (target === undefined) return;
            e.preventDefault();
            // Same tab — nothing to do.
            if (target === activeIndex) return;
            pendingFocusRef.current = true;
            handleTabChange(target);
        },
        [activeIndex, handleTabChange, options.length, wrapIndex]
    );

    // After a keyboard-driven activeIndex change, move focus to the
    // newly active tab. Skipped on initial mount and after clicks
    // because pendingFocusRef is only set inside handleKeyDown.
    useEffect(() => {
        if (!pendingFocusRef.current) return;
        pendingFocusRef.current = false;
        tabRefs.current[activeIndex]?.focus();
    }, [activeIndex]);

    const activeOption = options[activeIndex];

    return (
        <div>
            <div
                role="tablist"
                aria-label="Select variant"
                aria-orientation="horizontal"
                style={{
                    display: "flex",
                    gap: "0.25rem",
                    marginBottom: "0.5rem",
                }}
                onKeyDown={handleKeyDown}
            >
                {options.map((_opt, i) => (
                    <button
                        key={String(i)}
                        ref={(el) => {
                            tabRefs.current[i] = el;
                        }}
                        type="button"
                        role="tab"
                        id={tabIdFor(path, i)}
                        // Emit the literal `"false"` rather than omitting
                        // the attribute on inactive tabs — some screen
                        // readers (NVDA, JAWS in browse mode) only
                        // announce selection state when `aria-selected`
                        // is explicitly present on every tab.
                        aria-selected={i === activeIndex ? "true" : "false"}
                        aria-controls={panelId}
                        tabIndex={i === activeIndex ? 0 : -1}
                        onClick={() => {
                            handleTabChange(i);
                        }}
                        style={{
                            padding: "0.25rem 0.75rem",
                            border:
                                i === activeIndex
                                    ? "1px solid #3b82f6"
                                    : "1px solid #d1d5db",
                            borderRadius: "0.25rem",
                            background:
                                i === activeIndex ? "#eff6ff" : "transparent",
                            cursor: "pointer",
                            fontSize: "0.875rem",
                        }}
                    >
                        {optionLabels[i]}
                    </button>
                ))}
            </div>
            <div
                role="tabpanel"
                id={panelId}
                aria-labelledby={tabIdFor(path, activeIndex)}
            >
                {activeOption !== undefined &&
                    toReactNode(
                        props.renderChild(
                            activeOption,
                            props.value,
                            props.onChange
                        )
                    )}
            </div>
        </div>
    );
}

/** Headless renderer for `FileField` — plain `<input type="file">`. */
export function renderFile(props: RenderProps): ReactNode {
    const id = inputId(props.path);
    const accept = props.constraints.mimeTypes?.join(",");

    if (props.readOnly) {
        // Read-only: no file input, indicate file field
        return <span id={id}>{"File field"}</span>;
    }

    const ariaAttrs = buildAriaAttrs(props.tree, props.meta.description);
    const hintInfo = buildHintInfo(id, props.constraints);

    const fileInput = (
        <input
            id={id}
            type="file"
            accept={accept}
            onChange={(e) => {
                const file = e.target.files?.[0];
                if (file !== undefined) {
                    props.onChange(file);
                }
            }}
            aria-describedby={hintInfo?.ariaDescribedBy}
            {...ariaAttrs}
        />
    );
    if (hintInfo === undefined) return fileInput;
    return (
        <>
            {fileInput}
            <small id={hintInfo.id} className="sc-hint">
                {hintInfo.hint}
            </small>
        </>
    );
}

/**
 * Render a literal field — `z.literal("a")` or `{ const: 5 }`.
 *
 * Literals are non-editable by nature (the value is fixed at the schema
 * level), so both read-only and editable modes display the literal value(s).
 * Multiple literals (`z.literal(["a", "b"])`) render comma-separated.
 */
export function renderLiteral(props: RenderProps): ReactNode {
    const id = inputId(props.path);
    if (props.tree.type !== "literal") return null;
    const values = props.tree.literalValues;
    if (values.length === 0) {
        return <span id={id}>{EM_DASH}</span>;
    }
    const display = values.map((v) => displayJsonValue(v)).join(", ");
    return <span id={id}>{display}</span>;
}

/**
 * Render a null field — `z.null()` or `{ type: "null" }`.
 *
 * The only valid value is `null`, so render an em-dash placeholder
 * regardless of mode. There is nothing the user can usefully change.
 */
export function renderNull(props: RenderProps): ReactNode {
    const id = inputId(props.path);
    return <span id={id}>{EM_DASH}</span>;
}

/**
 * Render a never field — `z.never()` or `{ not: {} }` / `false` schema.
 *
 * `never` indicates a position that cannot hold any value. We render a
 * visible placeholder rather than throwing because some valid schemas
 * intentionally contain `never` branches (e.g. exhaustive discriminated
 * unions), and a runtime crash on render would be worse than a visible
 * indicator.
 */
export function renderNever(props: RenderProps): ReactNode {
    const id = inputId(props.path);
    return (
        <span id={id} className={SC_CLASSES.never}>
            <em>never matches</em>
        </span>
    );
}

/**
 * Render a tuple field — `z.tuple([z.string(), z.number()])` or
 * `{ prefixItems: [...] }`.
 *
 * Positional rendering: each `prefixItems` entry is rendered at its index.
 * The structural index (e.g. `[0]`) is passed as the path suffix so
 * children get unique ids and labels.
 */
export function renderTuple(props: RenderProps): ReactNode {
    if (props.tree.type !== "tuple") return null;
    const prefixItems = props.tree.prefixItems;
    const restItems = props.tree.restItems;
    const arr = Array.isArray(props.value) ? props.value : [];
    // Render whenever there's at least one prefix slot, a rest schema
    // describing extra entries, or already-present extra entries to
    // surface. Empty tuple with no values and no rest schema → nothing.
    if (
        prefixItems.length === 0 &&
        restItems === undefined &&
        arr.length === 0
    ) {
        return null;
    }

    const restCount =
        restItems !== undefined
            ? Math.max(arr.length - prefixItems.length, 0)
            : 0;

    return (
        <div role="group" aria-label={ariaLabel(props.meta.description)}>
            {prefixItems.map((element, i) => {
                const itemValue: unknown = arr[i];
                const childOnChange = (v: unknown) => {
                    const next = arr.slice();
                    next[i] = v;
                    props.onChange(next);
                };
                return (
                    <div key={String(i)}>
                        {toReactNode(
                            props.renderChild(
                                element,
                                itemValue,
                                childOnChange,
                                `[${String(i)}]`
                            )
                        )}
                    </div>
                );
            })}
            {restItems !== undefined &&
                Array.from({ length: restCount }, (_, j) => {
                    const i = prefixItems.length + j;
                    const itemValue: unknown = arr[i];
                    const childOnChange = (v: unknown) => {
                        const next = arr.slice();
                        next[i] = v;
                        props.onChange(next);
                    };
                    return (
                        <div key={`rest-${String(i)}`}>
                            {toReactNode(
                                props.renderChild(
                                    restItems,
                                    itemValue,
                                    childOnChange,
                                    `[${String(i)}]`
                                )
                            )}
                        </div>
                    );
                })}
        </div>
    );
}

/**
 * Render a conditional field — JSON Schema `if`/`then`/`else`.
 *
 * Conditional schemas describe constraints rather than a single value
 * shape, so the renderer surfaces each clause as a labelled fieldset.
 * This mirrors the HTML renderer's annotation approach and gives a
 * predictable structure for theme adapters that want to override it.
 */
export function renderConditional(props: RenderProps): ReactNode {
    if (props.tree.type !== "conditional") return null;
    const { ifClause, thenClause, elseClause } = props.tree;
    return (
        <fieldset className={SC_CLASSES.conditional}>
            <div className={SC_CLASSES.conditionalIf}>
                <strong>if:</strong>{" "}
                {toReactNode(
                    props.renderChild(ifClause, props.value, props.onChange)
                )}
            </div>
            {thenClause !== undefined && (
                <div className={SC_CLASSES.conditionalThen}>
                    <strong>then:</strong>{" "}
                    {toReactNode(
                        props.renderChild(
                            thenClause,
                            props.value,
                            props.onChange
                        )
                    )}
                </div>
            )}
            {elseClause !== undefined && (
                <div className={SC_CLASSES.conditionalElse}>
                    <strong>else:</strong>{" "}
                    {toReactNode(
                        props.renderChild(
                            elseClause,
                            props.value,
                            props.onChange
                        )
                    )}
                </div>
            )}
        </fieldset>
    );
}

/**
 * Render a negation field — JSON Schema `{ not: { ... } }`.
 *
 * Negation describes a constraint ("value must NOT match this schema")
 * rather than a value shape. The renderer surfaces the negated schema
 * beneath an explanatory preamble.
 */
export function renderNegation(props: RenderProps): ReactNode {
    if (props.tree.type !== "negation") return null;
    return (
        <fieldset className={SC_CLASSES.negation}>
            <strong>Must NOT match:</strong>{" "}
            {toReactNode(
                props.renderChild(
                    props.tree.negated,
                    props.value,
                    props.onChange
                )
            )}
        </fieldset>
    );
}

/** Headless renderer for `UnknownField` — JSON-encoded fallback for unconstrained values. */
export function renderUnknown(props: RenderProps): ReactNode {
    const id = inputId(props.path);

    if (props.readOnly) {
        if (props.value === undefined || props.value === null)
            return <span id={id}>{EM_DASH}</span>;
        return (
            <span id={id}>
                {typeof props.value === "string"
                    ? props.value
                    : JSON.stringify(props.value)}
            </span>
        );
    }

    const strValue = typeof props.value === "string" ? props.value : "";
    return (
        <input
            id={id}
            type="text"
            value={props.writeOnly ? "" : strValue}
            onChange={(e) => {
                props.onChange(e.target.value);
            }}
        />
    );
}

// Union matching heuristic moved to `core/unionMatch.ts` so the React and
// HTML pipelines share a single implementation.
