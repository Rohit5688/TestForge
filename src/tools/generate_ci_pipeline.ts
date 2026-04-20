import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServiceContainer } from "../container/ServiceContainer.js";
import type { PipelineService } from "../services/generation/PipelineService.js";

export function registerGenerateCiPipeline(server: McpServer, container: ServiceContainer) {
  const pipelineService = container.resolve<PipelineService>("pipeline");

  server.registerTool(
    "generate_ci_pipeline",
    {
      description: `TRIGGER: Finalize a project setup on Github/Gitlab/Jenkins.
RETURNS: Path to the generated CI yaml file written to disk.
NEXT: Push CI file to repository → Setup branch protections.
COST: Low (~100-200 tokens)
ERROR_HANDLING: Standard

Generates a fully-configured CI/CD pipeline template and writes directly to disk.

OUTPUT INSTRUCTIONS: Do NOT repeat file path or parameters. Do NOT summarise what you just did. Acknowledge in <=10 words, then proceed. Keep response under 100 words unless explaining an error.`,
      inputSchema: z.object({
        "projectRoot": z.string().describe("Absolute path to the automation project."),
        "provider": z.string().describe("The CI/CD provider: 'github', 'gitlab', or 'jenkins'."),
        "runOnPush": z.boolean().describe("Whether to trigger the pipeline on git push/PR."),
        "runOnSchedule": z.string().describe("Optional cron schedule (e.g., '0 0 * * *' for nightly).").optional(),
        "nodeVersion": z.string().describe("Optional Node version (defaults to '20').").optional()
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    async (args) => {
      const { projectRoot, provider, runOnPush, runOnSchedule, nodeVersion } = args as any;
      const targetPath = pipelineService.generatePipeline(projectRoot, {
        provider,
        runOnPush,
        runOnSchedule,
        nodeVersion
      });
      return {
        content: [{
          type: "text", text: `🚀 Pipeline successfully generated at:\n  - ${targetPath}
  
  Ensure you push this file to your repository and setup branch protections if applicable.` }]
      };
    }
  );
}
