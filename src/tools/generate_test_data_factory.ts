import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServiceContainer } from "../container/ServiceContainer.js";
import { textResult, truncate } from "./_helpers.js";
import type { FixtureDataService } from "../services/generation/FixtureDataService.js";

export function registerGenerateTestDataFactory(server: McpServer, container: ServiceContainer) {
  const dataFactory = container.resolve<FixtureDataService>("fixtureData");

  server.registerTool(
    "generate_test_data_factory",
    {
      description: `TRIGGER: Mock backend or entity data. To scaffold typed Faker.js fixtures.
RETURNS: System instructions for LLM to create a typed Faker.js data factory.
NEXT: Follow returned instructions → Generate and save factory file.
COST: Low (~100-200 tokens)
ERROR_HANDLING: Standard

Generates strict system instructions to help the LLM create a Playwright test fixture.

OUTPUT: Ack (<= 10 words), proceed.`,
      inputSchema: z.object({
        "entityName": z.string().describe("Name of the entity being mocked (e.g., 'User', 'Product')."),
        "schemaDefinition": z.string().describe("Text description, JSON schema, or TypeScript interface defining the fields of the entity.")
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async (args) => {
      const { entityName, schemaDefinition } = args as any;
      const prompt = dataFactory.generateFixturePrompt(entityName, schemaDefinition);
      return textResult(prompt);
    }
  );
}
