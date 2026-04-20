import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServiceContainer } from "../container/ServiceContainer.js";
import { textResult, truncate } from "./_helpers.js";
import { TestRunnerService } from "../services/execution/TestRunnerService.js";

export function registerUpdateVisualBaselines(server: McpServer, container: ServiceContainer) {
  const runner = container.resolve<TestRunnerService>("runner");

  server.registerTool(
    "update_visual_baselines",
    {
      description: `TRIGGER: Resolve visual regression failures. When toHaveScreenshot comparisons fail.
RETURNS: Test run output after rebaselining — updated snapshot files list.
NEXT: Commit updated screenshots to repository → Run tests again to confirm pass.
COST: High (runs full test suite with --update-snapshots, ~500-5000 tokens)
ERROR_HANDLING: Standard

Executes the Playwright test suite with the --update-snapshots flag to rebaseline image mismatches.

OUTPUT: Ack (<= 10 words), proceed.`,
      inputSchema: z.object({
        "projectRoot": z.string().describe("Absolute path to the automation project."),
        "tags": z.string().optional().describe("Optional: filter by tag(s), e.g. '@smoke' or '@regression'. Passed as --grep to Playwright."),
        "specificTestArgs": z.string().optional().describe("Optional arguments like a specific feature file path or project flag.")
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    async (args) => {
      const { projectRoot, tags, specificTestArgs } = args as any;
      let argsStr = `${specificTestArgs || ''} --update-snapshots`.trim();
      if (tags) {
        argsStr = `--grep ${tags} ${argsStr}`.trim();
      }
      const result = await runner.runTests(projectRoot, argsStr);
      return textResult(result.output);
    }
  );
}
