import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServiceContainer } from "../container/ServiceContainer.js";
import { textResult, truncate } from "./_helpers.js";
import type { PlaywrightSessionService } from "../services/execution/PlaywrightSessionService.js";

export function registerStartSession(server: McpServer, container: ServiceContainer) {
  const sessionService = container.resolve<PlaywrightSessionService>("session");

  server.registerTool(
    "start_session",
    {
      description: `TRIGGER: Start of interactive or multi-step tasks requiring persistent browser context.
RETURNS: Session start confirmation with context ID, or stop confirmation.
NEXT: Call navigate_session or inspect_page_dom using the active session.
COST: Medium (launches Chromium headless, ~100-200 tokens)
ERROR_HANDLING: Standard

Starts a persistent Playwright browser session in the background. Avoids launching a new browser per action.

OUTPUT: Ack (<= 10 words), proceed.`,
      inputSchema: z.object({
        "operation": z.enum(["start", "stop"]).optional().describe("The operation to perform (start or stop). Default is start."),
        "headless": z.boolean().optional().describe("Whether to hide the browser UI. Default: true (headless)."),
        "storageState": z.string().optional().describe("Path to a storageState JSON (cookies/auth).")
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }
    },
    async (args) => {
      const { operation, headless, storageState } = args as any;
      if (operation === "stop") {
        const result = await sessionService.endSession();
        return textResult(result);
      }
      const result = await sessionService.startSession({ headless: headless !== false, storageState });
      return textResult(result);
    }
  );
}
