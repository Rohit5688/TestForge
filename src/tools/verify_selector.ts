import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServiceContainer } from "../container/ServiceContainer.js";
import { textResult, truncate } from "./_helpers.js";
import type { PlaywrightSessionService } from "../services/execution/PlaywrightSessionService.js";
import type { SelfHealingService } from "../services/execution/SelfHealingService.js";
import type { DnaTrackerService } from "../services/execution/DnaTrackerService.js";

export function registerVerifySelector(server: McpServer, container: ServiceContainer) {
  const session = container.resolve<PlaywrightSessionService>("session");
  const selfHealer = container.resolve<SelfHealingService>("healer");
  const dnaTracker = container.resolve<DnaTrackerService>("dnaTracker");

  server.registerTool(
    "verify_selector",
    {
      description: `TRIGGER: Proactively guarantee locators before writing Page Objects.
RETURNS: { valid: boolean, visible: boolean, enabled: boolean, count: number } — live verification result.
NEXT: If valid → Write locator to Page Object | If invalid → Fix selector and retry.
COST: Low (~50 tokens + live browser query)
ERROR_HANDLING: Standard

Tests a CSS/XPath selector LIVE in the persistent browser without running a full script. Pass autoTrain:true to auto-learn the fix after a successful heal.

OUTPUT INSTRUCTIONS: Do NOT repeat file path or parameters. Do NOT summarise what you just did. Acknowledge in <=10 words, then proceed. Keep response under 100 words unless explaining an error.`,
      inputSchema: z.object({
        "selector": z.string().describe("The raw generic selector (e.g. '.submit-btn' or '//button')."),
        "oldSelector": z.string().describe("Optional: the original failed selector, used to record a heal in mcp-learning.json when autoTrain is true.").optional(),
        "projectRoot": z.string().describe("Optional: absolute path to project root. Required for autoTrain and DNA tracking.").optional(),
        "autoTrain": z.boolean().describe("If true, on a successful selector verification, automatically records the fix (oldSelector -> selector) in mcp-learning.json via LearningService.").optional()
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    async (args) => {
      const { selector, oldSelector, projectRoot, autoTrain } = args as any;
      const result = await session.verifySelector(selector);

      if (projectRoot) {
        try {
          dnaTracker.track(projectRoot, selector, '', '', '', '');
        } catch { /* non-fatal */ }
      }

      if (autoTrain && projectRoot && oldSelector) {
        selfHealer.notifyHealSuccess(projectRoot, oldSelector, selector);
      }

      return textResult(truncate(result));
    }
  );
}
