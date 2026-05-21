import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServiceContainer } from "../container/ServiceContainer.js";
import { textResult, truncate } from "./_helpers.js";
import type { SelfHealingService } from "../services/execution/SelfHealingService.js";
import { LastResultStore } from "../services/system/LastResultStore.js";
import { FlakinessTracker } from "../services/system/FlakinessTracker.js";
import type { DomInspectorService } from "../services/dom/DomInspectorService.js";
import type { PlaywrightSessionService } from "../services/execution/PlaywrightSessionService.js";
import * as fs from "fs/promises";
import * as path from "path";

/** Greps all .ts step/page files for a selector string. Returns files + lines that contain it. */
async function findSelectorRipple(
  projectRoot: string,
  failedLocators: string[]
): Promise<string> {
  if (failedLocators.length === 0) return '';
  const searchDirs = ['step-definitions', 'steps', 'pages', 'page-objects'];
  const matches: string[] = [];

  for (const dir of searchDirs) {
    const dirPath = path.join(projectRoot, dir);
    let files: string[] = [];
    try { files = await fs.readdir(dirPath); } catch { continue; }

    for (const fname of files) {
      if (!fname.endsWith('.ts') && !fname.endsWith('.js')) continue;
      const fullPath = path.join(dirPath, fname);
      const content = await fs.readFile(fullPath, 'utf8').catch(() => '');
      const lines = content.split(/\r?\n/);

      for (const locator of failedLocators) {
        // Strip Playwright wrapper: extract just the inner selector string
        const inner = locator.replace(/^getBy\w+\((['"`])(.*?)\1.*\)$/, '$2') || locator;
        for (let i = 0; i < lines.length; i++) {
          if (lines[i]!.includes(inner)) {
            matches.push(`  ${path.join(dir, fname)}:${i + 1} → ${lines[i]!.trim().slice(0, 80)}`);
          }
        }
      }
    }
  }

  if (matches.length === 0) return '';
  return `\n[RIPPLE AUDIT] Failing selector(s) found in ${matches.length} other location(s):\n${matches.join('\n')}\n⚠️ Fix ALL of the above after healing the primary failure — same selector, same break.`;
}

export function registerSelfHealTest(server: McpServer, container: ServiceContainer) {
  const healer = container.resolve<SelfHealingService>("healer");
  const domInspector = container.resolve<DomInspectorService>("domInspector");
  const sessionService = container.resolve<PlaywrightSessionService>("session");

  server.registerTool(
    "self_heal_test",
    {
      description: `TRIGGER: After a run_playwright_test fails.
RETURNS: Targeted heal instruction — exact locator to fix, whether it's a scripting or app issue, how to re-inspect the live DOM. Also returns [RIPPLE AUDIT] listing all other files using the same broken selector.
NEXT: If scripting issue → Call verify_selector with candidate | If app issue → Report to team.
COST: Low (~100-300 tokens)
ERROR_HANDLING: Standard

Analyzes Playwright Error DNA to determine if it's a SCRIPTING issue or an APPLICATION issue.

OUTPUT: Ack (<= 10 words), proceed.`,
      inputSchema: z.object({
        // errorDna is optional — when omitted, auto-injected from LastResultStore (last run_playwright_test
        // result for this projectRoot). Provide manually only when auto-inject is unavailable or stale.
        "errorDna": z.object({
          "code": z.enum(["Infrastructure", "Logic", "Transient"]),
          "causalChain": z.string(),
          "originalError": z.string(),
          "reason": z.string()
        }).optional().describe("Structured Error DNA from run_playwright_test. Omit to auto-load from last run (if <10 min old)."),
        "projectRoot": z.string().optional().describe("Absolute path to the automation project. Required for auto-inject and ripple audit."),
        "pageUrl": z.string().optional().describe("URL of the page under test. When provided, the healer re-inspects live DOM for fresh selectors.")
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    async (args) => {
      const { errorDna, projectRoot, pageUrl } = args as any;

      // P8: Auto-inject from last run if errorDna not manually supplied
      let resolvedErrorDna = errorDna;
      let autoInjected = false;
      if (!resolvedErrorDna && projectRoot) {
        const store = LastResultStore.getInstance();
        const lastRun = store.read(projectRoot);
        const ageS = store.ageSeconds(projectRoot);
        if (lastRun && !lastRun.passed && ageS !== null && ageS < 600) {
          resolvedErrorDna = {
            code: 'Infrastructure',
            causalChain: lastRun.failureClass ?? 'unknown',
            originalError: lastRun.output.slice(0, 4000),
            reason: `Auto-injected from last run (${ageS}s ago). class: ${lastRun.failureClass ?? 'unknown'}`
          };
          autoInjected = true;
        }
      }

      // Gap-7: auto re-inspect live DOM when pageUrl provided
      // Gap-P2: if no active session, auto-start one via navigateTo (which calls startSession internally)
      let freshDomContext = '';
      let domReinspectError = '';
      if (pageUrl && pageUrl !== 'unknown') {
        try {
          let activePage = sessionService.getPage();
          if (!activePage) {
            // Auto-start session + navigate — navigateTo() calls startSession() if page is null
            await sessionService.navigate(pageUrl);
            activePage = sessionService.getPage();
          }
          if (activePage) {
            freshDomContext = await domInspector.inspect(
              pageUrl, undefined, undefined, undefined, undefined,
              15000, false, 'yaml', projectRoot ?? undefined, undefined, activePage
            );
          } else {
            domReinspectError = 'Session navigation completed but getPage() still returned null.';
          }
        } catch (e) {
          // Surface the real reason — not a silent black hole
          domReinspectError = e instanceof Error ? e.message.slice(0, 120) : String(e).slice(0, 120);
        }
      }

      const rawError = resolvedErrorDna?.originalError || JSON.stringify(resolvedErrorDna || {});
      const result = healer.analyzeFailure(rawError, freshDomContext || '', 'default', projectRoot);

      // P6: Record selector failures to FlakinessTracker
      if (projectRoot && result.failedLocators?.length > 0) {
        FlakinessTracker.record(
          projectRoot,
          result.failedLocators,
          pageUrl ?? 'unknown',
          resolvedErrorDna?.causalChain ?? 'selector'
        ).catch(() => { /* non-critical — never block heal on tracker write */ });
      }

      // Ripple audit — find same selectors in other files
      let rippleBlock = '';
      if (projectRoot && result.failedLocators?.length > 0) {
        rippleBlock = await findSelectorRipple(projectRoot, result.failedLocators);
      }

      const autoNote = autoInjected
        ? `\n[AUTO-INJECT] errorDna loaded from last run_playwright_test result — no manual copy needed.\n`
        : '';
      const domNote = freshDomContext
        ? `\n[AUTO-DOM] Live DOM re-inspected from ${pageUrl} — fresh selectors included in analysis.\n`
        : domReinspectError
          ? `\n[AUTO-DOM FAILED] Could not re-inspect DOM at ${pageUrl}: ${domReinspectError}\nHeal continues with error context only — selectors may be stale.\n`
          : '';

      // Fix-1: Hard stop signal when max attempts exhausted
      if (result.healInstruction?.startsWith('MAX_HEAL_ATTEMPTS_REACHED')) {
        return textResult(
          `[HALT] ⛔ MAX HEALING ATTEMPTS REACHED\n` +
          `You have called self_heal_test 3+ times on this failure without resolving it.\n` +
          `MANDATORY NEXT STEP: Call request_user_clarification immediately.\n` +
          `DO NOT call self_heal_test, run_playwright_test, or validate_and_write again until the user responds.\n\n` +
          `Failure summary:\n${result.rawError?.slice(0, 500) ?? '(no raw error captured)'}`
        );
      }

      return textResult(autoNote + domNote + JSON.stringify(result, null, 2) + rippleBlock);
    }
  );
}
