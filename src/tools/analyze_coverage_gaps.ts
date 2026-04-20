import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServiceContainer } from "../container/ServiceContainer.js";
import { textResult, truncate } from "./_helpers.js";
import type { AnalyticsService } from "../services/system/AnalyticsService.js";

export function registerAnalyzeCoverageGaps(server: McpServer, container: ServiceContainer) {
  const analytics = container.resolve<AnalyticsService>("analytics");

  server.registerTool(
    "analyze_coverage_gaps",
    {
      description: `TRIGGER: After generating coverage reports to find specific test gaps.
RETURNS: LLM instructions to generate missing Playwright-BDD features for uncovered branches.
NEXT: Follow returned instructions → Generate missing feature scenarios.
COST: Low (~100-200 tokens)
ERROR_HANDLING: Standard

Analyzes istanbul/v8 LCOV coverage metrics to identify deeply untested branches.

OUTPUT: Ack (<= 10 words), proceed.`,
      inputSchema: z.object({
        "projectRoot": z.string().describe("Absolute path to the automation project.")
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async (args) => {
      const { projectRoot } = args as any;
      const report = analytics.analyzeCoverageGaps(projectRoot);
      return textResult(report);
    }
  );
}
