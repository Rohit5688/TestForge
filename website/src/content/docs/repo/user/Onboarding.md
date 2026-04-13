---
title: "🔰 TestForge Onboarding & Configuration Guide"
---

This guide provides the essential "First Contact" prompts and a configuration questionnaire to ensure the TestForge MCP tool is perfectly aligned with your project's unique web automation architecture.

---

## 📗 1. The "First Contact" Prompts

When you connect this MCP to your AI assistant (e.g., Claude Desktop, Cursor), use these prompts sequentially to establish a solid foundation.

### 📄 Step 1: Readiness Verification
> "Check my project readiness at `/your/project/path` using `check_playwright_ready`. Ensure Playwright is installed and the base URL is reachable."

### 📄 Step 2: Smart Codebase Discovery
> "I want to integrate this MCP with my existing project. Run `analyze_codebase` on `/your/project/path` to discover my existing Page Objects, step definitions, and environment configurations. If you find any existing `playwright.config.ts` or `mcp-config.json` files, tell me how we can reuse them."

### 📄 Step 3: Adaptive Upgrading
> "Based on your analysis, run `upgrade_project` to ensure my directory structure supports the latest standard features like the `test-data/` user store and the `mcp-config.json` schema. Ensure my `baseUrl` and `browserName` are correctly populated."

### 📄 Step 4: Turbo Analysis (For Large Projects)
> "Check if the token-optimized code mode is functioning. Use `execute_sandbox_code` to locally read my `mcp-config.json`, extract the `version` and the active `dirs` mapping, and return ONLY those details."

---

## ⚙️ 2. `mcp-config.json` Questionnaire

Before finalizing your setup, review this questionnaire. These values control how the AI thinks and writes Playwright-BDD code for your team.

| Configuration Field | Your Decision | Example / Guide |
| :--- | :--- | :--- |
| **`baseUrl`** | What is the target Web URL? | `https://staging.myapp.com` |
| **`browserName`** | Which browser is the default? | `"chromium"`, `"firefox"`, or `"webkit"` |
| **`locatorOrder`** | Which locators do we trust? | `["role", "text", "testId", "css"]` |
| **`dirs.features`** | Where are Gherkin files? | `"features"` or `"src/test/features"` |
| **`dirs.pages`** | Where are Page Objects? | `"pages"` or `"src/test/pages"` |
| **`enableVisualExploration`** | Show browser during inspection? | `true` (for debugging) or `false` (standard) |
| **`credentials.strategy`** | How do we handle logins? | `"users-json"` or `"env-vars"` |

---

## 📄 3. The "Atomic First" Enforcement Rule

To prevent the AI from "taking shortcuts" (like using fragile CSS selectors in steps), always include this in your session instructions:

> "**ENFORCEMENT**: You must use the Page Object Model pattern. Every UI interaction must be encapsulated in a Page class method. Step definitions MUST NOT call `page.click(selector)` directly; they must call `await loginPage.submitForm()`. Prioritize **Accessibility Roles** (e.g., `getByRole('button', { name: 'Submit' })`) over raw CSS or XPaths."

---

## 📄 4. Why Use `inspect_page_dom`?
TestForge doesn't just "guess" selectors. It uses the native **Accessibility Tree** to see exactly what a screen reader sees. This means:
1. **Bulletproof Locators**: We find elements by their semantic meaning (e.g., "Main Menu" button) rather than their ephemeral styling.
2. **Auto-Healing**: If a developer changes a class name, but the button still says "Submit", `self_heal_test` will find it automatically without you writing a single line of code.