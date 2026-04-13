# 🧪 TestForge — End-to-End Testing Guide

This guide walks you through testing every feature of TestForge as an end user.

---

## Prerequisites

1. **Build the server**: `npm run build`
2. **Add to your MCP client config**:
```json
{
  "mcpServers": {
    "testforge": {
      "command": "node",
      "args": ["/absolute/path/to/TestForge/build/index.js"]
    }
  }
}
```
3. **Restart your IDE** to pick up the new server.

---

## Test 1: Project Setup (`setup_project`)

**Prompt:**
> "Set up a new Playwright-BDD project at `/path/to/my-new-project`"

**Expected:** Creates `features/`, `pages/`, `step-definitions/`, installs npm packages, generates config files.

## Test 2: Codebase Analysis (`analyze_codebase`)

**Prompt:**
> "Analyze the codebase at `/path/to/my-project`"

**Expected:** Returns JSON with detected features, step definitions, and Page Objects.

## Test 3: Test Generation (`generate_gherkin_pom_test_suite`)

**Prompt:**
> "Generate a BDD test for the login page at https://www.saucedemo.com. The test should verify valid login. Project root: `/path/to/project`"

**Expected:** Returns system prompt; AI generates `.feature` file, step definitions, and Page Object.

## Test 4: DOM Inspection (`inspect_page_dom`)

**Prompt:**
> "Inspect the page at https://www.saucedemo.com to find exact login form locators"

**Expected:** Returns the Accessibility Tree with roles, names, and test IDs.

## Test 5: Validate & Write (`validate_and_write`)

**Prompt:**
> "Write the generated test files to disk and run them"

**Expected:** Files validated, written, tests executed. Self-healing activates on failure (up to 3 attempts).

## Test 6: Dry Run (`validate_and_write` with `dryRun: true`)

**Prompt:**
> "Do a dry run preview of the generated files before writing"

**Expected:** Files validated but NOT written. Shows proposed file list and any secret audit warnings.

## Test 7: Run Tests (`run_playwright_test`)

**Prompt:**
> "Run all Playwright tests in my project"

**Expected:** Executes `npx bddgen && npx playwright test` and returns terminal output.

## Test 8: Self-Healing (`self_heal_test`)

**Prompt (after failure):**
> "Analyze this test failure and suggest fixes: [paste error output]"

**Expected:** Classifies failure as SCRIPTING or APPLICATION issue. Returns targeted fix instructions.

## Test 9: Environment Management (`manage_env`)

**Prompt:**
> "Show me the current .env keys for my project"

**Expected:** Lists all environment variable keys. Supports `read`, `write`, `scaffold`.

## Test 10: Configuration (`manage_config`)

**Prompt:**
> "Show me the current mcp-config.json settings"

**Expected:** Displays browser list, timeout, auth strategy, tags.

## Test 11: User Management (`manage_users`)

**Prompt:**
> "List all test user roles for the staging environment"

**Expected:** Shows roles (admin, standard, readonly) with credential status.

## Test 12: Suite Summary (`summarize_suite`)

**Prompt:**
> "Summarize the test suite"

**Expected:** Plain English summary with feature names, scenario titles, tag breakdown.

## Test 13: Selenium Migration (`migrate_test`)

**Prompt:**
> "Migrate this Selenium Java code to Playwright-BDD: [paste code]"

**Expected:** Returns migration instructions converting legacy code to modern TypeScript.

## Test 14: Refactoring (`suggest_refactorings`)

**Prompt:**
> "Analyze the project for duplicate steps and unused methods"

**Expected:** Identifies duplicates and unused Page Object methods.

## Test 15: CI Pipeline (`generate_ci_pipeline`)

**Prompt:**
> "Generate a GitHub Actions CI pipeline for my project"

**Expected:** Creates `.github/workflows/playwright.yml`.

## Test 16: Jira Bug Export (`export_jira_bug`)

**Prompt:**
> "Generate a Jira bug report for this test failure: [paste error]"

**Expected:** Jira-formatted Markdown with error log, attachments, next steps.

## Test 17: Team Knowledge (`train_on_example` + `export_team_knowledge`)

**Prompt 1:**
> "Learn: When encountering shadow DOM, use `page.locator('..').shadowRoot()`"

**Prompt 2:**
> "Export the team knowledge to Markdown"

**Expected:** Rule saved and exported as `docs/team-knowledge.md`.

## Test 18: Browser Session (`start_session` → `verify_selector` → `end_session`)

**Prompt sequence:**
1. "Start a headless browser session"
2. "Navigate to https://www.saucedemo.com"
3. "Verify the selector `#user-name`"
4. "End the browser session"

**Expected:** Session opens, navigates, verifies selector, closes cleanly.

## Test 19: 🆕 Token Optimizer (`execute_sandbox_code`)

**Prompt:**
> "Using the sandbox, inspect https://www.saucedemo.com and find only the button elements"

**Expected:** AI writes a small filtering script. Returns only buttons instead of entire DOM. See [Token Optimizer Documentation](TokenOptimizer.md) for details.

---

## Quick Verification Checklist

| # | Feature | Tool Name | Status |
|---|---------|-----------|--------|
| 1 | Project Setup | `setup_project` | ☐ |
| 2 | Codebase Analysis | `analyze_codebase` | ☐ |
| 3 | Test Generation | `generate_gherkin_pom_test_suite` | ☐ |
| 4 | DOM Inspection | `inspect_page_dom` | ☐ |
| 5 | Validate & Write | `validate_and_write` | ☐ |
| 6 | Dry Run | `validate_and_write` (dryRun) | ☐ |
| 7 | Run Tests | `run_playwright_test` | ☐ |
| 8 | Self-Healing | `self_heal_test` | ☐ |
| 9 | Environment | `manage_env` | ☐ |
| 10 | Configuration | `manage_config` | ☐ |
| 11 | User Management | `manage_users` | ☐ |
| 12 | Suite Summary | `summarize_suite` | ☐ |
| 13 | Migration | `migrate_test` | ☐ |
| 14 | Refactoring | `suggest_refactorings` | ☐ |
| 15 | CI Pipeline | `generate_ci_pipeline` | ☐ |
| 16 | Bug Export | `export_jira_bug` | ☐ |
| 17 | Team Learning | `train_on_example` | ☐ |
| 18 | Browser Session | `start_session` / `verify_selector` | ☐ |
| 19 | Token Optimizer | `execute_sandbox_code` | ☐ |
