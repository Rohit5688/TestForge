import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServiceContainer } from "../container/ServiceContainer.js";
import { textResult, truncate } from "./_helpers.js";
import type { CoverageAnalysisService } from "../services/analysis/CoverageAnalysisService.js";

export function registerAnalyzeCoverage(server: McpServer, container: ServiceContainer) {
  const coverageAnalysis = container.resolve<CoverageAnalysisService>("coverageAnalysis");

  server.registerTool(
    "analyze_coverage",
    {
      description: `TRIGGER: Check screen coverage based on feature files.
RETURNS: Coverage report with untested screens and missing edge cases.
NEXT: Fix identified gaps → Add missing scenarios to feature files.
COST: Low (~100-200 tokens)
ERROR_HANDLING: Standard

Parses .feature files to identify untested screens and missing edge cases.

OUTPUT: Ack (<= 10 words), proceed.`,
      inputSchema: z.object({
        "projectRoot": z.string().describe("Absolute path to the automation project."),
        "featureFilesPaths": z.array(z.string()).describe("Array of paths to .feature files.")
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async (args) => {
      const { projectRoot, featureFilesPaths } = args as any;
      const report = coverageAnalysis.analyzeCoverage(projectRoot, featureFilesPaths);
      return textResult(JSON.stringify(report, null, 2));
    }
  );
}
