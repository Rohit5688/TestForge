import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServiceContainer } from "../container/ServiceContainer.js";
import { textResult, truncate } from "./_helpers.js";
import type { ProjectMaintenanceService } from "../services/setup/ProjectMaintenanceService.js";
import type { CodebaseAnalyzerService } from "../services/analysis/CodebaseAnalyzerService.js";
import type { RefactoringService } from "../services/generation/RefactoringService.js";
import { sanitizeOutput } from "../utils/SecurityUtils.js";

export function registerSuggestRefactorings(server: McpServer, container: ServiceContainer) {
  const maintenance = container.resolve<ProjectMaintenanceService>("maintenance");
  const analyzer = container.resolve<CodebaseAnalyzerService>("analyzer");
  const refactoringService = container.resolve<RefactoringService>("refactoring");

  server.registerTool(
    "suggest_refactorings",
    {
      description: `TRIGGER: Keep the codebase clean. Before or after major test generation runs.
RETURNS: JSON/Markdown pruning plan — duplicate step definitions and unused Page Object methods.
NEXT: Apply suggested removals → Validate suite still passes after cleanup.
COST: Medium (reads full suite, ~200-500 tokens)
ERROR_HANDLING: Standard

Analyzes the codebase to find duplicate step definitions and unused Page Object methods.

OUTPUT INSTRUCTIONS: Do NOT repeat file path or parameters. Do NOT summarise what you just did. Acknowledge in <=10 words, then proceed. Keep response under 100 words unless explaining an error.`,
      inputSchema: z.object({
        "projectRoot": z.string().describe("Absolute path to the automation project.")
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    async (args) => {
      const { projectRoot } = args as any;
      await maintenance.ensureUpToDate(projectRoot);
      const analysis = await analyzer.analyze(projectRoot);
      const report = refactoringService.generateRefactoringSuggestions(analysis);

      return textResult(truncate(sanitizeOutput(report)));
    }
  );
}
