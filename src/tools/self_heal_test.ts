import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServiceContainer } from "../container/ServiceContainer.js";
import { textResult, truncate } from "./_helpers.js";
import type { SelfHealingService } from "../services/execution/SelfHealingService.js";

export function registerSelfHealTest(server: McpServer, container: ServiceContainer) {
  const healer = container.resolve<SelfHealingService>("healer");

  server.registerTool(
    "self_heal_test",
    {
      description: `TRIGGER: After a run_playwright_test fails.
RETURNS: Targeted heal instruction — exact locator to fix, whether it's a scripting or app issue, how to re-inspect the live DOM.
NEXT: If scripting issue → Call verify_selector with candidate | If app issue → Report to team.
COST: Low (~100-300 tokens)
ERROR_HANDLING: Standard

Analyzes Playwright Error DNA to determine if it's a SCRIPTING issue or an APPLICATION issue.

OUTPUT: Ack (<= 10 words), proceed.`,
      inputSchema: z.object({
        "errorDna": z.object({
          "code": z.enum(["Infrastructure", "Logic", "Transient"]),
          "causalChain": z.string(),
          "originalError": z.string(),
          "reason": z.string()
        }).describe("The structured Error DNA object returned by the failing run_playwright_test output block."),
        "projectRoot": z.string().optional().describe("Optional absolute path to the automation project for loading config timeouts."),
        "pageUrl": z.string().optional().describe("Optional URL of the page being tested. If provided, the healer will call inspect_page_dom automatically to fetch fresh selectors.")
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    async (args) => {
      const { errorDna, projectRoot, pageUrl } = args as any;
      const result = healer.analyzeFailure(errorDna?.originalError || JSON.stringify(errorDna || {}), '', 'default', projectRoot);
      return textResult(JSON.stringify(result, null, 2));
    }
  );
}
