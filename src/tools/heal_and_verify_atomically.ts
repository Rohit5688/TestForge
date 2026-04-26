import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServiceContainer } from "../container/ServiceContainer.js";
import { textResult } from "./_helpers.js";
import type { OrchestrationService } from "../services/system/OrchestrationService.js";
import { McpErrors } from "../types/ErrorSystem.js";

export function registerHealAndVerifyAtomically(server: McpServer, container: ServiceContainer) {
  const orchestrator = container.resolve<OrchestrationService>("orchestrator");

  server.registerTool(
    "heal_and_verify_atomically",
    {
      title: "Heal and Verify Atomically",
      description: `TRIGGER: After a test fails with a bad selector — to fix it without manual chaining.
RETURNS: [HEAL RESULT] block: { healedSelector, verified, learned, confidence }. Read healedSelector — use it to update Page Object.
NEXT: If verified=true → update Page Object with healedSelector + call train_on_example | If verified=false → call inspect_page_dom for fresh selectors.
COST: Medium (live session verification, ~200-400 tokens)
ERROR_HANDLING: Standard

WORKFLOW ORCHESTRATOR: Self-heal → Verify → Learn in one atomic call. Requires active Playwright session (call start_session first). Provide candidateSelector from self_heal_test output.

OUTPUT INSTRUCTIONS: Do NOT repeat file paths or parameters. Do NOT summarize what you just did. Briefly acknowledge completion (<=10 words), then proceed to next step.`,
      inputSchema: z.object({
        projectRoot: z.string(),
        error: z.string().describe("Test failure error message"),
        xml: z.string().describe("Current DOM snapshot or page URL context"),
        oldSelector: z.string().optional().describe("The original failed selector (for better learning)"),
        candidateSelector: z.string().describe("The proposed replacement selector to verify")
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    async (args) => {
      let result: any;
      try {
        result = await orchestrator.healAndVerifyAtomically(
          args.projectRoot,
          args.error,
          args.xml,
          args.oldSelector,
          args.candidateSelector
        );
      } catch (err: any) {
        throw McpErrors.selfHealFailed(
          err?.message ?? String(err),
          'heal_and_verify_atomically',
          { suggestedNextTools: ['inspect_page_dom', 'verify_selector', 'self_heal_test'] }
        );
      }
      const block = `[HEAL RESULT]\n${JSON.stringify(result, null, 2)}`;
      return textResult(block);
    }
  );
}
