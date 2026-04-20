import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServiceContainer } from "../container/ServiceContainer.js";
import { textResult, truncate } from "./_helpers.js";
import type { ProjectSetupService } from "../services/setup/ProjectSetupService.js";

export function registerSetupProject(server: McpServer, container: ServiceContainer) {
  const projectSetup = container.resolve<ProjectSetupService>("projectSetup");

  server.registerTool(
    "setup_project",
    {
      description: `TRIGGER: First time setting up a new TestForge environment.
RETURNS: Setup completion report — files created, npm packages installed, mcp-config.json written.
NEXT: Edit mcp-config.json to set baseUrl → Call check_environment to verify.
COST: High (installs npm packages + creates project structure, ~500-2000 tokens)
ERROR_HANDLING: Standard

Bootstraps an empty directory into a fully configured Playwright-BDD project.

OUTPUT INSTRUCTIONS: Do NOT repeat file path or parameters. Do NOT summarise what you just did. Acknowledge in <=10 words, then proceed. Keep response under 100 words unless explaining an error.`,
      inputSchema: z.object({
        "projectRoot": z.string()
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    async (args) => {
      const { projectRoot } = args as any;
      const result = await projectSetup.setup(projectRoot);
      return textResult(truncate(result));
    }
  );
}
