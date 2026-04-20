import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServiceContainer } from "../container/ServiceContainer.js";
import { PreFlightService } from "../services/setup/PreFlightService.js";
import { McpErrors } from "../types/ErrorSystem.js";

export function registerCheckPlaywrightReady(server: McpServer, container: ServiceContainer) {
  // Service resolves from static singleton pattern in original logic
  
  server.registerTool(
    "check_playwright_ready",
    {
      description: `TRIGGER: Verify readiness before tests\nRETURNS: Preparedness report\nNEXT: Evaluate output → Proceed\nCOST: Low\nERROR_HANDLING: Throws McpErrors.projectValidationFailed if not ready\n\nChecks if Playwright, configured browsers, baseUrl, and mcp-config are valid/reachable.\n\nOUTPUT INSTRUCTIONS: Do NOT repeat file path or parameters. Do NOT summarise what you just did. Acknowledge in <=10 words, then proceed. Keep response under 100 words unless explaining an error.`,
      inputSchema: z.object({
        "projectRoot": z.string().describe("Project root to check."),
        "baseUrl": z.string().optional().describe("Optional baseUrl to verify reachability. Defaults to BASE_URL in .env."),
        "forceRefresh": z.boolean().optional().describe("If true, ignores cache to run checks fresh.")
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async (args) => {
      const { projectRoot, baseUrl, forceRefresh } = args as any;
      const preFlight = PreFlightService.getInstance();
      const report = await preFlight.runChecks(projectRoot, baseUrl, forceRefresh);
      const formatted = preFlight.formatReport(report);

      if (!report.allPassed) {
        throw McpErrors.projectValidationFailed(formatted, "check_playwright_ready");
      }
      return { content: [{ type: "text", text: formatted }] };
    }
  );
}
