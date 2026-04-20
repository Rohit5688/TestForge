/**
 * SelfHealingService
 *
 * Architecture: The service is purely a "classifier and prompt builder".
 * It does NOT modify any files itself. Instead, it analyses the terminal failure
 * output returned by TestRunnerService, classifies the root-cause, and returns a
 * rich instruction block that lets the Client LLM know EXACTLY what to fix.
 *
 * Classification Strategy:
 *   SCRIPTING_FAILURE  - Locator not found, timeout on element, TypeScript compile error
 *   APPLICATION_FAILURE - Assertion on value mismatch (e.g. wrong text, wrong URL)
 *   UNKNOWN            - Anything else (network, auth, flaky infra)
 */

export type FailureKind = 'SCRIPTING_FAILURE' | 'SYNCHRONIZATION_FAILURE' | 'APPLICATION_FAILURE' | 'AD_INTERCEPTED_FAILURE' | 'UNKNOWN';

export interface HealingAnalysis {
  kind: FailureKind;
  canAutoHeal: boolean;
  failedLocators: string[];
  failedFiles: string[];
  failedLines: string[];
  rawError: string;
  healInstruction: string;
}

import { ObservabilityService } from '../analysis/ObservabilityService.js';
import { DnaTrackerService } from './DnaTrackerService.js';
import { LearningService } from '../system/LearningService.js';
import { ExtensionLoader } from '../../utils/ExtensionLoader.js';

export class SelfHealingService {
  private attemptCount: Map<string, number> = new Map();
  private readonly dnaTracker: DnaTrackerService;
  private readonly learner: LearningService;

  constructor(dnaTracker?: DnaTrackerService, learner?: LearningService) {
    this.dnaTracker = dnaTracker || new DnaTrackerService();
    this.learner = learner || new LearningService();
  }

  /** Patterns that strongly indicate a scripting / locator problem (not an app bug). */
  private readonly SCRIPTING_PATTERNS = [
    /element\(s\) not found/i,
    /locator\..*\.first\(\)/i,
    /waiting for getByRole/i,
    /waiting for locator/i,
    /Cannot find module/i,
    /error TS\d+/i,
    /toBeVisible.*failed/i,
    /SyntaxError/i,
  ];

  /** 
   * Item 13: Patterns for ads, popups or overlays blocking the UI.
   * Playwright often throws "click intercepted" errors for these.
   */
  private readonly AD_INTERCEPTED_PATTERNS = [
    /click intercepted/i,
    /is being covered by another element/i,
    /element is not clickable at point/i,
    /pointer-events: none/i,
  ];

  /**
   * Synchronization failures: the locator resolved and the action completed,
   * but the DOM state was read before the UI could reflect the change.
   * Classic causes: rich text editor iframes, debounced state updates, React re-renders.
   */
  private readonly SYNC_PATTERNS = [
    /Timeout.*exceeded/i,
    /unexpected value.*\\n[\t ]+\\n/i,   // received only whitespace
    /Received string.*\+\s*\d+/is,       // received string has many lines of whitespace
    /unexpected value "[\t\s]+"/i,
    /locator resolved to.*but.*unexpected value/is,
    /waiting for.*toContainText/i,
    /waiting for.*toHaveText/i,
  ];

  /** Patterns that indicate the app returned unexpected data (not a locator guess). */
  private readonly APP_FAILURE_PATTERNS = [
    /Expected.*Received/i,
    /toContainText.*failed/i,
    /toHaveText.*failed/i,
    /toHaveURL.*failed/i,
    /AssertionError/i,
  ];

  public analyzeFailure(testOutput: string, memoryPrompt: string = '', contextId: string = 'default', projectRoot?: string): HealingAnalysis {
    const attempts = (this.attemptCount.get(contextId) ?? 0) + 1;
    this.attemptCount.set(contextId, attempts);

    if (attempts > 3) {
      ObservabilityService.getInstance().warning(contextId === 'default' ? undefined : contextId, 'MAX_HEAL_ATTEMPTS_REACHED', { contextId, attempts });
      return {
        kind: 'UNKNOWN',
        canAutoHeal: false,
        failedLocators: [],
        failedFiles: [],
        failedLines: [],
        rawError: testOutput,
        healInstruction: `MAX_HEAL_ATTEMPTS_REACHED: You have attempted to self-heal this test ${attempts} times without success. Please call request_user_clarification to ask the user for help.`
      };
    }

    const kind = this.classifyFailure(testOutput);
    const failedLocators = this.extractFailedLocators(testOutput);
    const failedFiles = this.extractFailedFiles(testOutput);
    const failedLines = this.extractFailedLines(testOutput);

    // TASK-61: DNA Tracker — attempt LCS near-match BEFORE LLM fallback
    let dnaHint = '';
    if (projectRoot && failedLocators.length > 0) {
      for (const loc of failedLocators) {
        const dnaResult = this.dnaTracker.findNearMatch(projectRoot, loc);
        if (dnaResult.found && dnaResult.bestCandidate) {
          const best = dnaResult.bestCandidate;
          dnaHint += `\n\n[DNA TRACKER — Heuristic Near-Match (confidence: ${(dnaResult.confidence * 100).toFixed(0)}%)]`
            + `\n  Failed: ${loc}`
            + `\n  Best match from DNA store: "${best.selector}"`
            + `\n  Tag: ${best.tag}, ID: "${best.id}", Text: "${best.text}"`
            + `\n  Last seen: ${best.lastSeen}`
            + `\n  Action: Try replacing the failed locator with "${best.selector}" before doing a full DOM re-inspection.`;
          ObservabilityService.getInstance().warning(undefined, 'dna_near_match', { failed: loc, match: best.selector, confidence: dnaResult.confidence });
        }
      }
    }

    if (projectRoot) memoryPrompt += ExtensionLoader.loadExtensionsForPrompt(projectRoot);
    const canAutoHeal = kind === 'SCRIPTING_FAILURE' || kind === 'SYNCHRONIZATION_FAILURE' || kind === 'AD_INTERCEPTED_FAILURE';
    const healInstruction = this.buildHealInstruction(kind, failedLocators, failedFiles, failedLines, testOutput, memoryPrompt) + dnaHint;

    return { kind, canAutoHeal, failedLocators, failedFiles, failedLines, rawError: testOutput, healInstruction };
  }

  public resetAttempts(contextId: string = 'default'): void {
    this.attemptCount.delete(contextId);
  }

  /**
   * TASK-41: Called on successful heal. Auto-learns the fix into mcp-learning.json
   * and increments DNA heal counter for the repaired selector.
   */
  public notifyHealSuccess(
    projectRoot: string,
    failedSelector: string,
    fixedSelector: string,
    contextId: string = 'default'
  ): void {
    if (!projectRoot) return;
    try {
      // Auto-learn the fix
      this.learner.learn(
        projectRoot,
        `Locator failed: ${failedSelector}`,
        `Replaced with: ${fixedSelector}`,
        ['auto-heal', 'locator']
      );
      // Update DNA heal count for the successful selector
      this.dnaTracker.recordSuccessfulHeal(projectRoot, fixedSelector);
      // Reset attempt counter so future failures start fresh
      this.resetAttempts(contextId);
      ObservabilityService.getInstance().warning(undefined, 'auto_learn_success', { failedSelector, fixedSelector });
    } catch (err) {
      // Non-fatal — log but do not throw
      ObservabilityService.getInstance().warning(undefined, 'auto_learn_failed', { error: String(err) });
    }
  }

  private classifyFailure(output: string): FailureKind {
    // Check AD INTERCEPTION first as it's a specific blocker
    for (const pattern of this.AD_INTERCEPTED_PATTERNS) {
      if (pattern.test(output)) return 'AD_INTERCEPTED_FAILURE';
    }
    // Check synchronization FIRST because it can co-occur with toContainText patterns
    for (const pattern of this.SYNC_PATTERNS) {
      if (pattern.test(output)) return 'SYNCHRONIZATION_FAILURE';
    }
    for (const pattern of this.SCRIPTING_PATTERNS) {
      if (pattern.test(output)) return 'SCRIPTING_FAILURE';
    }
    for (const pattern of this.APP_FAILURE_PATTERNS) {
      if (pattern.test(output)) return 'APPLICATION_FAILURE';
    }
    return 'UNKNOWN';
  }

  private extractFailedLocators(output: string): string[] {
    const locators: string[] = [];
    // Match Playwright locator expressions like: getByRole('link', { name: 'HTMLEditor' })
    const locatorRegex = /Locator:\s+(.+)/g;
    let match;
    while ((match = locatorRegex.exec(output)) !== null) {
      if (match[1]) locators.push(match[1].trim());
    }
    return [...new Set(locators)];
  }

  private extractFailedFiles(output: string): string[] {
    const files: string[] = [];
    // Match paths like "at AjaxToolkitPage.navigateToHTMLEditor (C:\...\AjaxToolkitPage.ts:9:34)"
    const fileRegex = /\(([A-Za-z]:\\[^\s:)]+\.ts):\d+:\d+\)/g;
    let match;
    while ((match = fileRegex.exec(output)) !== null) {
      if (match[1]) files.push(match[1]);
    }
    return [...new Set(files)];
  }

  private extractFailedLines(output: string): string[] {
    const lines: string[] = [];
    // Match lines with ">" indicating the actual failing code line
    const lineRegex = />\s+\d+ \|\s+(.+)/g;
    let match;
    while ((match = lineRegex.exec(output)) !== null) {
      if (match[1]) lines.push(match[1].trim());
    }
    return [...new Set(lines)];
  }

  private buildHealInstruction(
    kind: FailureKind,
    failedLocators: string[],
    failedFiles: string[],
    failedLines: string[],
    rawError: string,
    memoryPrompt: string
  ): string {
    if (kind === 'AD_INTERCEPTED_FAILURE') {
      return `[SELF-HEALING INSTRUCTION: UI INTERCEPTION / POPUP DETECTED]
The test tried to interact with an element, but another element (likely an ad, popup, or overlay) intercepted the action.

Item 13 Fix Strategy:
  1. Call inspect_page_dom with includeIframes: true.
  2. Search the AOM for elements with roles like 'dialog', 'alert', or generic <div>/<a> that cover the viewport.
  3. Common Ad/Popup selectors: \`[aria-label="Close"]\`, \`button.close\`, \`.modal-close\`, \`#ad-overlay\`.
  4. In your Page Object, add a "Close Popup" helper or a \`beforeAction\` hook that checks if an interceptor is visible and clicks it.
  5. Use Rule 23: Ensure every interaction that might be blocked has a guard or an automatic retry with a "Check for Popups" first.

Failed interaction details:
${failedLines.map(l => `  > ${l}`).join('\n')}
${failedLocators.map(l => `  - Intercepted Locator: ${l}`).join('\n')}\n`;
    }

    if (kind === 'SYNCHRONIZATION_FAILURE') {
      return `[SELF-HEALING INSTRUCTION: SYNCHRONIZATION FAILURE DETECTED]
The test action COMPLETED (the locator was found and the interaction ran), but the DOM assertion
read stale/empty state before the UI could update. This is a race condition or synchronization issue.

Common Causes:
  1. Rich text editors (TinyMCE, CKEditor, DevExpress HtmlEditor) use an inner <iframe> body
     or a <div contenteditable> that Playwright keyboard.type() events don't always reach.
  2. React/Angular state debouncing: the component updates asynchronously after keyboard input.
  3. You are asserting the OUTER WRAPPER element instead of the INNER editable element.

Step-by-step Fix Strategy:
  1. Call inspect_page_dom with includeIframes: true on the target URL.
     The visual DOM tree will reveal the actual structure inside the editor component.
  2. Look for: <iframe> body elements, <div role="textbox">, <div contenteditable="true">,
     or any element with aria roles like 'document' or 'textbox' inside the editor container.
  3. In the Page Object method that types into the editor:
     a. Instead of locating the outer TD/DIV wrapper, locate the INNER contenteditable element.
     b. Use: const editor = this.page.frameLocator('iframe.editor-frame').locator('[contenteditable]');
     c. After typing, add a small wait: await this.page.waitForTimeout(300) or
        await expect(editor).not.toBeEmpty() before making the final assertion.
  4. For the assertion, assert on the inner element, not the outer container.

Failing code for context:
${failedLines.map(l => `  > ${l}`).join('\n')}

Failed locators:
${failedLocators.map(l => `  - ${l}`).join('\n')}\n`;
    }

    if (kind === 'APPLICATION_FAILURE') {
      return `[SELF-HEALING BLOCKED: APPLICATION FAILURE DETECTED]
The test failure is due to the application returning unexpected data, not a scripting error.
This requires a human to investigate the application behaviour.

Failed assertion details:
${rawError.substring(0, 800)}

Recommended action: Do NOT modify Page Objects or locators. Investigate the application state.`;
    }

    if (kind === 'SCRIPTING_FAILURE') {
      const locatorSection = failedLocators.length > 0
        ? `Failed Locators (these need to be replaced with correct selectors from the live DOM):\n${failedLocators.map(l => `  - ${l}`).join('\n')}`
        : 'No specific locator was identified.';

      const fileSection = failedFiles.length > 0
        ? `Affected Page Object Files:\n${failedFiles.map(f => `  - ${f}`).join('\n')}`
        : '';

      const codeSection = failedLines.length > 0
        ? `Failing Code Lines:\n${failedLines.map(l => `  > ${l}`).join('\n')}`
        : '';

      return `[SELF-HEALING INSTRUCTION: SCRIPTING FAILURE DETECTED]
The test failure was caused by a SCRIPTING error (bad locator / wrong selector / timing issue).
This is safe to auto-heal. Follow these steps:

STEP 1 - Re-inspect the live page DOM using the inspect_page_dom tool:
  Call inspect_page_dom with the exact URL the test navigates to.
  This will give you the real-time Accessibility Tree of the live page.

STEP 2 - Identify the correct locator from the AOM output:
  The following locators failed and need to be corrected:
${locatorSection}

${fileSection}
${codeSection}

${memoryPrompt}

STEP 3 - Update the Page Object file with the corrected locator:
  Replace the failing locator in the POM method with the new, verified selector.
  Keep all Rule-7 web-first assertions in place. Only change the locator value.

STEP 4 - Re-run the test using run_playwright_test to confirm the fix.

Raw failure output for context:
${rawError.substring(0, 600)}`;
    }

    return `[SELF-HEALING: UNKNOWN FAILURE]
The failure could not be automatically classified.
Raw output:
${rawError.substring(0, 600)}`;
  }
}
