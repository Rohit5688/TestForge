import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServiceContainer } from "../container/ServiceContainer.js";
import { textResult, truncate } from "./_helpers.js";
import type { ProjectMaintenanceService } from "../services/setup/ProjectMaintenanceService.js";

export function registerUpgradeProject(server: McpServer, container: ServiceContainer) {
  const maintenance = container.resolve<ProjectMaintenanceService>("maintenance");

  server.registerTool(
    "upgrade_project",
    {
      description: `TRIGGER: User says 'update dependencies / upgrade project / outdated'
RETURNS: { log: string[], warnings: string[], packagesUpdated: number }
NEXT: Run npm install → check_playwright_ready to verify upgrade
COST: Medium (reads package.json, migrates config, ~200-400 tokens)
ERROR_HANDLING: Throws McpErrors.projectValidationFailed if config invalid before upgrade.

Upgrades npm packages, migrates mcp-config.json, repairs missing files. Safe to re-run.

OUTPUT INSTRUCTIONS: Do NOT repeat file path or parameters. Do NOT summarise what you just did. Acknowledge in <=10 words, then proceed. Keep response under 100 words unless explaining an error.`,
      inputSchema: z.object({
        "projectRoot": z.string()
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    async (args) => {
      const { projectRoot } = args as any;
      const result = await maintenance.upgradeProject(projectRoot);
      return textResult(truncate(JSON.stringify(result, null, 2)));
    }
  );
}
