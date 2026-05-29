/**
 * Read-only JSON Schema preview.
 */
import type { BuilderSchema, JsonSchemaObject } from "./types.ts";
import { toJsonSchema } from "./toJsonSchema.ts";

export function SchemaPreview({ schema }: { readonly schema: BuilderSchema }) {
    const jsonSchema: JsonSchemaObject = toJsonSchema(schema);

    return (
        <pre className="sb-schema-preview">
            {JSON.stringify(jsonSchema, null, 2)}
        </pre>
    );
}
