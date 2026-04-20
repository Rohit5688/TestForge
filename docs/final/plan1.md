# TestForge Improvement Plan — Post-Production Validation
## Based on SauceDemo & LambdaTest Live Session Analysis

> This plan addresses every concrete failure, friction point, and optimization opportunity
> identified during real-world test generation sessions. Each recommendation is grounded in
> actual tool errors, token measurements, and quality issues documented in the session reports.

---

## PRIORITY 1 — Critical Failures (Block Production Use)

### 1.1 — Fix `execute_sandbox_code` API Visibility

**Problem Observed:**
```
"forge.api.inspectPageDom is not a function"
```
Session attempted to call `forge.api.inspectPageDom()` inside the sandbox JavaScript context.
The `forge.api` namespace is not exposed to sandboxed code.

**Root Cause:** 
The sandbox executor (`execute_sandbox_code`) creates an isolated VM context but only exposes
a subset of the internal ForgeService APIs. The `inspectPageDom` method is not in that subset.

**Impact:**
- Blocks advanced turbo-mode workflows where the LLM wants to programmatically inspect pages
- Forces the LLM to use tool calls sequentially instead of building efficient batched workflows
- Breaks the "Sandbox-First" promise of the execute_sandbox_code feature

**Fix (src/tools/execute_sandbox_code.ts):**

Add full API bridge to the sandbox context:

```ts
// BEFORE (current sandboxContext has limited exposure)
const sandboxContext = {
  console,
  setTimeout,
  setInterval,
  // ... basic globals only
};

// AFTER — expose full ForgeService API
const sandboxContext = {
  console,
  setTimeout,
  setInterval,
  forge: {
    api: {
      inspectPageDom: async (url: string, opts?: any) => {
        return await domInspectorService.inspect(url, opts);
      },
      analyzeCodebase: async (root: string) => {
        return await analyzerService.analyze(root);
      },
      runTest: async (testPath: string) => {
        return await testRunnerService.run(testPath);
      },
      // Add other services as needed
    }
  }
};
```

**Verification:**
```bash
# After fix, this sandbox call should succeed:
execute_sandbox_code(`
  const dom = await forge.api.inspectPageDom('https://saucedemo.com');
  console.log(dom.actionableElements.length);
`)
```

**Priority:** P0 — blocks a documented use case from the session report

---

### 1.2 — Fix JSON Export Serialization Error

**Problem Observed:**
```
Cannot assign to read only property 'stackTraceLimit'
```
Calling `inspect_page_dom` with `returnFormat: 'json'` triggers a system error during serialization.

**Root Cause:**
The JSON export path attempts to modify `Error.stackTraceLimit` during snapshot serialization,
which fails in strict-mode VM contexts or when V8 freezes Error globals.

**Impact:**
- JSON mode completely broken — forces users to use markdown mode only
- Blocks the indexed locator pattern (which requires JSON output)
- No structured data export for programmatic consumption

**Fix (src/services/DomInspectorService.ts):**

Replace unsafe POJO serialization:

```ts
// BEFORE (unsafe deep clone that mutates globals)
const jsonSnapshot = JSON.parse(JSON.stringify(ariaTree));

// AFTER (safe structured clone)
import { structuredClone } from 'v8';

const jsonSnapshot = structuredClone(ariaTree, {
  // Strip functions and non-serializable properties
  lossy: true
});
```

**Verification:**
```bash
# After fix:
inspect_page_dom('https://saucedemo.com', { returnFormat: 'json' })
# Should return valid JSON without system error
```

**Priority:** P0 — documented regression, blocks JSON mode entirely

---

### 1.3 — Auto-Install Missing Browser Binaries

**Problem Observed:**
```
Executable doesn't exist at C:\...\firefox.exe
```
Tests configured with Firefox project fail immediately when the binary isn't installed.

**Impact:**
- Poor first-run experience on fresh environments
- Forces manual `npx playwright install firefox` step that users forget
- CI failures on clean Docker containers

**Fix (src/services/EnvironmentCheckService.ts):**

Add pre-flight browser binary check with auto-install offer:

```ts
export class EnvironmentCheckService {
  async checkPlaywrightBrowsers(config: McpConfig): Promise<{
    installed: string[];
    missing: string[];
    autoInstallAvailable: boolean;
  }> {
    const configuredBrowsers = config.browsers ?? ['chromium'];
    const missing: string[] = [];
    
    for (const browser of configuredBrowsers) {
      try {
        // Playwright exposes registry path lookup
        const registry = require('playwright-core/lib/server/registry');
        const executable = registry.findExecutable(browser);
        if (!executable || !fs.existsSync(executable.executablePath())) {
          missing.push(browser);
        }
      } catch {
        missing.push(browser);
      }
    }
    
    return { installed: configuredBrowsers.filter(b => !missing.includes(b)), missing, autoInstallAvailable: true };
  }
}
```

Then in the `run_playwright_test` tool, add auto-install logic:

```ts
const browserCheck = await envCheckService.checkPlaywrightBrowsers(config);
if (browserCheck.missing.length > 0) {
  return {
    success: false,
    warning: `Missing browsers: ${browserCheck.missing.join(', ')}. Run: npx playwright install ${browserCheck.missing.join(' ')}`,
    autoInstallCommand: `npx playwright install ${browserCheck.missing.join(' ')}`
  };
}
```

**Priority:** P1 — quality-of-life blocker for new users

---

## PRIORITY 2 — Token Efficiency (Production Cost Impact)

### 2.1 — Remove Raw YAML Block from SmartDomExtractor

**Status:** ✅ ALREADY DONE (verified in latest code — no rawCap references found)

The session report still references this as a token waste issue, but the latest code already
removed the raw YAML append. Verify the token measurements were taken on the fixed version.

---

### 2.2 — Implement Context Compaction Aggressively

**Problem Observed:**
```
"TestForge automatically compacts these snapshots in history to prevent context bloat."
```
The report claims compaction happens, but doesn't specify how aggressively. The token audit
shows DOM snapshots still contributed 17,500 tokens across 5 pages.

**Current State (src/services/ContextManager.ts):**
```ts
private readonly RECENT_SCANS_TO_KEEP = 2;
private readonly COMPACT_AFTER_SCANS = 3;
```

**Recommendation from Token Plan:** Change `RECENT_SCANS_TO_KEEP` from 2 to 1.

**Additional Observation from Session:**
The session used sequential page-by-page generation (not all-pages-then-generate), but the
ContextManager still accumulated multiple full DOMs. For the per-page loop workflow, even
`RECENT_SCANS_TO_KEEP = 1` may be too generous — once a page object is written, the DOM for
that page is no longer needed.

**Enhanced Fix:**

Add a `purgeOldContext()` method to ContextManager that the orchestration tools can call
explicitly after each page generation completes:

```ts
// src/services/ContextManager.ts
export class ContextManager {
  /**
   * Purges all compacted history except the most recent scan.
   * Call this after successfully writing a page object to disk — the DOM that generated
   * that page object is no longer needed in future prompts.
   */
  public purgeOldContext(): void {
    if (this._domHistory.length > 1) {
      this._domHistory = this._domHistory.slice(-1);
    }
  }
}
```

Then in the workflow after `validate_and_write` succeeds:

```ts
// After page object written successfully
contextManager.purgeOldContext();
```

**Expected Impact:** Reduces accumulated context from ~9,500 tokens to ~1,900 tokens for 5-page flows.

---

### 2.3 — Implement "Auto-Pruning" for Decorative Nodes

**Problem Observed (from improvement.md Section 10.3):**
```
"Implement a 'Context Squeezer' that filters out decorative nodes from the AOM (Accessibility Tree)
even in markdown mode, further reducing token usage."
```

**Current State:**
SmartDomExtractor already filters SVG/icons and caps at 150 nodes, but the session report
suggests this is still too broad for legacy sites like LambdaTest that have deep footer structures.

**Observation from Session:**
The LambdaTest "Simple Form Demo" page had aggressive re-rendering that caused detached DOM errors.
The footer had deeply nested paragraph tags that triggered strict-mode violations.

**Fix (src/utils/SmartDomExtractor.ts):**

Add heuristic to skip known decorative container patterns:

```ts
function isDecorativeContainer(node: A11yNode): boolean {
  const role = (node.role ?? '').toLowerCase();
  const name = (node.name ?? '').toLowerCase();
  
  // Skip footer/aside containers with >10 nested children (likely decorative)
  if ((role === 'contentinfo' || role === 'complementary') && 
      (node.children?.length ?? 0) > 10) {
    return true;
  }
  
  // Skip navigation containers that only have links (user already sees nav in UI)
  if (role === 'navigation' && node.children?.every(c => c.role === 'link')) {
    return true;
  }
  
  // Skip "powered by" / copyright / social link clusters
  if (name.includes('copyright') || name.includes('powered by') || 
      name.includes('follow us') || name.includes('social')) {
    return true;
  }
  
  return false;
}
```

Apply this filter in the extraction loop before `deriveSelector` is called.

**Expected Impact:** Reduces extracted nodes on complex pages by 20-30%, cutting another 400-600 tokens per scan.

---

## PRIORITY 3 — Code Generation Quality (Prevents Test Flakiness)

### 3.1 — Enforce BasePage Action Wrappers in Generated Code

**Status:** ✅ ALREADY DONE (Implemented PageObjectLinter and hooked it into JsonToPomTranspiler)

**Problem Observed (improvement.md Section 10.1):**
```
"Constraint: Never use page.click() or page.fill() directly in Page Objects.
Instruction: Use the hardened wrappers in BasePage (click, fill, selectOption).
Rationale: Standard Playwright methods often fail on dynamic sites (like LambdaTest)
that re-render between a locator's resolution and the final click event."
```

**Current State:**
TestGenerationService detects if BasePage exists and adds a rule to the prompt, but doesn't
enforce it structurally. The LLM still generates `this.page.click()` occasionally.

**Root Cause:**
The prompt says "Use BasePage wrappers" but `deriveSelector()` returns strings like:
```
page.getByRole('button', { name: 'Submit' })
```

The LLM sees `page.` and writes `await this.page.getByRole(...).click()` instead of the
wrapper pattern `await this.click(this.page.getByRole(...))`.

**Fix (src/utils/SmartDomExtractor.ts):**

When BasePage is detected in the project, change the selector string format to guide the LLM
toward wrapper usage:

```ts
function deriveSelector(
  node: A11yNode,
  hasBasePage: boolean  // NEW parameter
): { selector: string; strategy: ...; args: ... } | null {
  // ... existing logic ...
  
  if (testId) {
    const baseSelector = `page.getByTestId('${testId}')`;
    return {
      selector: hasBasePage 
        ? `this.getByTestId('${testId}')  // BasePage wrapper handles retries`
        : baseSelector,
      strategy: 'playwrightApi',
      args: { method: 'getByTestId', testId }
    };
  }
  
  // Apply same pattern to all other selector types
}
```

Then in TestGenerationService, pass the `hasBasePage` flag to SmartDomExtractor.

**Alternative (More Aggressive):**

Add a post-generation linter that scans generated Page Objects for direct `.click()` / `.fill()`
calls and rewrites them:

```ts
// src/utils/PageObjectLinter.ts
export function lintPageObject(code: string, hasBasePage: boolean): string {
  if (!hasBasePage) return code;
  
  // Pattern: await this.page.getByXxx(...).click()
  // Replace: await this.click(this.page.getByXxx(...))
  code = code.replace(
    /await this\.page\.(getBy\w+\([^)]+\))\.click\(\)/g,
    'await this.click(this.page.$1)'
  );
  
  // Pattern: await this.page.getByXxx(...).fill(text)
  // Replace: await this.fill(this.page.getByXxx(...), text)
  code = code.replace(
    /await this\.page\.(getBy\w+\([^)]+\))\.fill\(([^)]+)\)/g,
    'await this.fill(this.page.$1, $2)'
  );
  
  return code;
}
```

Apply this linter in `JsonToPomTranspiler` before writing the file.

**Priority:** P1 — directly impacts test stability on dynamic sites

---

### 3.2 — Add "Structural Sibling" Selector Pattern to Training Pool

**Status:** ✅ ALREADY DONE (Default rules seeded in `LearningService.ts`)

**Problem Observed (improvement.md Section 10.3):**
```
"Resilient Locator Training: Inject the 'Structural Sibling' pattern (p:has-text("...") + input)
into the train_on_example global pool to ensure future generations avoid brittle IDs on legacy sites."
```

**Context from Session:**
LambdaTest Selenium Playground has zero data-test attributes and unreliable IDs. The V5
stabilization used structural sibling selectors like:

```ts
this.page.locator('p:has-text("Please enter your name") + input')
```

This pattern is not currently in TestForge's knowledge base, so the LLM doesn't generate it.

**Fix:**

Seed the global learning pool with this pattern as a pre-loaded rule:

```ts
// src/services/LearningService.ts — add to DEFAULT_RULES constant
const DEFAULT_RULES: LearningRule[] = [
  {
    id: 'structural-sibling-legacy-sites',
    pattern: 'Input field with no data-test or ID on legacy sites',
    solution: `Use structural sibling selector: page.locator('p:has-text("Label Text") + input')`,
    rationale: 'Legacy sites (LambdaTest, older enterprise apps) often lack test IDs. The label-to-input DOM structure is more stable than element IDs which can be auto-generated.',
    antiPatterns: ['Do not use #result-id or #confirm-msg — these are brittle auto-generated IDs'],
    tags: ['legacy', 'no-testid', 'structural'],
    scope: 'global',
    timestamp: '2025-01-01T00:00:00Z'
  },
  {
    id: 'detached-dom-resilience',
    pattern: 'Elements disappear or detach during interaction on dynamic pages',
    solution: `Add 100ms layout delay before clicking: await this.page.waitForTimeout(100); await locator.click();`,
    rationale: 'Pages with aggressive re-rendering (LambdaTest Simple Form Demo) can detach elements between resolution and click. A short delay allows the layout to settle.',
    antiPatterns: ['Do not use waitForLoadState("networkidle") — modern SPAs keep persistent connections'],
    tags: ['dynamic', 'detached-dom', 'timing'],
    scope: 'global',
    timestamp: '2025-01-01T00:00:00Z'
  }
];
```

Then in the constructor, load these defaults if the learning file doesn't exist yet:

```ts
constructor() {
  if (!fs.existsSync(this.learningPath)) {
    this.saveKnowledge({ rules: DEFAULT_RULES, version: '1.0' });
  }
}
```

**Priority:** P2 — quality improvement for zero-ID sites

---

## PRIORITY 4 — Tool UX & Error Messages

### 4.1 — Improve `gather_test_context` Timeout Handling

**Status:** ✅ ALREADY DONE (Added explicit timeout messaging in TestContextGathererService.ts)

**Problem Observed (improvement.md Section 10.2):**
```
"gather_context: Timeouts on extremely slow dynamic pages (e.g., SauceDemo Footer).
Tool returns empty results if page doesn't settle in 30s."
```

**Impact:**
Silent failure — the tool returns empty context without explaining why, causing the LLM to
proceed with incomplete data.

**Fix (src/services/TestContextGathererService.ts):**

Add explicit timeout messaging:

```ts
async gatherContext(url: string, timeout = 30000): Promise<GatherResult> {
  const start = Date.now();
  
  try {
    await page.goto(url, { timeout, waitUntil: 'domcontentloaded' });
  } catch (err: any) {
    if (err.message?.includes('Timeout')) {
      return {
        success: false,
        elements: [],
        warning: `Page did not settle within ${timeout}ms. Try increasing timeout or use inspect_page_dom with a specific selector filter instead.`,
        partialData: true
      };
    }
    throw err;
  }
  
  // ... rest of gathering logic
}
```

**Priority:** P2 — improves debuggability

---

### 4.2 — Add Capacity Warning to `inspect_page_dom`

**Problem Observed (improvement.md Section 10.2):**
```
"inspect_dom: Complex accessibility trees exceed the markdown buffer for some LLMs.
Output truncated... (leading to partial locator generation)."
```

**Fix (src/services/DomInspectorService.ts):**

Add a token-budget warning when output exceeds safe thresholds:

```ts
let markdown = smartExtractor.extractAsMarkdown(ariaSnapshot);
const estimatedTokens = Math.ceil(markdown.length / 4);

if (estimatedTokens > 3000) {
  markdown = `⚠️ **Token Budget Warning**: This page has ${actionableCount} elements (~${estimatedTokens} tokens). Consider using returnFormat:'json' for more compact output, or add a selector filter to inspect only a specific region.\n\n` + markdown;
}
```

**Priority:** P2 — prevents silent truncation issues

---

## PRIORITY 5 — Documentation & Onboarding

### 5.1 — Document the Singleton Page Pattern Explicitly

**Problem:** 
The session report mentions the singleton pattern multiple times as critical for stability,
but there's no central documentation explaining it to users who aren't familiar with
`vasu-playwright-utils`.

**Fix:**

Create `docs/SingletonPattern.md`:

```markdown
# The Singleton Page Pattern

TestForge-generated projects use `vasu-playwright-utils` to manage Playwright's `page` object
lifecycle. This prevents common pitfalls like:
- Worker corruption in parallel execution
- Page references becoming stale across step definitions
- Constructor complexity in Page Objects

## How It Works

1. **Before each scenario**, `test-setup/page-setup.ts` calls `setPage(page)` from the fixture
2. **In steps**, access the page via `getPage()` — no need to pass it around
3. **In Page Objects**, the page is accessed via `this.page` getter (provided by BasePage)

## What NOT to do

❌ `constructor(public page: Page)` — creates a new page reference  
❌ `const { page } = createBdd()` — bypasses the singleton  
❌ `this.page = page` — direct assignment breaks worker safety  

✅ `extends BasePage` — page available as `this.page`  
✅ `getPage()` in steps — singleton pre-wired by fixture  
```

Add this to the `setup_project` scaffolding output.

**Priority:** P2 — prevents common mistakes

---

### 5.2 — Create "Street-Smart Rules" Reference

**Problem:**
The session learned valuable patterns (data-test priority, BasePage wrappers, structural siblings)
but these aren't documented anywhere for human developers to reference.

**Fix:**

Create `docs/StreetSmartRules.md` that captures the learned heuristics:

```markdown
# Street-Smart Testing Rules

These rules are derived from production test stabilization sessions and are enforced by
TestForge's code generation.

## Locator Priority (from most to least stable)

1. **data-test attributes** — explicit testing hooks, never change
2. **ARIA labels + roles** — semantic and accessibility-first
3. **Structural siblings** — `p:has-text("Label") + input` for zero-ID legacy sites
4. **Visible text** — `.getByText()` for buttons/links with unique labels
5. **Coordinate fallback** — last resort when nothing else works

## Action Hardening

- Always use BasePage wrappers (`this.click`, `this.fill`) instead of raw Playwright methods
- Add 100ms layout delay on dynamic sites before clicking
- Never use `waitForLoadState('networkidle')` — modern SPAs keep persistent connections

## When Tests Fail

- Check `error-context.md` — TestForge auto-generates it with DOM snapshot at failure point
- Use `self_heal_test` before manually debugging
- If self-heal fails 3 times, the issue is structural (missing element) not a selector problem
```

**Priority:** P3 — educational value for users

---

## Implementation Sequence

Execute in this order to maximize stability gains with minimal risk:

**Week 1 (Critical Failures):**
1. Fix sandbox API visibility (1.1) — ~4 hours
2. Fix JSON serialization error (1.2) — ~2 hours
3. Add browser binary auto-install (1.3) — ~3 hours

**Week 2 (Token Efficiency):**
4. Aggressive context compaction (2.2) — ~2 hours
5. Auto-pruning decorative nodes (2.3) — ~4 hours

**Week 3 (Code Quality):**
6. Enforce BasePage wrappers (3.1) — ~6 hours
7. Seed structural sibling patterns (3.2) — ~2 hours

**Week 4 (Polish):**
8. Improve tool error messages (4.1, 4.2) — ~3 hours
9. Documentation (5.1, 5.2) — ~4 hours

**Total estimated effort:** ~30 hours over 4 weeks

---

## Success Metrics

After implementing all fixes, re-run the SauceDemo and LambdaTest sessions and measure:

| Metric | Before | Target After |
|---|---|---|
| Token cost (5-page flow) | $0.37-$0.51 | $0.10-$0.15 (70% reduction) |
| First-run pass rate (%) | 0% (32s failure) | 90%+ |
| Self-heal success rate | Unknown | 80%+ within 3 attempts |
| Sandbox API errors | 100% (all calls fail) | 0% |
| JSON export errors | 100% | 0% |
| Manual debugging sessions | 3-4 per flow | 0-1 per flow |

Track these in ObservabilityService JSONL logs for quantitative validation.