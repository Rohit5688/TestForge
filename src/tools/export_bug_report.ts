import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServiceContainer } from "../container/ServiceContainer.js";
import { textResult } from "./_helpers.js";
import type { BugReportService } from "../services/system/BugReportService.js";

export function registerExportBugReport(server: McpServer, container: ServiceContainer) {
  const bugReportService = container.resolve<BugReportService>("bugReport");

  server.registerTool(
    "export_bug_report",
    {
      description: `TRIGGER: Failed test needs tracking in ticket OR create Jira bug report\nRETURNS: Markdown string (Jira-ready format with severity, steps, environment, fix suggestion)\nNEXT: Copy Markdown to Jira & Create ticket\nCOST: Low (formats error into template, ~100-200 tokens)\nERROR_HANDLING: None - always succeeds, may request clarification for severity.\n\nAuto-classifies severity, adds reproduction steps, environment details, suggested fix.\n\nOUTPUT: Ack (<= 10 words), proceed.
  
  OUTPUT INSTRUCTIONS: Do NOT repeat file path or parameters. Do NOT summarise what you just did. Acknowledge in <=10 words, then proceed. Keep response under 100 words unless explaining an error.`,
      inputSchema: z.object({
        "testName": z.string(),
        "rawError": z.string(),
        "browser": z.string().optional(),
        "baseUrl": z.string().optional(),
        "appVersion": z.string().optional()
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async (args) => {
      const { testName, rawError, browser, baseUrl, appVersion } = args as any;
      return textResult(bugReportService.generateBugReport(testName, rawError, browser, baseUrl, appVersion));
    }
  );
}
