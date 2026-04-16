---
title: ❓ Frequently Asked Questions
description: Top answers to recurring issues and common questions about TestForge.
---

import { Tabs, TabItem } from '@astrojs/starlight/components';

This compilation of frequently asked questions is based on common patterns and user reports. For troubleshooting specific error messages, see the [Troubleshooting Guide](/TestForge/repo/user/troubleshooting/).

---

## Architecture & Concepts

### How does TestForge differ from raw Playwright?
TestForge is an **MCP (Model Context Protocol) Server**, not a test framework. It sits *on top* of Playwright and Cucumber BDD, allowing AI agents (like Claude Desktop or Cursor) to act natively within the testing environment without you manually compiling scripts. It interprets natural language, inspects the live browser DOM, and writes Playwright BDD code autonomously.

### Why Cucumber BDD instead of native Playwright scripts?
TestForge uses BDD (Behavior-Driven Development) because it limits AI hallucinations. When an LLM generates raw Playwright typescript, it often hallucinates locators or creates brittle loops. By using Cucumber, the AI matches natural language (`When I click "Submit"`) to pre-validated, semantic Step Definitions and Page Objects, making generated tests 90% more resilient to UI changes.

### Does TestForge need to read my whole project on every message?
**No.** We designed TestForge with "Turbo Mode" (`execute_sandbox_code`). Instead of the AI paying thousands of tokens to read `.ts` files to understand what steps exist, TestForge executes a secure script to extract exactly the available steps from AST and returns just the function signatures. This reduces context usage by ~95%.

---

## Locators & Selectors

### Why aren't my selectors being found by the AI?
The most common cause is missing `data-testid` attributes or poor accessibility roles in your app. TestForge expects semantic HTML (like `<button name="submit">` or `<input aria-label="email">`). If your app is composed of generic `<div>` tags with raw Tailwind classes, the AI will struggle. 

**Solution:** Follow the [Accessibility-First locator strategy](https://playwright.dev/docs/locators) recommended by Playwright. Add `data-testid` where needed.

### Does TestForge support Shadow DOM or iframes?
**Yes.** Playwright handles Shadow DOM automatically. For iframes, ensure your Page Object method explicitly frames the locator, e.g., `this.page.frameLocator('#my-frame').locator('.submit')`. 

If generating tests inside an iframe, use the `inspect_page_dom` tool with `includeIframes: true` so the AI can see inside.

### What should I do if a layout change breaks 50 tests?
You do not need to update them manually. Open your AI client and say:
> "Run the @smoke suite and self-heal any failing selectors."

TestForge will run `run_playwright_test`, catch the `ElementHandle` failure, use `self_heal_test` to find the replacement selector in the new DOM, verify it with `verify_selector`, and update your Page Object natively.

---

## CI/CD and Headless Execution

### I get "No display port" or blank screenshots in CI
This happens when you run in headed mode without a virtual framebuffer. Ensure your `playwright.config.ts` forces headless mode in CI:
```typescript
use: {
  headless: process.env.CI ? true : false,
}
```
And check that your GitHub Actions explicitly install dependencies: `npx playwright install --with-deps`.

### The visual mask overlays things I want to click during live debugging!
If `enableMask` is set to `true` in your core configuration, TestForge injects a DOM overlay to prevent manual user interaction from interrupting the AI. 
If you need to manually inspect the page while the persistent session is running, turn it off in `mcp-config.json` via the `visualParity` setting or close the running browser.

---

## AI Agent Integration

### The AI is spinning out and calling `manage_config` in a loop
This often happens if your `.env` or `mcp-config.json` is missing required fields (like `baseUrl`), and the AI is trying to auto-fix the problem but receiving an invalid schema. 

**Stop the prompt** and manually run:
```bash
npx testforge check-env
```
Ensure all required configuration parameters are satisfied locally. 

### Why did the AI write a script instead of creating files directly?
If your project surpasses a certain file count, the AI may try to output raw code snippets into chat rather than calling `validate_and_write`. Prompt it firmly:
> "Use the validate_and_write tool to commit this code to the repository."

### Does the AI learn from my corrections?
**Yes.** If you correct the AI's selector strategy or code structural choices, you should tell the AI:
> "Use train_on_example to save this fix so you remember it for next time."
TestForge will store the insight in `.TestForge/mcp-learning.json` and automatically inject it as context into future test generations.
