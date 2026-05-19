/**
 * Tests for the shared FieldShell component.
 *
 * FieldShell wraps a host primitive with `<label htmlFor>`, the required
 * indicator, and a constraint-hint `<small>` element wired via
 * `aria-describedby`. Theme adapters compose around this shell so the
 * accessibility scaffolding stays identical regardless of which UI
 * library renders the actual input.
 */

import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { FieldShell } from "../src/react/fieldShell.tsx";
import type { RenderProps } from "../src/core/renderer.ts";
import type { StringField } from "../src/core/types.ts";

function makeStringField(overrides: Partial<StringField> = {}): StringField {
    return {
        type: "string",
        isOptional: true,
        meta: {},
        editability: "editable",
        constraints: {},
        ...overrides,
    };
}

function makeProps(overrides: Partial<RenderProps> = {}): RenderProps {
    const tree = overrides.tree ?? makeStringField();
    return {
        value: "",
        readOnly: false,
        writeOnly: false,
        meta: tree.meta,
        constraints: tree.constraints,
        path: "name",
        tree,
        onChange: () => {
            // intentional no-op for tests
        },
        renderChild: () => null,
        ...overrides,
    };
}

describe("FieldShell", () => {
    it("renders a labelled input with the description", () => {
        const tree = makeStringField({ meta: { description: "Full name" } });
        const props = makeProps({ tree });
        const html = renderToString(
            <FieldShell props={props} inputId="sc-name">
                {(aria) => <input id="sc-name" type="text" {...aria} />}
            </FieldShell>
        );
        expect(html).toContain('for="sc-name"');
        expect(html).toContain("Full name");
        expect(html).toContain('id="sc-name"');
    });

    it("emits aria-required on required fields", () => {
        const tree = makeStringField({
            isOptional: false,
            meta: { description: "Full name" },
        });
        const props = makeProps({ tree });
        const html = renderToString(
            <FieldShell props={props} inputId="sc-name">
                {(aria) => <input id="sc-name" type="text" {...aria} />}
            </FieldShell>
        );
        expect(html).toContain('aria-required="true"');
        // Required indicator asterisk renders inside the label.
        expect(html).toContain("sc-required");
        expect(html).toContain("*");
    });

    it("omits aria-required when the field is optional", () => {
        const tree = makeStringField({ meta: { description: "Bio" } });
        const props = makeProps({ tree });
        const html = renderToString(
            <FieldShell props={props} inputId="sc-bio">
                {(aria) => <input id="sc-bio" type="text" {...aria} />}
            </FieldShell>
        );
        expect(html).not.toContain("aria-required");
        expect(html).not.toContain("sc-required");
    });

    it("emits a constraint hint and aria-describedby when constraints apply", () => {
        const tree = makeStringField({
            constraints: { minLength: 3, maxLength: 20 },
            meta: { description: "Username" },
        });
        const props = makeProps({ tree });
        const html = renderToString(
            <FieldShell props={props} inputId="sc-username">
                {(aria) => <input id="sc-username" type="text" {...aria} />}
            </FieldShell>
        );
        expect(html).toContain("Minimum 3 characters");
        expect(html).toContain("Maximum 20 characters");
        expect(html).toContain('aria-describedby="sc-username-hint"');
        expect(html).toContain('id="sc-username-hint"');
        expect(html).toContain("sc-hint");
    });

    it("omits the hint when no constraint copy applies", () => {
        const tree = makeStringField({ meta: { description: "Bio" } });
        const props = makeProps({ tree });
        const html = renderToString(
            <FieldShell props={props} inputId="sc-bio">
                {(aria) => <input id="sc-bio" type="text" {...aria} />}
            </FieldShell>
        );
        expect(html).not.toContain("sc-hint");
        expect(html).not.toContain("aria-describedby");
    });

    it("suppresses the wrapping label when hideLabel is true", () => {
        const tree = makeStringField({ meta: { description: "Full name" } });
        const props = makeProps({ tree });
        const html = renderToString(
            <FieldShell props={props} inputId="sc-name" hideLabel>
                {(aria) => <input id="sc-name" type="text" {...aria} />}
            </FieldShell>
        );
        // The shell does not render `<label>` itself; the host primitive
        // is responsible for its own labelling under hideLabel.
        expect(html).not.toContain('for="sc-name"');
        // The description is still available for screen readers via the
        // aria-label attribute, so the input remains labelled.
        expect(html).toContain('aria-label="Full name"');
    });
});
