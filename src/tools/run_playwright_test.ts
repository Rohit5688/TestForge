import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServiceContainer } from "../container/ServiceContainer.js";
import { textResult, truncate } from "./_helpers.js";
import { TestRunnerService } from "../services/execution/TestRunnerService.js";

export function registerRunPlaywrightTest(server: McpServer, container: ServiceContainer) {
  const runner = container.resolve<TestRunnerService>("runner");

  server.registerTool(
    "run_playwright_test",
    {
      description: `TRIGGER: After generating or updating tests to verify they pass.
RETURNS: Terminal output from npm test run — pass/fail summary with error DNA for failed tests.
NEXT: If passed → Done | If failed → Call self_heal_test(errorDna) to fix.
COST: High (runs full test suite, ~500-5000 tokens depending on output size)
ERROR_HANDLING: Standard

Executes the Playwright-BDD test suite natively.

OUTPUT: Ack (<= 10 words), proceed.`,
      inputSchema: z.object({
        "projectRoot": z.string().describe("Absolute path to the automation project."),
        "tags": z.string().optional().describe("Optional: filter by tag(s), e.g. '@smoke' or '@regression'. Passed as --grep to Playwright."),
        "specificTestArgs": z.string().optional().describe("Optional arguments like a specific feature file path or project flag."),
        "overrideCommand": z.string().optional().describe("Optional full command to run (e.g. 'npm run test:e2e:smoke'). This bypasses the default executionCommand.")
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    async (args) => {
      const { projectRoot, tags, specificTestArgs, overrideCommand } = args as any;
      let argsStr = specificTestArgs || '';
      if (tags) {
        argsStr = `--grep ${tags} ${argsStr}`.trim();
      }
      const result = await runner.runTests(projectRoot, argsStr, undefined, overrideCommand);
      return textResult(result.output);
    }
  );
}
