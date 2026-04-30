import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServiceContainer } from "../container/ServiceContainer.js";
import { textResult, truncate } from "./_helpers.js";
import { SuiteSummaryService } from "../services/analysis/SuiteSummaryService.js";
import * as fs from "fs";
import * as path from "path";

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
        "projectRoot": z.string().describe("Absolute path to the test project."),
        "brief": z.boolean().optional().describe("If true, returns compact summary only: file count, scenario count, top 10 tags, uncovered screens. Skips per-scenario listing. ~2k tokens vs default 21k+.")
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async (args) => {
      const { projectRoot, brief } = args as any;
      const report = summaryService.summarize(projectRoot);

      if (brief) {
        // Build compact summary — skip per-file scenario listings
        const topTags = Object.entries(report.tagBreakdown as Record<string, number>)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([tag, count]) => `  ${tag}: ${count} scenario(s)`)
          .join('\n');

        // Coverage gap: cross-ref known nav screens vs feature file URLs
        const knownNavPath = path.join(projectRoot, '.TestForge', 'navigation-map.json');
        let coverageGap = '';
        try {
          const navMap = JSON.parse(fs.readFileSync(knownNavPath, 'utf-8'));
          const knownScreens: string[] = navMap.knownScreens ?? [];
          const featureContent = report.features.map((f: any) => f.feature).join('\n');
          const uncovered = knownScreens.filter((screen: string) => {
            const urlPart = screen.split(' — ')[1] ?? '';
            return urlPart && !featureContent.includes(urlPart.split('/').pop() ?? urlPart);
          });
          if (uncovered.length > 0) {
            coverageGap = `\n\n⚠️ Potentially uncovered screens (${uncovered.length}):\n${uncovered.map((s: string) => `  - ${s}`).join('\n')}`;
          }
        } catch { /* navigation-map.json not found — skip */ }

        const briefReport = [
          `📋 SUITE BRIEF — ${report.features.length} feature file(s) · ${report.totalScenarios} scenario(s)`,
          `\n🏷️  Top 10 Tags:\n${topTags}`,
          coverageGap
        ].join('');

        return textResult(briefReport);
      }

      return textResult(report.plainEnglishSummary);
    }
  );
}
