import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServiceContainer } from "../container/ServiceContainer.js";
import { textResult, truncate } from "./_helpers.js";
import type { PlaywrightSessionService } from "../services/execution/PlaywrightSessionService.js";

export function registerNavigateSession(server: McpServer, container: ServiceContainer) {
  const session = container.resolve<PlaywrightSessionService>("session");

  server.registerTool(
    "navigate_session",
    {
      description: `TRIGGER: Re-route an active session context to a new URL.
RETURNS: Navigation result or confirmation from page.goto().
NEXT: Call inspect_page_dom or verify_selector on the new page.
COST: Low (~50 tokens + browser nav time)
ERROR_HANDLING: Standard

Navigates the persistent session to a target URL.

OUTPUT INSTRUCTIONS: Do NOT repeat file path or parameters. Do NOT summarise what you just did. Acknowledge in <=10 words, then proceed. Keep response under 100 words unless explaining an error.`,
      inputSchema: z.object({
        "url": z.string().describe("The URL to navigate to."),
        "screenshot": z.boolean().optional().describe("If true, captures a screenshot after navigation so the LLM can see what the browser sees. Requires enableVisualMode or enableVisualExploration in mcp-config."),
        "projectRoot": z.string().optional().describe("Optional project root for screenshot storage path resolution.")
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    async (args) => {
      const { url, screenshot, projectRoot } = args as any;
      const result = await session.navigate(url, 'load', 30000, !!screenshot, projectRoot);
      return textResult(truncate(result));
    }
  );
}
