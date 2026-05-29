/** @jsxImportSource solid-js */
/**
 * Solid headless renderer functions — one per schema type.
 *
 * Mirrors `react/headlessRenderers.tsx` field-for-field, adapted to
 * Solid's idiom. Key differences:
 *
 * - `<Show when={...}>` replaces `condition && <X />` so the
 *   conditional branch is reactive rather than re-evaluated by parent
 *   re-renders.
 * - `<For each={...}>` replaces `.map(...)` so list children are
 *   tracked per-item — array mutations don't tear the rendered tree
 *   down and rebuild it.
 * - No `useRef`/`useState`/`useCallback`/`useMemo` — Solid's
 *   reactivity model makes those redundant. Element refs use the
 *   `ref={el => ...}` callback (Solid's documented escape hatch);
 *   keyboard focus state in `DiscriminatedUnionTabs` is held in a
 *   plain array with no per-render allocation.
 * - `onChange` semantics: Solid's `onInput` fires on every keystroke
 *   (matching React's `onChange` semantics), and `onChange` on Solid
 *   fires on commit (matching the DOM `change` event). The headless
 *   renderers wire `onInput` for text/number inputs so live state
 *   updates match the React adapter's behaviour; `onChange` is used
 *   for `<input type="checkbox">`, `<input type="file">`, and
 *   `<select>` where commit semantics are the right contract.
 *
 * Per-type schema data is read directly from the discriminated `tree`
 * (mirroring the React adapter); the helpers from `core/walkBuilders.ts`,
 * `core/idPath.ts`, `core/unionMatch.ts`, and `core/cssClasses.ts` are
 * shared between adapters.
 */

import { For, Show, createEffect, createSignal, type JSX } from "solid-js";
import type { SolidRenderProps } from "./types.ts";
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
// Date/time formatting helpers — mirror the React adapter, identical output
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
 * Build a stable, unique input ID from the path. Re-exported alias for
 * {@link fieldDomId} so the Solid adapter has the same import shape as
 * the React adapter's `inputId`.
 */
export function inputId(path: string): string {
    return fieldDomId(path);
}

// ---------------------------------------------------------------------------
// Headless renderers — one per schema type
// ---------------------------------------------------------------------------

/** Headless renderer for `StringField` — plain `<input>` / `<span>`. */
export function renderString(props: SolidRenderProps): JSX.Element {
    const id = inputId(props.path);

    if (props.readOnly) {
        const strValue =
            typeof props.value === "string" ? props.value : undefined;
        if (strValue === undefined || strValue.length === 0)
            return <span id={id}>{EM_DASH}</span>;
        const format = props.constraints.format;
        if (format === "email" && isSafeMailtoAddress(strValue))
            return (
                <a href={`mailto:${strValue}`} id={id}>
                    {strValue}
                </a>
            );
        if ((format === "uri" || format === "url") && isSafeHyperlink(strValue))
            return (
                <a href={strValue} id={id}>
                    {strValue}
                </a>
            );
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
    const hintInfo = buildHintInfo(id, props.constraints);

    const hintElement = (): JSX.Element =>
        hintInfo === undefined ? null : (
            <small id={hintInfo.id} class="sc-hint">
                {hintInfo.hint}
            </small>
        );

    if (dateType !== undefined) {
        return (
            <>
                <input
                    id={id}
                    type={dateType}
                    value={props.writeOnly ? "" : strValue}
                    onInput={(e) => {
                        props.onChange(e.currentTarget.value);
                    }}
                    aria-describedby={hintInfo?.ariaDescribedBy}
                    {...ariaAttrs}
                />
                {hintElement()}
            </>
        );
    }

    if (props.tree.type === "enum" && props.tree.enumValues.length > 0) {
        const enumValues = props.tree.enumValues;
        return (
            <>
                <select
                    id={id}
                    value={strValue}
                    onChange={(e) => {
                        props.onChange(e.currentTarget.value);
                    }}
                    aria-describedby={hintInfo?.ariaDescribedBy}
                    {...ariaAttrs}
                >
                    <option value="">Select{ELLIPSIS}</option>
                    <For each={enumValues}>
                        {(v) => {
                            const display = displayJsonValue(v);
                            return <option value={display}>{display}</option>;
                        }}
                    </For>
                </select>
                {hintElement()}
            </>
        );
    }

    const isCredential =
        props.writeOnly && props.constraints.format === "password";
    const inputType = isCredential
        ? "password"
        : props.constraints.format === "email"
          ? "email"
          : props.constraints.format === "uri"
            ? "url"
            : "text";
    const autoComplete = isCredential
        ? strValue.length > 0
            ? "current-password"
            : "new-password"
        : undefined;
    const placeholder =
        typeof props.meta.description === "string"
            ? props.meta.description
            : undefined;
    return (
        <>
            <input
                id={id}
                type={inputType}
                autocomplete={autoComplete}
                value={props.writeOnly ? "" : strValue}
                onInput={(e) => {
                    props.onChange(e.currentTarget.value);
                }}
                placeholder={placeholder}
                minlength={props.constraints.minLength}
                maxlength={props.constraints.maxLength}
                aria-describedby={hintInfo?.ariaDescribedBy}
                {...ariaAttrs}
            />
            {hintElement()}
        </>
    );
}

/** Headless renderer for `NumberField` — plain `<input type="number">`. */
export function renderNumber(props: SolidRenderProps): JSX.Element {
    const id = inputId(props.path);

    if (props.readOnly) {
        if (typeof props.value !== "number")
            return <span id={id}>{EM_DASH}</span>;
        return <span id={id}>{props.value.toLocaleString()}</span>;
    }

    const numValue: number | string =
        typeof props.value === "number" ? props.value : "";
    const ariaAttrs = buildAriaAttrs(props.tree);
    const hintInfo = buildHintInfo(id, props.constraints);

    const isInteger =
        props.tree.type === "number" ? props.tree.isInteger : false;
    const inputMode = isInteger ? "numeric" : "decimal";
    const multipleOf = props.constraints.multipleOf;
    const step =
        multipleOf !== undefined
            ? String(multipleOf)
            : isInteger
              ? "1"
              : undefined;

    return (
        <>
            <input
                id={id}
                type="number"
                inputmode={inputMode}
                step={step}
                value={props.writeOnly ? "" : numValue}
                onInput={(e) => {
                    props.onChange(Number(e.currentTarget.value));
                }}
                min={props.constraints.minimum}
                max={props.constraints.maximum}
                aria-describedby={hintInfo?.ariaDescribedBy}
                {...ariaAttrs}
            />
            <Show when={hintInfo !== undefined}>
                <small id={hintInfo?.id} class="sc-hint">
                    {hintInfo?.hint}
                </small>
            </Show>
        </>
    );
}

/** Headless renderer for `BooleanField` — plain `<input type="checkbox">`. */
export function renderBoolean(props: SolidRenderProps): JSX.Element {
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
                props.onChange(e.currentTarget.checked);
            }}
            {...ariaAttrs}
        />
    );
}

/** Headless renderer for `EnumField` — plain `<select>` listing each option. */
export function renderEnum(props: SolidRenderProps): JSX.Element {
    const id = inputId(props.path);
    const enumValue = typeof props.value === "string" ? props.value : "";

    if (props.readOnly) {
        return (
            <span id={id}>{enumValue.length === 0 ? EM_DASH : enumValue}</span>
        );
    }

    const ariaAttrs = buildAriaAttrs(props.tree);
    const hintInfo = buildHintInfo(id, props.constraints);

    const enumValues = props.tree.type === "enum" ? props.tree.enumValues : [];

    return (
        <>
            <select
                id={id}
                value={props.writeOnly ? "" : enumValue}
                onChange={(e) => {
                    props.onChange(e.currentTarget.value);
                }}
                aria-describedby={hintInfo?.ariaDescribedBy}
                {...ariaAttrs}
            >
                <option value="">Select{ELLIPSIS}</option>
                <For each={enumValues}>
                    {(v) => {
                        const display = displayJsonValue(v);
                        return <option value={display}>{display}</option>;
                    }}
                </For>
            </select>
            <Show when={hintInfo !== undefined}>
                <small id={hintInfo?.id} class="sc-hint">
                    {hintInfo?.hint}
                </small>
            </Show>
        </>
    );
}

/**
 * Compute the default value for a freshly added record entry based on
 * the record's value-type schema. Mirrors the React headless
 * implementation byte-for-byte so both adapters seed new entries the
 * same way.
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
        case "null":
            return null;
        case "unknown":
        case "enum":
        case "literal":
        case "tuple":
        case "union":
        case "discriminatedUnion":
        case "conditional":
        case "negation":
        case "file":
        case "never":
            return undefined;
    }
}

/**
 * Generate a unique, currently-unused key for a new record entry.
 * Picks the first of `key`, `key-1`, `key-2`, … not in `existing`.
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
 * Rename a key in an object while preserving insertion order. Returns
 * the original object reference when the rename is a no-op
 * (oldKey === newKey) or when newKey collides with an existing key.
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

/** Headless renderer for `ObjectField` — `<fieldset>` per object. */
export function renderObject(props: SolidRenderProps): JSX.Element {
    if (props.tree.type !== "object") return null;
    const obj = isObject(props.value) ? props.value : {};
    const fields = props.tree.fields;

    const sortedEntries = sortFieldsByOrder(fields).filter(
        ([, field]) => field.meta.visible !== false
    );

    return (
        <fieldset>
            <Show when={typeof props.meta.description === "string"}>
                <legend>{props.meta.description}</legend>
            </Show>
            <For each={sortedEntries}>
                {([key, field]) => {
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
                    const child = props.renderChild(
                        field,
                        childValue,
                        childOnChange,
                        key
                    );
                    if (child === null || child === undefined) return null;
                    const labelText =
                        typeof field.meta.description === "string"
                            ? field.meta.description
                            : key;
                    return (
                        <div>
                            <label for={childId}>
                                {labelText}
                                <Show when={field.isOptional === false}>
                                    <span
                                        aria-hidden="true"
                                        style={{ color: "#dc2626" }}
                                    >
                                        {" "}
                                        *
                                    </span>
                                </Show>
                            </label>
                            {child}
                        </div>
                    );
                }}
            </For>
        </fieldset>
    );
}

/** Headless renderer for `RecordField` — editable key/value rows. */
export function renderRecord(props: SolidRenderProps): JSX.Element {
    if (props.tree.type !== "record") return null;
    const obj = isObject(props.value) ? props.value : {};
    const valueType = props.tree.valueType;

    const entries = Object.entries(obj);

    if (props.readOnly) {
        if (entries.length === 0) {
            return <span>{EM_DASH}</span>;
        }
        return (
            <div role="group" aria-label={ariaLabel(props.meta.description)}>
                <For each={entries}>
                    {([key, value]) => {
                        const childId = inputId(`${props.path}.${key}`);
                        return (
                            <div>
                                <label for={childId}>{key}</label>
                                {props.renderChild(
                                    valueType,
                                    value,
                                    () => {
                                        /* read-only: noop */
                                    },
                                    key
                                )}
                            </div>
                        );
                    }}
                </For>
            </div>
        );
    }

    const handleRename = (oldKey: string, newKey: string) => {
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

    return (
        <div role="group" aria-label={ariaLabel(props.meta.description)}>
            <For each={entries}>
                {([key, value]) => {
                    const childId = inputId(`${props.path}.${key}`);
                    const keyId = `${childId}-key`;
                    return (
                        <div>
                            <input
                                id={keyId}
                                type="text"
                                aria-label="Entry key"
                                value={key}
                                onChange={(e) => {
                                    handleRename(key, e.currentTarget.value);
                                }}
                            />
                            {props.renderChild(
                                valueType,
                                value,
                                (nextValue: unknown) => {
                                    handleValueChange(key, nextValue);
                                },
                                key
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
                }}
            </For>
            <button type="button" aria-label="Add entry" onClick={handleAdd}>
                Add
            </button>
        </div>
    );
}

/** Headless renderer for `ArrayField` — ordered list with add/remove controls. */
export function renderArray(props: SolidRenderProps): JSX.Element {
    if (props.tree.type !== "array") return null;
    const arr = Array.isArray(props.value) ? props.value : [];
    const element = props.tree.element;
    if (element === undefined) return null;

    if (props.readOnly) {
        if (arr.length === 0) return null;
        return (
            <ul role="group" aria-label={ariaLabel(props.meta.description)}>
                <For each={arr}>
                    {(item, i) => (
                        <li>
                            {props.renderChild(
                                element,
                                item,
                                () => {
                                    /* read-only: noop */
                                },
                                `[${String(i())}]`
                            )}
                        </li>
                    )}
                </For>
            </ul>
        );
    }

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
                <For each={arr}>
                    {(item, i) => {
                        const childOnChange = (v: unknown) => {
                            const nextArr = arr.slice();
                            nextArr[i()] = v;
                            props.onChange(nextArr);
                        };
                        return (
                            <li>
                                {props.renderChild(
                                    element,
                                    item,
                                    childOnChange,
                                    `[${String(i())}]`
                                )}
                                <button
                                    type="button"
                                    aria-label={`Remove item ${String(i())}`}
                                    onClick={() => {
                                        handleRemove(i());
                                    }}
                                >
                                    Remove
                                </button>
                            </li>
                        );
                    }}
                </For>
            </ul>
            <button type="button" aria-label="Add item" onClick={handleAdd}>
                Add
            </button>
        </div>
    );
}

/** Headless renderer for plain `UnionField` — picks the matching option. */
export function renderUnion(props: SolidRenderProps): JSX.Element {
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
        return props.renderChild(matched, props.value, props.onChange);
    }

    const firstOption = options[0];
    if (firstOption !== undefined) {
        return props.renderChild(firstOption, props.value, props.onChange);
    }

    return <span>{EM_DASH}</span>;
}

// ---------------------------------------------------------------------------
// Discriminated union — WAI-ARIA tabs pattern
// ---------------------------------------------------------------------------

/**
 * Pure helper: convert a tab index into the new value the discriminated
 * union should emit. Returns `undefined` when the index is out of bounds.
 *
 * Extracted so the contract is unit-testable without rendering the tabs
 * component. Mirrors the React adapter's `discriminatedUnionValueForTab`.
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

/** Headless renderer for `DiscriminatedUnionField` — tabbed UI. */
export function renderDiscriminatedUnion(props: SolidRenderProps): JSX.Element {
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
            return props.renderChild(activeOption, props.value, props.onChange);
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
 * WAI-ARIA tabs component for discriminated unions, Solid-flavoured.
 *
 * Implements the WAI-ARIA "Tabs with Automatic Activation" pattern:
 * - ArrowRight / ArrowLeft move between tabs, wrapping at the extremes.
 * - Home / End jump to the first / last tab.
 * - `aria-selected`, `aria-controls`, `role="tablist" | "tab" | "tabpanel"`.
 * - Roving tabindex: the active tab carries `tabindex=0`, the rest
 *   `tabindex=-1`.
 *
 * "Automatic activation" means each arrow key both moves focus and
 * activates the new tab in one step — selection and focus stay aligned.
 *
 * The Solid implementation differs from the React equivalent in:
 *
 * - Element refs use Solid's `ref={el => ...}` callback rather than
 *   `useRef`. The refs array is module-local to the JSX closure — no
 *   `createSignal` needed because we never derive reactive state from
 *   the refs themselves, only the array's contents.
 * - A `pendingFocus` signal tracks "the user just pressed an arrow key,
 *   focus should follow the next active index". `createEffect`
 *   consumes the signal — Solid runs the effect after the DOM update
 *   so `.focus()` lands on the freshly-active button.
 * - The handler reads `props.activeIndex` reactively because the parent
 *   re-derives it from `props.props.value` on every tab change.
 */
function DiscriminatedUnionTabs(props: {
    options: readonly WalkedField[];
    optionLabels: readonly string[];
    activeIndex: number;
    path: string;
    discKey: string;
    props: SolidRenderProps;
}): JSX.Element {
    const panelId = panelIdFor(props.path);
    const tabRefs: (HTMLButtonElement | null)[] = [];
    const [pendingFocus, setPendingFocus] = createSignal(false);

    const handleTabChange = (newIndex: number) => {
        const next = discriminatedUnionValueForTab(
            props.optionLabels,
            props.discKey,
            newIndex
        );
        if (next === undefined) return;
        props.props.onChange(next);
    };

    const wrapIndex = (index: number): number =>
        ((index % props.options.length) + props.options.length) %
        props.options.length;

    const handleKeyDown = (e: KeyboardEvent) => {
        let target: number | undefined;
        if (e.key === "ArrowRight") target = wrapIndex(props.activeIndex + 1);
        else if (e.key === "ArrowLeft")
            target = wrapIndex(props.activeIndex - 1);
        else if (e.key === "Home") target = 0;
        else if (e.key === "End") target = props.options.length - 1;
        if (target === undefined) return;
        e.preventDefault();
        if (target === props.activeIndex) return;
        setPendingFocus(true);
        handleTabChange(target);
    };

    createEffect(() => {
        if (!pendingFocus()) return;
        // Read activeIndex reactively. When the parent re-renders with the
        // new index, this effect re-runs and focuses the new tab.
        const idx = props.activeIndex;
        setPendingFocus(false);
        tabRefs[idx]?.focus();
    });

    const tablistStyle: JSX.CSSProperties = {
        display: "flex",
        gap: "0.25rem",
        "margin-bottom": "0.5rem",
    };

    return (
        <div>
            <div
                role="tablist"
                aria-label="Select variant"
                aria-orientation="horizontal"
                tabIndex={-1}
                style={tablistStyle}
                onKeyDown={handleKeyDown}
            >
                <For each={props.options}>
                    {(_opt, i) => {
                        const idx = i();
                        const isActive = () => idx === props.activeIndex;
                        const tabStyle = (): JSX.CSSProperties => ({
                            padding: "0.25rem 0.75rem",
                            border: isActive()
                                ? "1px solid #3b82f6"
                                : "1px solid #d1d5db",
                            "border-radius": "0.25rem",
                            background: isActive() ? "#eff6ff" : "transparent",
                            cursor: "pointer",
                            "font-size": "0.875rem",
                        });
                        return (
                            <button
                                ref={(el) => {
                                    tabRefs[idx] = el;
                                }}
                                type="button"
                                role="tab"
                                id={tabIdFor(props.path, idx)}
                                aria-selected={isActive() ? "true" : "false"}
                                aria-controls={panelId}
                                tabindex={isActive() ? 0 : -1}
                                onClick={() => {
                                    handleTabChange(idx);
                                }}
                                style={tabStyle()}
                            >
                                {props.optionLabels[idx]}
                            </button>
                        );
                    }}
                </For>
            </div>
            <div
                role="tabpanel"
                id={panelId}
                aria-labelledby={tabIdFor(props.path, props.activeIndex)}
            >
                <Show when={props.options[props.activeIndex]}>
                    {(activeOption) =>
                        props.props.renderChild(
                            activeOption(),
                            props.props.value,
                            props.props.onChange
                        )
                    }
                </Show>
            </div>
        </div>
    );
}

/** Headless renderer for `FileField` — plain `<input type="file">`. */
export function renderFile(props: SolidRenderProps): JSX.Element {
    const id = inputId(props.path);
    const accept = props.constraints.mimeTypes?.join(",");

    if (props.readOnly) {
        return <span id={id}>File field</span>;
    }

    const ariaAttrs = buildAriaAttrs(props.tree, props.meta.description);
    const hintInfo = buildHintInfo(id, props.constraints);

    return (
        <>
            <input
                id={id}
                type="file"
                accept={accept}
                onChange={(e) => {
                    const file = e.currentTarget.files?.[0];
                    if (file !== undefined) {
                        props.onChange(file);
                    }
                }}
                aria-describedby={hintInfo?.ariaDescribedBy}
                {...ariaAttrs}
            />
            <Show when={hintInfo !== undefined}>
                <small id={hintInfo?.id} class="sc-hint">
                    {hintInfo?.hint}
                </small>
            </Show>
        </>
    );
}

/**
 * Render a literal field — `z.literal("a")` or `{ const: 5 }`.
 *
 * Literals are non-editable by nature; both read-only and editable modes
 * display the literal value(s). Multiple literals (`z.literal(["a","b"])`)
 * render comma-separated.
 */
export function renderLiteral(props: SolidRenderProps): JSX.Element {
    const id = inputId(props.path);
    if (props.tree.type !== "literal") return null;
    const values = props.tree.literalValues;
    if (values.length === 0) {
        return <span id={id}>{EM_DASH}</span>;
    }
    const display = values.map((v) => displayJsonValue(v)).join(", ");
    return <span id={id}>{display}</span>;
}

/** Render a null field — `z.null()` or `{ type: "null" }`. */
export function renderNull(props: SolidRenderProps): JSX.Element {
    const id = inputId(props.path);
    return <span id={id}>{EM_DASH}</span>;
}

/** Render a never field — `z.never()` or `{ not: {} }` / `false` schema. */
export function renderNever(props: SolidRenderProps): JSX.Element {
    const id = inputId(props.path);
    return (
        <span id={id} class={SC_CLASSES.never}>
            <em>never matches</em>
        </span>
    );
}

/** Render a tuple field — positional rendering of each prefix item. */
export function renderTuple(props: SolidRenderProps): JSX.Element {
    if (props.tree.type !== "tuple") return null;
    const prefixItems = props.tree.prefixItems;
    const restItems = props.tree.restItems;
    const arr = Array.isArray(props.value) ? props.value : [];
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

    const restRange = Array.from({ length: restCount }, (_, j) => j);

    return (
        <div role="group" aria-label={ariaLabel(props.meta.description)}>
            <For each={prefixItems}>
                {(element, i) => {
                    const idx = i();
                    const itemValue: unknown = arr[idx];
                    const childOnChange = (v: unknown) => {
                        const next = arr.slice();
                        next[idx] = v;
                        props.onChange(next);
                    };
                    return (
                        <div>
                            {props.renderChild(
                                element,
                                itemValue,
                                childOnChange,
                                `[${String(idx)}]`
                            )}
                        </div>
                    );
                }}
            </For>
            <Show when={restItems}>
                {(rest) => (
                    <For each={restRange}>
                        {(j) => {
                            const idx = prefixItems.length + j;
                            const itemValue: unknown = arr[idx];
                            const childOnChange = (v: unknown) => {
                                const next = arr.slice();
                                next[idx] = v;
                                props.onChange(next);
                            };
                            return (
                                <div>
                                    {props.renderChild(
                                        rest(),
                                        itemValue,
                                        childOnChange,
                                        `[${String(idx)}]`
                                    )}
                                </div>
                            );
                        }}
                    </For>
                )}
            </Show>
        </div>
    );
}

/** Render a conditional field — JSON Schema `if`/`then`/`else`. */
export function renderConditional(props: SolidRenderProps): JSX.Element {
    if (props.tree.type !== "conditional") return null;
    const { ifClause, thenClause, elseClause } = props.tree;
    return (
        <fieldset class={SC_CLASSES.conditional}>
            <div class={SC_CLASSES.conditionalIf}>
                <strong>if:</strong>{" "}
                {props.renderChild(ifClause, props.value, props.onChange)}
            </div>
            <Show when={thenClause}>
                {(then) => (
                    <div class={SC_CLASSES.conditionalThen}>
                        <strong>then:</strong>{" "}
                        {props.renderChild(then(), props.value, props.onChange)}
                    </div>
                )}
            </Show>
            <Show when={elseClause}>
                {(other) => (
                    <div class={SC_CLASSES.conditionalElse}>
                        <strong>else:</strong>{" "}
                        {props.renderChild(
                            other(),
                            props.value,
                            props.onChange
                        )}
                    </div>
                )}
            </Show>
        </fieldset>
    );
}

/** Render a negation field — JSON Schema `{ not: { ... } }`. */
export function renderNegation(props: SolidRenderProps): JSX.Element {
    if (props.tree.type !== "negation") return null;
    return (
        <fieldset class={SC_CLASSES.negation}>
            <strong>Must NOT match:</strong>{" "}
            {props.renderChild(props.tree.negated, props.value, props.onChange)}
        </fieldset>
    );
}

/** Headless renderer for `UnknownField` — JSON-encoded fallback. */
export function renderUnknown(props: SolidRenderProps): JSX.Element {
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
            onInput={(e) => {
                props.onChange(e.currentTarget.value);
            }}
        />
    );
}
