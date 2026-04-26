import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServiceContainer } from "../container/ServiceContainer.js";
import { textResult } from "./_helpers.js";
import { FlakinessTracker } from "../services/system/FlakinessTracker.js";

/**
 * get_flaky_selectors — surfaces selectors that fail repeatedly across sessions.
 * Reads .TestForge/flakiness-log.json, ranks by fail count.
 * LLM uses this to prioritise permanent locator replacement over per-run healing.
 */
export function registerGetFlakySelectors(server: McpServer, _container: ServiceContainer): void {
  server.registerTool(
    "get_flaky_selectors",
    {
      description: `TRIGGER: Before a new test generation cycle OR after 2+ consecutive self_heal_test calls for the same project.
RETURNS: Selectors ranked by fail count — [{selector, failCount, lastClass, lastSeen}].
WHY: Identifies repeat offenders that need permanent replacement, not per-run healing. Breaks the heal→fail→heal cycle.
NEXT: Replace top selectors via inspect_page_dom + heal_and_verify_atomically → train_on_example to lock the fix.
COST: Low (reads .TestForge/flakiness-log.json, ~50-100 tokens)`,
      inputSchema: z.object({
        projectRoot: z.string().describe("Absolute path to the test project."),
        topN: z.number().optional().describe("How many top flaky selectors to return (default: 10).")
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async (args) => {
      const { projectRoot, topN } = args as { projectRoot: string; topN?: number };
      const limit = topN ?? 10;
      const ranked = await FlakinessTracker.query(projectRoot);

      if (ranked.length === 0) {
        return textResult(
          `[FLAKINESS REPORT] No failure history found for this project.\n` +
          `Either no selector failures have occurred yet, or this is a fresh environment.`
        );
      }

      const top = ranked.slice(0, limit);
      const lines = [
        `[FLAKINESS REPORT] Top ${top.length} flaky selector(s) — ranked by fail count:\n`,
      ];

      for (let i = 0; i < top.length; i++) {
        const s = top[i]!;
        const severity = s.failCount >= 5 ? '🔴' : s.failCount >= 3 ? '🟠' : '🟡';
        lines.push(`${i + 1}. ${severity} [×${s.failCount}] ${s.selector}`);
        lines.push(`   class: ${s.lastClass} | last seen: ${s.lastSeen}`);
      }

      if (ranked.length > limit) {
        lines.push(`\n... and ${ranked.length - limit} more. Pass topN to see more.`);
      }

      lines.push(
        `\n⚡ ACTION: For each 🔴 selector — call inspect_page_dom then heal_and_verify_atomically.\n` +
        `After fix — call train_on_example to permanently record the correct locator.`
      );

      return textResult(lines.join('\n'));
    }
  );
}
