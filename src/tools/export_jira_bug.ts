import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServiceContainer } from "../container/ServiceContainer.js";
import { textResult, truncate } from "./_helpers.js";
import type { AnalyticsService } from "../services/system/AnalyticsService.js";

export function registerExportJiraBug(server: McpServer, container: ServiceContainer) {
  const analyticsService = container.resolve<AnalyticsService>("analytics");

  server.registerTool(
    "export_jira_bug",
    {
      description: `TRIGGER: When a failed test needs tracking as a Jira ticket.
RETURNS: Jira-formatted bug report Markdown with trace/video file paths, severity, steps, environment.
NEXT: Copy Markdown to Jira → Create ticket.
COST: Low (~100-200 tokens)
ERROR_HANDLING: Standard

Generates a Jira-formatted bug report from a failed Playwright test.

OUTPUT INSTRUCTIONS: Do NOT repeat file path or parameters. Do NOT summarise what you just did. Acknowledge in <=10 words, then proceed. Keep response under 100 words unless explaining an error.`,
      inputSchema: z.object({
        "testName": z.string().describe("The name of the failing test."),
        "rawError": z.string().describe("The Playwright error output.")
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    async (args) => {
      const { testName, rawError } = args as any;
      const bugReport = analyticsService.generateJiraBugPrompt(testName, rawError);
      return textResult(truncate(bugReport));
    }
  );
}
