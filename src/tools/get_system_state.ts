import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServiceContainer } from "../container/ServiceContainer.js";
import { textResult } from "./_helpers.js";
import { ContextManager } from "../services/system/ContextManager.js";
import { TokenBudgetService } from "../services/config/TokenBudgetService.js";

export function registerGetSystemState(server: McpServer, _container: ServiceContainer) {
  server.registerTool(
    "get_system_state",
    {
      title: "Get System State",
      description: `TRIGGER: User asks 'what is the current state / context pulse / system snapshot'
RETURNS: DOM scan history summary, session token cost, and turn counter.
NEXT: Use compacted history as context before calling generate_gherkin_pom_test_suite.
COST: Low (reads in-memory context).

OUTPUT INSTRUCTIONS: Display the report as-is. Do not add commentary.`,
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async (_args) => {
      const ctx = ContextManager.getInstance();
      const budget = TokenBudgetService.getInstance();
      const history = ctx.getCompactedHistory();
      const lines = [
        `[System State Snapshot]`,
        `DOM Scans This Session: ${ctx.getScanCount()} (${ctx.getUrlCount()} unique URLs)`,
        `Latest URL: ${ctx.getLatestUrl() ?? 'none'}`,
        `Session Tokens: ~${budget.getSessionTokens().toLocaleString()}`,
        '',
        history || '(No DOM scans recorded yet)',
      ];
      return textResult(lines.join('\n'));
    }
  );
}
