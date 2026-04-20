import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServiceContainer } from "../container/ServiceContainer.js";
import { textResult } from "./_helpers.js";
import type { OrchestrationService } from "../services/system/OrchestrationService.js";

export function registerCreateTestAtomically(server: McpServer, container: ServiceContainer) {
  const orchestrationService = container.resolve<OrchestrationService>("orchestrator");

  server.registerTool(
    "create_test_atomically",
    {
      description: `TRIGGER: After generating test files in memory — write them without manual validation chaining.
RETURNS: { success: boolean, filesWritten: string[] }
NEXT: run_playwright_test to verify written files pass.
COST: Low (~100-200 tokens)
ERROR_HANDLING: Throws on TypeScript/Gherkin syntax validation failure.

Validates TypeScript/Gherkin syntax, then writes to disk atomically in one call.

OUTPUT INSTRUCTIONS: Do NOT repeat file paths or parameters. Do NOT summarize what you just did. Briefly acknowledge completion (<= 10 words), then proceed to next step.`,
      inputSchema: z.object({
        projectRoot: z.string(),
        generatedFiles: z.array(z.object({
          path: z.string(),
          content: z.string()
        }))
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false }
    },
    async (args) => {
      try {
        const result = await orchestrationService.createTestAtomically(
          args.projectRoot,
          args.generatedFiles
        );
        return textResult(JSON.stringify(result, null, 2));
      } catch (err: any) {
        const { toMcpErrorResponse } = await import('../types/ErrorSystem.js');
        return toMcpErrorResponse(err, 'create_test_atomically');
      }
    }
  );
}
