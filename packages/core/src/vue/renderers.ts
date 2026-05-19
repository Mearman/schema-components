/**
 * Headless Vue renderer functions — one per schema field type.
 *
 * Mechanical port of `react/headlessRenderers.tsx` from JSX over React
 * `ReactNode` to Vue's hyperscript `h()` over {@link VNode}. The shape
 * of each rendered tree (tag, attributes, children, ARIA wiring,
 * recursive descent) is intentionally identical so a future test
 * harness can assert React/Vue parity field-by-field.
 *
 * The discriminated-union `WAI-ARIA tabs` widget is implemented inside
 * this module as a small functional Vue component
 * (`DiscriminatedUnionTabs`) so the keyboard focus state machine
 * (`pendingFocusRef`, `useEffect`-equivalent `watch`) survives the
 * port. Every other renderer is a pure function returning a single
 * {@link VNode}.
 *
 * `inputId(path)` is re-exported as an alias for {@link fieldDomId} so
 * downstream Vue themes import a name parallel to the React adapter's
 * `inputId` export. Both pipelines must derive the same DOM id from
 * the same path — `fieldDomId` in `core/idPath.ts` is the single
 * source of truth.
 */

import {
    defineComponent,
    h,
    nextTick,
    onMounted,
    ref,
    watch,
    type VNode,
} from "vue";
import { dateInputType } from "../core/formats.ts";
import { isObject } from "../core/guards.ts";
import { sortFieldsByOrder } from "../core/fieldOrder.ts";
import type { WalkedField } from "../core/types.ts";
import { isSafeHyperlink, isSafeMailtoAddress } from "../core/uri.ts";
import { displayJsonValue } from "../core/walkBuilders.ts";
import { fieldDomId, hintIdFor, panelIdFor, tabIdFor } from "../core/idPath.ts";
import { EM_DASH, ELLIPSIS, SC_CLASSES } from "../core/cssClasses.ts";
import { constraintHint as coreConstraintHint } from "../core/constraintHint.ts";
import {
    matchUnionOption as matchUnionOptionShared,
    resolveDiscriminatedActive,
} from "../core/unionMatch.ts";
import type { AllConstraints } from "../core/renderer.ts";
import { inputTarget, selectTarget } from "./eventTargets.ts";
import type { VueRenderProps } from "./types.ts";

// ---------------------------------------------------------------------------
// Accessibility helpers — Vue counterparts of `react/a11y.ts`
// ---------------------------------------------------------------------------

/**
 * Hint descriptor emitted alongside an input. Mirrors `react/a11y.ts`
 * `HintInfo`.
 */
interface HintInfo {
    readonly id: string;
    readonly hint: string;
    readonly ariaDescribedBy: string;
}

/**
 * Build {@link HintInfo} for a field at `inputId` given its declared
 * constraints. Returns `undefined` when no constraint message would be
 * produced — the renderers then skip emitting the hint element entirely.
 */
function buildHintInfo(
    inputId: string,
    constraints: AllConstraints
): HintInfo | undefined {
    const hint = coreConstraintHint(constraints);
    if (hint === undefined) return undefined;
    const id = hintIdFor(inputId);
    return { id, hint, ariaDescribedBy: id };
}

/**
 * Build the ARIA attribute bundle for a renderer. Returns a plain
 * `Record<string, string>` so callers can spread it into the `props`
 * object passed to `h()`.
 *
 * Matches `react/a11y.ts` `buildAriaAttrs` semantics so both adapters
 * emit identical accessibility metadata for the same field.
 */
function buildAriaAttrs(
    tree: WalkedField,
    description?: unknown,
    inputId?: string,
    constraints?: AllConstraints
): Record<string, string> {
    const attrs: Record<string, string> = {};
    if (tree.isOptional === false) {
        attrs["aria-required"] = "true";
    }
    if (
        inputId !== undefined &&
        constraints !== undefined &&
        coreConstraintHint(constraints) !== undefined
    ) {
        attrs["aria-describedby"] = hintIdFor(inputId);
    }
    if (typeof description === "string" && description.length > 0) {
        attrs["aria-label"] = description;
    }
    return attrs;
}

/**
 * Narrow `meta.description` (typed `unknown`) to a string value safe to
 * pass into Vue's `aria-label`. Returns `undefined` for non-string or
 * empty-string descriptions so Vue drops the attribute rather than
 * stringifying `{}` to `"[object Object]"`.
 */
function ariaLabel(description: unknown): string | undefined {
    if (typeof description !== "string") return undefined;
    if (description.length === 0) return undefined;
    return description;
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
 * Re-exported alias for {@link fieldDomId} so external Vue themes
 * import a name parallel to the React adapter's `inputId` export. Both
 * the React and Vue renderers (and the HTML pipeline) must derive the
 * same id from the same path — `fieldDomId` in `core/idPath.ts` is the
 * canonical implementation.
 */
export function inputId(path: string): string {
    return fieldDomId(path);
}

// ---------------------------------------------------------------------------
// Utility — hint rendering
// ---------------------------------------------------------------------------

function renderHint(hintInfo: HintInfo): VNode {
    return h("small", { id: hintInfo.id, class: "sc-hint" }, hintInfo.hint);
}

/**
 * Wrap an input VNode together with an optional sibling hint
 * `<small>` element. When no hint is needed the input is returned
 * unchanged so the renderer keeps the single-element contract that
 * union renderers rely on. When a hint applies, the pair is wrapped in
 * a Vue fragment (`h(Fragment, ...)`); Vue renders a fragment as a list
 * of siblings with no surrounding tag — exactly mirroring the React
 * `<>{input}{hint}</>` shape.
 */
function withHint(input: VNode, hintInfo: HintInfo | undefined): VNode {
    if (hintInfo === undefined) return input;
    // `h(Symbol(Fragment), ...)` produces a Vue fragment that renders
    // its children as siblings without a wrapping element. Imported
    // here as a runtime helper rather than re-exported because no
    // caller outside this module needs the fragment symbol.
    return h("template", undefined, [input, renderHint(hintInfo)]);
}

// ---------------------------------------------------------------------------
// Headless renderers — one per schema type
// ---------------------------------------------------------------------------

/**
 * Headless renderer for `StringField` — plain `<input>` / `<span>`.
 */
export function renderString(props: VueRenderProps): VNode {
    const id = inputId(props.path);

    if (props.readOnly) {
        const strValue =
            typeof props.value === "string" ? props.value : undefined;
        if (strValue === undefined || strValue.length === 0)
            return h("span", { id }, EM_DASH);
        const format = props.constraints.format;
        if (format === "email" && isSafeMailtoAddress(strValue))
            return h(
                "a",
                { href: `mailto:${strValue}`, id, "aria-readonly": "true" },
                strValue
            );
        if ((format === "uri" || format === "url") && isSafeHyperlink(strValue))
            return h(
                "a",
                { href: strValue, id, "aria-readonly": "true" },
                strValue
            );
        if (format === "date") {
            const formatted = formatDate(strValue);
            return h("span", { id }, formatted ?? strValue);
        }
        if (format === "time") {
            const formatted = formatTime(strValue);
            return h("span", { id }, formatted ?? strValue);
        }
        if (format === "date-time" || format === "datetime") {
            const formatted = formatDateTime(strValue);
            return h("span", { id }, formatted ?? strValue);
        }
        return h("span", { id }, strValue);
    }

    const strValue = typeof props.value === "string" ? props.value : "";
    const dateType = dateInputType(props.constraints.format);

    const ariaAttrs = buildAriaAttrs(props.tree);
    const hintInfo = buildHintInfo(id, props.constraints);
    const ariaDescribedBy = hintInfo?.ariaDescribedBy;

    if (dateType !== undefined) {
        const dateInput = h("input", {
            id,
            type: dateType,
            value: props.writeOnly ? "" : strValue,
            onInput: (e: Event) => {
                const target = inputTarget(e);
                if (target === undefined) return;
                props.onChange(target.value);
            },
            ...(ariaDescribedBy !== undefined
                ? { "aria-describedby": ariaDescribedBy }
                : {}),
            ...ariaAttrs,
        });
        return withHint(dateInput, hintInfo);
    }

    if (props.tree.type === "enum" && props.tree.enumValues.length > 0) {
        const enumValues = props.tree.enumValues;
        const selectChildren: VNode[] = [
            h("option", { value: "" }, `Select${ELLIPSIS}`),
            ...enumValues.map((v) => {
                const display = displayJsonValue(v);
                return h("option", { key: display, value: display }, display);
            }),
        ];
        const select = h(
            "select",
            {
                id,
                value: strValue,
                onChange: (e: Event) => {
                    const target = selectTarget(e);
                    if (target === undefined) return;
                    props.onChange(target.value);
                },
                ...(ariaDescribedBy !== undefined
                    ? { "aria-describedby": ariaDescribedBy }
                    : {}),
                ...ariaAttrs,
            },
            selectChildren
        );
        return withHint(select, hintInfo);
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

    const inputProps: Record<string, unknown> = {
        id,
        type: inputType,
        value: props.writeOnly ? "" : strValue,
        onInput: (e: Event) => {
            const target = inputTarget(e);
            if (target === undefined) return;
            props.onChange(target.value);
        },
        ...ariaAttrs,
    };
    if (autoComplete !== undefined) inputProps.autocomplete = autoComplete;
    if (typeof props.meta.description === "string") {
        inputProps.placeholder = props.meta.description;
    }
    if (props.constraints.minLength !== undefined) {
        inputProps.minlength = props.constraints.minLength;
    }
    if (props.constraints.maxLength !== undefined) {
        inputProps.maxlength = props.constraints.maxLength;
    }
    if (ariaDescribedBy !== undefined) {
        inputProps["aria-describedby"] = ariaDescribedBy;
    }

    const input = h("input", inputProps);
    return withHint(input, hintInfo);
}

/** Headless renderer for `NumberField` — plain `<input type="number">`. */
export function renderNumber(props: VueRenderProps): VNode {
    const id = inputId(props.path);

    if (props.readOnly) {
        if (typeof props.value !== "number") return h("span", { id }, EM_DASH);
        return h("span", { id }, props.value.toLocaleString());
    }

    const numValue = typeof props.value === "number" ? props.value : "";
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

    const inputProps: Record<string, unknown> = {
        id,
        type: "number",
        inputmode: inputMode,
        value: props.writeOnly ? "" : numValue,
        onInput: (e: Event) => {
            const target = inputTarget(e);
            if (target === undefined) return;
            props.onChange(Number(target.value));
        },
        ...ariaAttrs,
    };
    if (step !== undefined) inputProps.step = step;
    if (props.constraints.minimum !== undefined) {
        inputProps.min = props.constraints.minimum;
    }
    if (props.constraints.maximum !== undefined) {
        inputProps.max = props.constraints.maximum;
    }
    if (hintInfo !== undefined) {
        inputProps["aria-describedby"] = hintInfo.ariaDescribedBy;
    }

    const numberInput = h("input", inputProps);
    return withHint(numberInput, hintInfo);
}

/** Headless renderer for `BooleanField` — plain `<input type="checkbox">`. */
export function renderBoolean(props: VueRenderProps): VNode {
    const id = inputId(props.path);

    if (props.readOnly) {
        if (typeof props.value !== "boolean") return h("span", { id }, EM_DASH);
        return h("span", { id }, props.value ? "Yes" : "No");
    }

    const ariaAttrs = buildAriaAttrs(props.tree, props.meta.description);

    return h("input", {
        id,
        type: "checkbox",
        checked: props.writeOnly ? false : props.value === true,
        onChange: (e: Event) => {
            const target = inputTarget(e);
            if (target === undefined) return;
            props.onChange(target.checked);
        },
        ...ariaAttrs,
    });
}

/** Headless renderer for `EnumField` — plain `<select>` listing each option. */
export function renderEnum(props: VueRenderProps): VNode {
    const id = inputId(props.path);
    const enumValue = typeof props.value === "string" ? props.value : "";

    if (props.readOnly) {
        return h("span", { id }, enumValue.length > 0 ? enumValue : EM_DASH);
    }

    const ariaAttrs = buildAriaAttrs(props.tree);
    const hintInfo = buildHintInfo(id, props.constraints);
    const enumValues = props.tree.type === "enum" ? props.tree.enumValues : [];

    const children: VNode[] = [
        h("option", { value: "" }, `Select${ELLIPSIS}`),
        ...enumValues.map((v) => {
            const display = displayJsonValue(v);
            return h("option", { key: display, value: display }, display);
        }),
    ];

    const selectProps: Record<string, unknown> = {
        id,
        value: props.writeOnly ? "" : enumValue,
        onChange: (e: Event) => {
            const target = selectTarget(e);
            if (target === undefined) return;
            props.onChange(target.value);
        },
        ...ariaAttrs,
    };
    if (hintInfo !== undefined) {
        selectProps["aria-describedby"] = hintInfo.ariaDescribedBy;
    }

    const select = h("select", selectProps, children);
    return withHint(select, hintInfo);
}

/**
 * Headless renderer for `ObjectField` — `<fieldset>` per object with one
 * child per property.
 */
export function renderObject(props: VueRenderProps): VNode {
    if (props.tree.type !== "object") return h("span");
    const obj = isObject(props.value) ? props.value : {};
    const fields = props.tree.fields;

    const sortedEntries = sortFieldsByOrder(fields);

    const children: VNode[] = [];
    if (typeof props.meta.description === "string") {
        children.push(h("legend", undefined, props.meta.description));
    }

    for (const [key, field] of sortedEntries) {
        if (field.meta.visible === false) continue;
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
        const child = props.renderChild(field, childValue, childOnChange, key);
        const labelText =
            typeof field.meta.description === "string"
                ? field.meta.description
                : key;
        const labelChildren: (VNode | string)[] = [labelText];
        if (field.isOptional === false) {
            labelChildren.push(
                h(
                    "span",
                    {
                        "aria-hidden": "true",
                        style: { color: "#dc2626" },
                    },
                    " *"
                )
            );
        }
        children.push(
            h("div", { key }, [
                h("label", { for: childId }, labelChildren),
                child,
            ])
        );
    }

    return h("fieldset", undefined, children);
}

/**
 * Compute the default value for a freshly added record entry based on the
 * record's value-type schema. Mirrors {@link defaultRecordValue} from the
 * React adapter — see that function's commentary for the per-variant
 * choices.
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
 * original object reference when the rename is a no-op (`oldKey === newKey`)
 * or when `newKey` collides with an existing key.
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

/**
 * Headless renderer for `RecordField` — editable key/value rows with
 * add/remove controls.
 */
export function renderRecord(props: VueRenderProps): VNode {
    if (props.tree.type !== "record") return h("span");
    const obj = isObject(props.value) ? props.value : {};
    const valueType = props.tree.valueType;

    const entries = Object.entries(obj);

    if (props.readOnly) {
        if (entries.length === 0) {
            return h("span", undefined, EM_DASH);
        }
        const groupProps: Record<string, unknown> = { role: "group" };
        const label = ariaLabel(props.meta.description);
        if (label !== undefined) groupProps["aria-label"] = label;
        return h(
            "div",
            groupProps,
            entries.map(([key, value]) => {
                const childId = inputId(`${props.path}.${key}`);
                return h("div", { key }, [
                    h("label", { for: childId }, key),
                    props.renderChild(
                        valueType,
                        value,
                        () => {
                            /* read-only: noop */
                        },
                        key
                    ),
                ]);
            })
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

    const groupProps: Record<string, unknown> = { role: "group" };
    const label = ariaLabel(props.meta.description);
    if (label !== undefined) groupProps["aria-label"] = label;

    return h("div", groupProps, [
        ...entries.map(([key, value]) => {
            const childId = inputId(`${props.path}.${key}`);
            const keyId = `${childId}-key`;
            return h("div", { key }, [
                h("input", {
                    id: keyId,
                    type: "text",
                    "aria-label": "Entry key",
                    value: key,
                    onBlur: (e: Event) => {
                        const target = inputTarget(e);
                        if (target === undefined) return;
                        handleRename(key, target.value);
                    },
                }),
                props.renderChild(
                    valueType,
                    value,
                    (nextValue: unknown) => {
                        handleValueChange(key, nextValue);
                    },
                    key
                ),
                h(
                    "button",
                    {
                        type: "button",
                        "aria-label": `Remove entry ${key}`,
                        onClick: () => {
                            handleRemove(key);
                        },
                    },
                    "Remove"
                ),
            ]);
        }),
        h(
            "button",
            {
                type: "button",
                "aria-label": "Add entry",
                onClick: handleAdd,
            },
            "Add"
        ),
    ]);
}

/** Headless renderer for `ArrayField` — ordered list with add/remove controls. */
export function renderArray(props: VueRenderProps): VNode {
    if (props.tree.type !== "array") return h("span");
    const arr = Array.isArray(props.value) ? props.value : [];
    const element = props.tree.element;
    if (element === undefined) return h("span");

    if (props.readOnly) {
        if (arr.length === 0) return h("span", { style: { display: "none" } });
        const groupProps: Record<string, unknown> = { role: "group" };
        const label = ariaLabel(props.meta.description);
        if (label !== undefined) groupProps["aria-label"] = label;
        return h(
            "ul",
            groupProps,
            arr.map((item, i) =>
                h(
                    "li",
                    { key: String(i) },
                    props.renderChild(
                        element,
                        item,
                        () => {
                            /* read-only: noop */
                        },
                        `[${String(i)}]`
                    )
                )
            )
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

    const groupProps: Record<string, unknown> = { role: "group" };
    const label = ariaLabel(props.meta.description);
    if (label !== undefined) groupProps["aria-label"] = label;

    return h("div", groupProps, [
        h(
            "ul",
            undefined,
            arr.map((item, i) => {
                const childOnChange = (v: unknown) => {
                    const nextArr = arr.slice();
                    nextArr[i] = v;
                    props.onChange(nextArr);
                };
                return h("li", { key: String(i) }, [
                    props.renderChild(
                        element,
                        item,
                        childOnChange,
                        `[${String(i)}]`
                    ),
                    h(
                        "button",
                        {
                            type: "button",
                            "aria-label": `Remove item ${String(i)}`,
                            onClick: () => {
                                handleRemove(i);
                            },
                        },
                        "Remove"
                    ),
                ]);
            })
        ),
        h(
            "button",
            {
                type: "button",
                "aria-label": "Add item",
                onClick: handleAdd,
            },
            "Add"
        ),
    ]);
}

/**
 * Headless renderer for plain `UnionField` — picks the matching option and
 * renders it.
 */
export function renderUnion(props: VueRenderProps): VNode {
    const options =
        props.tree.type === "union" || props.tree.type === "discriminatedUnion"
            ? props.tree.options
            : undefined;
    if (options === undefined || options.length === 0) {
        if (props.value === undefined || props.value === null)
            return h("span", undefined, EM_DASH);
        return h("span", undefined, JSON.stringify(props.value));
    }

    const matched = matchUnionOptionShared(options, props.value);
    if (matched !== undefined) {
        return props.renderChild(matched, props.value, props.onChange);
    }

    const firstOption = options[0];
    if (firstOption !== undefined) {
        return props.renderChild(firstOption, props.value, props.onChange);
    }

    return h("span", undefined, EM_DASH);
}

// ---------------------------------------------------------------------------
// Discriminated union — WAI-ARIA tabs pattern
// ---------------------------------------------------------------------------

/**
 * Pure helper: convert a tab index into the new value the discriminated
 * union should emit. Returns `undefined` when the index is out of bounds.
 *
 * Extracted so the contract is unit-testable without instantiating the
 * Vue component (which relies on the Vue runtime).
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
 * WAI-ARIA tabs component for discriminated unions, Vue edition.
 *
 * Implements the WAI-ARIA "Tabs with Automatic Activation" pattern in
 * Vue 3 Composition API:
 * - ArrowRight / ArrowLeft move between tabs, wrapping at the extremes.
 * - Home / End jump to the first / last tab.
 * - `aria-selected`, `aria-controls`, `role="tablist" / "tab" / "tabpanel"`.
 * - Roving tabindex: the active tab has `tabindex=0`, the rest `-1`.
 *
 * "Automatic activation" means each arrow key both moves focus and
 * activates the new tab in one step.
 *
 * Focus state machine: a single `pendingFocus` ref records when the
 * activeIndex change originated from a keyboard event; a `watch` on
 * `activeIndex` reads the flag, calls `nextTick` to await the new
 * DOM, then focuses the matching tab. The flag is cleared whether or
 * not the focus call succeeds so spurious re-runs cannot leave focus
 * shifted unexpectedly.
 */
interface DiscriminatedUnionTabsProps {
    options: readonly WalkedField[];
    optionLabels: readonly string[];
    activeIndex: number;
    path: string;
    discKey: string;
    renderProps: VueRenderProps;
}

/**
 * `defineComponent` with the generic-arguments form derives the prop
 * types from {@link DiscriminatedUnionTabsProps} so we avoid the
 * `PropType<T>` runtime-constructor cast banned by the project lint
 * rules. The runtime prop list enumerates every accepted prop name
 * so Vue's prop normalisation does not warn at mount time; the
 * generic argument supplies the TypeScript shape `setup(props)`
 * sees.
 */
const DiscriminatedUnionTabs = defineComponent<DiscriminatedUnionTabsProps>({
    name: "DiscriminatedUnionTabs",
    props: [
        "options",
        "optionLabels",
        "activeIndex",
        "path",
        "discKey",
        "renderProps",
    ],
    setup(props) {
        const tabRefs = ref<(HTMLButtonElement | null)[]>([]);
        // Set whenever a keyboard event triggers a tab change. The
        // `watch` below reads and clears this flag so focus only
        // follows selection when the change originated from the
        // keyboard — never on initial mount and never after a click.
        const pendingFocus = ref(false);

        const setTabRef = (i: number) => (el: unknown) => {
            // Vue ref callbacks receive `Element | ComponentPublicInstance |
            // null`. The tab buttons are plain `<button>` elements, so
            // narrow to `HTMLButtonElement`.
            tabRefs.value[i] = el instanceof HTMLButtonElement ? el : null;
        };

        const handleTabChange = (newIndex: number) => {
            const next = discriminatedUnionValueForTab(
                props.optionLabels,
                props.discKey,
                newIndex
            );
            if (next === undefined) return;
            props.renderProps.onChange(next);
        };

        const wrapIndex = (index: number): number =>
            ((index % props.options.length) + props.options.length) %
            props.options.length;

        const handleKeyDown = (e: KeyboardEvent) => {
            let target: number | undefined;
            if (e.key === "ArrowRight")
                target = wrapIndex(props.activeIndex + 1);
            else if (e.key === "ArrowLeft")
                target = wrapIndex(props.activeIndex - 1);
            else if (e.key === "Home") target = 0;
            else if (e.key === "End") target = props.options.length - 1;
            if (target === undefined) return;
            e.preventDefault();
            if (target === props.activeIndex) return;
            pendingFocus.value = true;
            handleTabChange(target);
        };

        watch(
            () => props.activeIndex,
            (next) => {
                if (!pendingFocus.value) return;
                pendingFocus.value = false;
                void nextTick().then(() => {
                    tabRefs.value[next]?.focus();
                });
            }
        );

        // Ensure the tab refs array can hold one slot per option even
        // before each child mounts. Vue calls ref callbacks during the
        // mount pass; pre-sizing avoids a fleeting `undefined` slot
        // visible to consumers reading `tabRefs.value`.
        onMounted(() => {
            tabRefs.value.length = props.options.length;
        });

        return () => {
            const panelId = panelIdFor(props.path);
            const activeOption = props.options[props.activeIndex];
            return h("div", undefined, [
                h(
                    "div",
                    {
                        role: "tablist",
                        "aria-label": "Select variant",
                        "aria-orientation": "horizontal",
                        style: {
                            display: "flex",
                            gap: "0.25rem",
                            marginBottom: "0.5rem",
                        },
                        onKeydown: handleKeyDown,
                    },
                    props.options.map((_opt, i) => {
                        const isActive = i === props.activeIndex;
                        return h(
                            "button",
                            {
                                key: String(i),
                                ref: setTabRef(i),
                                type: "button",
                                role: "tab",
                                id: tabIdFor(props.path, i),
                                "aria-selected": isActive ? "true" : "false",
                                "aria-controls": panelId,
                                tabindex: isActive ? 0 : -1,
                                onClick: () => {
                                    handleTabChange(i);
                                },
                                style: {
                                    padding: "0.25rem 0.75rem",
                                    border: isActive
                                        ? "1px solid #3b82f6"
                                        : "1px solid #d1d5db",
                                    borderRadius: "0.25rem",
                                    background: isActive
                                        ? "#eff6ff"
                                        : "transparent",
                                    cursor: "pointer",
                                    fontSize: "0.875rem",
                                },
                            },
                            props.optionLabels[i]
                        );
                    })
                ),
                h(
                    "div",
                    {
                        role: "tabpanel",
                        id: panelId,
                        "aria-labelledby": tabIdFor(
                            props.path,
                            props.activeIndex
                        ),
                    },
                    activeOption !== undefined
                        ? [
                              props.renderProps.renderChild(
                                  activeOption,
                                  props.renderProps.value,
                                  props.renderProps.onChange
                              ),
                          ]
                        : []
                ),
            ]);
        };
    },
});

/**
 * Headless renderer for `DiscriminatedUnionField` — tabbed UI driven by
 * the discriminator.
 */
export function renderDiscriminatedUnion(props: VueRenderProps): VNode {
    if (props.tree.type !== "discriminatedUnion") {
        if (props.value === undefined || props.value === null)
            return h("span", undefined, EM_DASH);
        return h("span", undefined, JSON.stringify(props.value));
    }
    const { options, discriminator: discKey } = props.tree;
    if (options.length === 0) {
        if (props.value === undefined || props.value === null)
            return h("span", undefined, EM_DASH);
        return h("span", undefined, JSON.stringify(props.value));
    }

    const valueObject = isObject(props.value) ? props.value : undefined;
    const { optionLabels, activeIndex, activeOption } =
        resolveDiscriminatedActive(options, discKey, valueObject);

    if (props.readOnly) {
        if (activeOption !== undefined) {
            return props.renderChild(activeOption, props.value, props.onChange);
        }
        return h("span", undefined, EM_DASH);
    }

    return h(DiscriminatedUnionTabs, {
        options,
        optionLabels,
        activeIndex,
        path: props.path,
        discKey,
        renderProps: props,
    });
}

/** Headless renderer for `FileField` — plain `<input type="file">`. */
export function renderFile(props: VueRenderProps): VNode {
    const id = inputId(props.path);
    const accept = props.constraints.mimeTypes?.join(",");

    if (props.readOnly) {
        return h("span", { id }, "File field");
    }

    const ariaAttrs = buildAriaAttrs(props.tree, props.meta.description);
    const hintInfo = buildHintInfo(id, props.constraints);

    const inputProps: Record<string, unknown> = {
        id,
        type: "file",
        onChange: (e: Event) => {
            const target = inputTarget(e);
            if (target === undefined) return;
            const file = target.files?.[0];
            if (file !== undefined) {
                props.onChange(file);
            }
        },
        ...ariaAttrs,
    };
    if (accept !== undefined) inputProps.accept = accept;
    if (hintInfo !== undefined) {
        inputProps["aria-describedby"] = hintInfo.ariaDescribedBy;
    }

    const fileInput = h("input", inputProps);
    return withHint(fileInput, hintInfo);
}

/**
 * Render a literal field — `z.literal("a")` or `{ const: 5 }`.
 *
 * Literals are non-editable by nature (the value is fixed at the schema
 * level), so both read-only and editable modes display the literal
 * value(s). Multiple literals (`z.literal(["a", "b"])`) render
 * comma-separated.
 */
export function renderLiteral(props: VueRenderProps): VNode {
    const id = inputId(props.path);
    if (props.tree.type !== "literal") return h("span");
    const values = props.tree.literalValues;
    if (values.length === 0) {
        return h("span", { id }, EM_DASH);
    }
    const display = values.map((v) => displayJsonValue(v)).join(", ");
    return h("span", { id }, display);
}

/**
 * Render a null field — `z.null()` or `{ type: "null" }`.
 *
 * The only valid value is `null`, so render an em-dash placeholder
 * regardless of mode.
 */
export function renderNull(props: VueRenderProps): VNode {
    const id = inputId(props.path);
    return h("span", { id }, EM_DASH);
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
export function renderNever(props: VueRenderProps): VNode {
    const id = inputId(props.path);
    return h(
        "span",
        { id, class: SC_CLASSES.never },
        h("em", undefined, "never matches")
    );
}

/**
 * Render a tuple field — `z.tuple([z.string(), z.number()])` or
 * `{ prefixItems: [...] }`.
 *
 * Positional rendering: each `prefixItems` entry is rendered at its
 * index. The structural index (e.g. `[0]`) is passed as the path suffix
 * so children get unique ids and labels.
 */
export function renderTuple(props: VueRenderProps): VNode {
    if (props.tree.type !== "tuple") return h("span");
    const prefixItems = props.tree.prefixItems;
    const restItems = props.tree.restItems;
    const arr = Array.isArray(props.value) ? props.value : [];
    if (
        prefixItems.length === 0 &&
        restItems === undefined &&
        arr.length === 0
    ) {
        return h("span", { style: { display: "none" } });
    }

    const restCount =
        restItems !== undefined
            ? Math.max(arr.length - prefixItems.length, 0)
            : 0;

    const children: VNode[] = [];
    prefixItems.forEach((element, i) => {
        const itemValue: unknown = arr[i];
        const childOnChange = (v: unknown) => {
            const next = arr.slice();
            next[i] = v;
            props.onChange(next);
        };
        children.push(
            h(
                "div",
                { key: String(i) },
                props.renderChild(
                    element,
                    itemValue,
                    childOnChange,
                    `[${String(i)}]`
                )
            )
        );
    });
    if (restItems !== undefined) {
        for (let j = 0; j < restCount; j++) {
            const i = prefixItems.length + j;
            const itemValue: unknown = arr[i];
            const childOnChange = (v: unknown) => {
                const next = arr.slice();
                next[i] = v;
                props.onChange(next);
            };
            children.push(
                h(
                    "div",
                    { key: `rest-${String(i)}` },
                    props.renderChild(
                        restItems,
                        itemValue,
                        childOnChange,
                        `[${String(i)}]`
                    )
                )
            );
        }
    }

    const groupProps: Record<string, unknown> = { role: "group" };
    const label = ariaLabel(props.meta.description);
    if (label !== undefined) groupProps["aria-label"] = label;

    return h("div", groupProps, children);
}

/**
 * Render a conditional field — JSON Schema `if`/`then`/`else`.
 *
 * Conditional schemas describe constraints rather than a single value
 * shape, so the renderer surfaces each clause as a labelled fieldset.
 */
export function renderConditional(props: VueRenderProps): VNode {
    if (props.tree.type !== "conditional") return h("span");
    const { ifClause, thenClause, elseClause } = props.tree;
    const children: VNode[] = [
        h("div", { class: SC_CLASSES.conditionalIf }, [
            h("strong", undefined, "if:"),
            " ",
            props.renderChild(ifClause, props.value, props.onChange),
        ]),
    ];
    if (thenClause !== undefined) {
        children.push(
            h("div", { class: SC_CLASSES.conditionalThen }, [
                h("strong", undefined, "then:"),
                " ",
                props.renderChild(thenClause, props.value, props.onChange),
            ])
        );
    }
    if (elseClause !== undefined) {
        children.push(
            h("div", { class: SC_CLASSES.conditionalElse }, [
                h("strong", undefined, "else:"),
                " ",
                props.renderChild(elseClause, props.value, props.onChange),
            ])
        );
    }
    return h("fieldset", { class: SC_CLASSES.conditional }, children);
}

/**
 * Render a negation field — JSON Schema `{ not: { ... } }`.
 *
 * Negation describes a constraint ("value must NOT match this schema")
 * rather than a value shape.
 */
export function renderNegation(props: VueRenderProps): VNode {
    if (props.tree.type !== "negation") return h("span");
    return h("fieldset", { class: SC_CLASSES.negation }, [
        h("strong", undefined, "Must NOT match:"),
        " ",
        props.renderChild(props.tree.negated, props.value, props.onChange),
    ]);
}

/**
 * Headless renderer for `UnknownField` — JSON-encoded fallback for
 * unconstrained values.
 */
export function renderUnknown(props: VueRenderProps): VNode {
    const id = inputId(props.path);

    if (props.readOnly) {
        if (props.value === undefined || props.value === null)
            return h("span", { id }, EM_DASH);
        const display =
            typeof props.value === "string"
                ? props.value
                : JSON.stringify(props.value);
        return h("span", { id }, display);
    }

    const strValue = typeof props.value === "string" ? props.value : "";
    return h("input", {
        id,
        type: "text",
        value: props.writeOnly ? "" : strValue,
        onInput: (e: Event) => {
            const target = inputTarget(e);
            if (target === undefined) return;
            props.onChange(target.value);
        },
    });
}
