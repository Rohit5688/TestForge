import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServiceContainer } from "../container/ServiceContainer.js";
import { textResult, truncate } from "./_helpers.js";
import type { ProjectMaintenanceService } from "../services/setup/ProjectMaintenanceService.js";

export function registerRepairProject(server: McpServer, container: ServiceContainer) {
  const maintenance = container.resolve<ProjectMaintenanceService>("maintenance");

  server.registerTool(
    "repair_project",
    {
      description: `TRIGGER: Setup interrupted OR files accidentally deleted
RETURNS: { filesRegenerated: string[], skipped: string[] }
NEXT: check_playwright_ready to verify repair → Continue with workflow
COST: Low (checks file existence, writes missing files, ~100-200 tokens)
ERROR_HANDLING: None - always succeeds, regenerates only missing baseline files.

Regenerates ONLY missing baseline files. Never overwrites custom code. Safe to re-run.

OUTPUT INSTRUCTIONS: Do NOT repeat file path or parameters. Do NOT summarise what you just did. Acknowledge in <=10 words, then proceed. Keep response under 100 words unless explaining an error.`,
      inputSchema: z.object({
        "projectRoot": z.string()
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async (args) => {
      const { projectRoot } = args as any;
      const result = await maintenance.repairProject(projectRoot);
      return textResult(truncate(JSON.stringify(result, null, 2)));
    }
  );
}
