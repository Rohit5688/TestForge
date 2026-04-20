import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServiceContainer } from "../container/ServiceContainer.js";
import { textResult } from "./_helpers.js";
import { TokenBudgetService } from "../services/config/TokenBudgetService.js";

export function registerGetTokenBudget(server: McpServer, _container: ServiceContainer) {
  server.registerTool(
    "get_token_budget",
    {
      title: "Get Token Budget",
      description: `TRIGGER: User asks 'how many tokens used / check costs / token report'
RETURNS: Per-tool breakdown of estimated session token usage.
NEXT: If CRITICAL (>150k tokens), start a new session.
COST: Low (reads in-memory counters).

OUTPUT INSTRUCTIONS: Display the report as-is. Do not add commentary.`,
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async (_args) => {
      const report = TokenBudgetService.getInstance().getBudgetReport();
      return textResult(report);
    }
  );
}
