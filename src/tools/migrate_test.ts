import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServiceContainer } from "../container/ServiceContainer.js";
import { textResult, truncate } from "./_helpers.js";
import type { SeleniumMigrationService } from "../services/generation/SeleniumMigrationService.js";
import type { CodebaseAnalyzerService } from "../services/analysis/CodebaseAnalyzerService.js";

export function registerMigrateTest(server: McpServer, container: ServiceContainer) {
  const seleniumMigrator = container.resolve<SeleniumMigrationService>("seleniumMigrator");
  const analyzer = container.resolve<CodebaseAnalyzerService>("analyzer");

  server.registerTool(
    "migrate_test",
    {
      description: `TRIGGER: Port legacy scripts. Translate Selenium Java/Python/JS/C# to Playwright-BDD TypeScript.
RETURNS: System instructions (rigid prompt) for LLM to produce translated Playwright-BDD TypeScript.
NEXT: Follow returned instructions → Generate and write migrated test files.
COST: Low (~200-500 tokens)
ERROR_HANDLING: Standard

Translates legacy Java/Python/JS Selenium code into strict TypeScript Playwright-BDD.

OUTPUT: Ack (<= 10 words), proceed.`,
      inputSchema: z.object({
        "projectRoot": z.string().describe("Absolute path to the automation project."),
        "legacyCode": z.string().describe("The raw legacy Selenium code snippet or file content."),
        "sourceDialect": z.enum(["java", "python", "javascript", "csharp", "auto"]).describe("The language/dialect of the legacy code.")
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async (args) => {
      const { projectRoot, legacyCode, sourceDialect = 'auto' } = args as any;
      const codebaseContext = await analyzer.analyze(projectRoot);
      const prompt = seleniumMigrator.generateMigrationPrompt(projectRoot, legacyCode, sourceDialect, codebaseContext);
      return textResult(prompt);
    }
  );
}
