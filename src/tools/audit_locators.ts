import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServiceContainer } from "../container/ServiceContainer.js";
import { textResult, truncate } from "./_helpers.js";
import type { CodebaseAnalysisResult } from "../interfaces/ICodebaseAnalyzer.js";

import type { LocatorAuditService } from "../services/audit/LocatorAuditService.js";

export function registerAuditLocators(server: McpServer, container: ServiceContainer) {
  const locatorAudit = container.resolve<LocatorAuditService>("locatorAudit");
  const analysisCache = container.resolve<Map<string, CodebaseAnalysisResult>>("analysisCache");

  server.registerTool(
    "audit_locators",
    {
      description: `TRIGGER: Verify locator health across the project.
RETURNS: Markdown health report flagging brittle selectors (XPath, dynamic classes, index-based).
NEXT: Fix flagged brittle locators → Replace with role/label/testId-based selectors.
COST: Low (~100-200 tokens)
ERROR_HANDLING: Standard

Scans Page Objects and flags brittle strategies.

OUTPUT: Ack (<= 10 words), proceed.`,
      inputSchema: z.object({
        "projectRoot": z.string().describe("Absolute path to the automation project."),
        "pagesRoot": z.string().optional().describe("Relative path to the pages directory. Defaults to 'pages'")
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async (args) => {
      const { projectRoot, pagesRoot } = args as any;
      const report = await locatorAudit.audit(projectRoot, pagesRoot || 'pages');
      return textResult(report.markdownReport);
    }
  );
}
