import type { Meta, StoryObj } from "@storybook/react";
import {
    ApiOperation,
    ApiParameters,
    ApiRequestBody,
    ApiResponse,
} from "schema-components/openapi/components";
import { complexOpenApiSpec } from "../src/demo-schemas.ts";
import { DemoCard, DemoGrid, StoryPage } from "../src/story-layout.tsx";

function OpenApiCompleteness() {
    return (
        <StoryPage
            title="OpenAPI completeness"
            description="Operation-level components render parameters, request bodies, responses, and multiple content types from the same OpenAPI 3.1 document."
        >
            <DemoGrid>
                <DemoCard title="Full operation">
                    <ApiOperation
                        schema={complexOpenApiSpec}
                        path="/orders/{orderId}"
                        method="put"
                    />
                </DemoCard>
                <DemoCard title="Parameters">
                    <ApiParameters
                        schema={complexOpenApiSpec}
                        path="/orders/{orderId}"
                        method="get"
                    />
                </DemoCard>
                <DemoCard title="Request body">
                    <ApiRequestBody
                        schema={complexOpenApiSpec}
                        path="/orders/{orderId}"
                        method="put"
                    />
                </DemoCard>
                <DemoCard title="Response">
                    <ApiResponse
                        schema={complexOpenApiSpec}
                        path="/orders/{orderId}"
                        method="get"
                        status="200"
                    />
                </DemoCard>
            </DemoGrid>
        </StoryPage>
    );
}

const meta: Meta<typeof OpenApiCompleteness> = {
    title: "OpenAPI/Completeness",
    component: OpenApiCompleteness,
    tags: ["openapi"],
};

export default meta;
type Story = StoryObj<typeof OpenApiCompleteness>;

export const Default: Story = {
    render: () => <OpenApiCompleteness />,
};
