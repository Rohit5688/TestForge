<llm_context id="gemini_flash_testforge_failure_analysis">

<meta>
subject: Gemini 3 Flash live session failure analysis
context: E-commerce 5-page Playwright-BDD test generation
duration: 1h 45m (Human est. 30-45m)
tokens: ~330k
</meta>

<failures_and_root_causes>

1. ENV_MISMATCH_APPFORGE_ON_TESTFORGE:

- trigger: Invoked AppForge mobile tools (`get_token_budget`, `suggest_refactorings`) on Playwright web project. Confused AppForge with a "universal forge".
- result: Server crash (`EOF` and "Cascade has encountered an internal error" during token budget invocation) tracking Appium markers in web DOM.
- impact: Loss of automated linter guardrails -> generated monolithic `EcommercePage` instead of strict per-page POM.

1b. ESM_COMPATIBILITY_CRASH_TESTFORGE:

- trigger: Invoked `setup_project` tool on TestForge MCP server.
- result: Server crash (`ReferenceError: __dirname is not defined`) in `ProjectSetupService.scaffoldMcpConfigReference`.
- impact: Native ESM environment mismatch causing initialization failure before project structure was fully scaffolded.

2. TOKEN_TIME_HEMORRHAGE:

- trigger: Accidental file deletion of working fileset.
- impact: Forced scratch recovery. Cost ~100k tokens / 40m.
- trigger: Exploratory DOM probing via `view_file` & terminal log parsing instead of upfront structural awareness.
- impact: Cost ~40k tokens just to diagnose button casing/geometry.

3. BAD_SYNC_STRATEGY:

- trigger: Defaulted to `networkidle` state on a playground site with active background ad-trackers.
- result: 60s timeout hangs.
- fix: Required pivot to "Content-Based Sync" (waiting for element visibility, not network silence).

4. SELECTOR_SYNTAX_CRASH:

- trigger: Injected Playwright pseudo-selector `:has-text` inside a standard DOM browser-side `querySelector`.
- result: Runtime syntax/evaluation crash. Reverted to Playwright native locator.

5. HABIT_REGRESSION_ANTI_PATTERNS:

- trigger: High-pressure recovery caused LLM to default to standard brittle CSS selectors (`#button-cart`, `.product-layout`).
- impact: Ignored TestForge-idiomatic AOM (Accessibility Object Model) locators (`getByRole`, `getByLabel`), making scripts extremely brittle to UI layout changes.
- trigger: Non-mimetic "human" actions.
- impact: Attempted manual URL link-jumping and JS-clicks instead of real UI tracking. Requires `{ force: true }` clicks to bypass sticky headers/geometric occlusion instead of JS bypass.

6. DYNAMIC_STATE_BLINDNESS:

- trigger: Failed to handle AJAX re-hydration of stock status ("In Stock" vs "Out of Stock").
- impact: LLM implemented a naive "Try-and-Back" loop as a workaround. A real human would never use "Try-and-Back"; they would simply use the existing UI page filters to exclude out-of-stock products. The LLM failed to observe or interact with the page's actual filtering mechanisms.
  </failures_and_root_causes>

<runaway_execution_metrics>
7. RUNAWAY_EXECUTION_LOOP:

- trigger: Tool calls and execution errors were fed back to the LLM without human intervention or safety circuit-breakers.
- impact: The LLM attempted to fix the script blindly multiple times without ever stopping to ask the user for help. Strict retry limits were either missing or not enforced, causing the agent and tools to run "like a headless chicken."
</runaway_execution_metrics>

<system_correctives_required>

- SHADOW_VERSIONING: Need auto-commit/undo-buffer functionality to prevent 100k token rewrites after destructive file ops.
- DEHYDRATED_DOM_VIEWS (Replacing WARM_START_MAPS): Previous theory of pre-generating static DOM blueprints from app code offline is unrealistic and impossible in real-world dynamically rendered apps. The only viable solution for LLM context limits is runtime DOM dehydration (e.g., TestForge's `PageController` converting the live DOM into a stripped-down, numbered `FlatDomTree`). Agents must be forced to use these live, dehydrated views instead of attempting to parse raw page structures.
- OPINIONATED_GEN: Code generators must strip CSS/XPath from context completely; provide only ARIA/AOM candidates.
- SEMANTIC_LINTER: Add `validate_locators` real-time linter to actively block/penalize CSS locators like `.btn-cart`.
- CONTEXT_AWARE_ERRORS: Error boundary should detect timeout on `loadState` and auto-append suggestion to switch to content-based syncing.
  </system_correctives_required>
  </llm_context>
