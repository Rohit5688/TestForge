import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServiceContainer } from "../container/ServiceContainer.js";
import { textResult, truncate } from "./_helpers.js";
import { SuiteSummaryService } from "../services/analysis/SuiteSummaryService.js";

export function registerSummarizeSuite(server: McpServer, container: ServiceContainer) {
  const summaryService = container.resolve<SuiteSummaryService>("suiteSummary");

  server.registerTool(
    "summarize_suite",
    {
      description: `TRIGGER: Get an overview of the current test suite.
RETURNS: Plain-English summary with tag breakdown and ready-to-run selective test commands.
NEXT: Run targeted subset with returned tags → Or identify coverage gaps.
COST: Low (~100-200 tokens)
ERROR_HANDLING: Standard

Reads all .feature files and returns a plain-English summary.

OUTPUT: Ack (<= 10 words), proceed.`,
      inputSchema: z.object({
        "projectRoot": z.string().describe("Absolute path to the test project.")
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async (args) => {
      const { projectRoot } = args as any;
      const report = summaryService.summarize(projectRoot);
      return textResult(report.plainEnglishSummary);
    }
  );
}
