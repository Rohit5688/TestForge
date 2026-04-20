# TestForge Workflow: LLM & MCP Real-Time Communication (Live Session Breakdown)

This document outlines a simulated real-world communication flow between the LLM and the TestForge MCP server when generating an end-to-end test. It traces the lifecycle of a request from the initial user prompt, over various tool calls (including advanced troubleshooting and unhappy paths), up to execution and dynamic self-healing.

---

## The Scenario

**User Prompt:**
> "I need a test for the SauceDemo login page. Navigate to `https://www.saucedemo.com/`, log in using username `standard_user` and password `secret_sauce`, and verify that the products page loads."

At this point, the LLM has no idea what elements exist on the page or what the codebase architecture looks like. It begins calling the TestForge MCP tools.

---

## Step 1: Pre-flight Intelligence & Context Gathering

Before the LLM can reliably write a test, it needs the semantic structure of the page, without "guessing" selectors. In live sessions, the LLM uses a variety of tools depending on the complexity of the page.

**🛠️ Tool Call 1: `mcp_testforge_inspect_page_dom`** (Standard Approach)
```json
{
  "url": "https://www.saucedemo.com/",
  "returnFormat": "json"
}
```
**📥 Response:** Returns a filtered AOM (Accessibility Tree) containing ONLY actionable verified Playwright locators (e.g., `page.getByRole('textbox', { name: 'Username' })`), saving 90% of token waste compared to raw HTML.

**🛠️ Tool Call 2 (Alternative): `mcp_testforge_gather_test_context`** (For complex User Journeys)
If the page features deep navigation or heavy API loads, the LLM calls this to get a map of URLs and XHR network calls to know exactly where to put `waitForResponse()` interceptors.

**🛠️ Tool Call 3 (Alternative): `mcp_testforge_execute_sandbox_code`** (The "Turbo Mode")
For deep codebase analysis without blowing up context windows, the LLM executes sandboxed JavaScript directly inside the MCP to return only filtered analytical data.

---

## Step 2: Requesting Project Architecture & Rules

The LLM now asks TestForge for the strict project rules, ensuring the code generated aligns perfectly with the repository's framework.

**🛠️ Tool Call by LLM:** `mcp_testforge_generate_gherkin_pom_test_suite`
```json
{
  "testDescription": "Test the SauceDemo login with standard_user and secret_sauce.",
  "projectRoot": "C:/Users/Rohit/mcp/TestForge"
}
```

**📥 Response from MCP Server:**
The MCP responds with a massive `SYSTEM INSTRUCTION` string that essentially "brainwashes" the LLM. 
* It enforces the **BasePage Singleton Pattern**.
* It injects **Utility Awareness**: *"You MUST use `import { getPage } from 'vasu-playwright-utils';`"*
* It passes the cached `inspect_page_dom` locators so the LLM doesn't have to invent them.

---

## Step 3: LLM Synthesizes the Test Structure (Internal Processing)

**🧠 LLM Internal Monologue:**
> *"Okay, I need to generate a feature, a Page Object, and a step definition. I will write the locators exactly as provided by the DOM reference. I must use `jsonPageObjects` to generate the code atomically."*

---

## Step 4: Validating, Linting, and TypeScript Error Checking

The LLM packages its synthesis into the rigid JSON structure expected by TestForge and attempts to write it. **This is not just a file write—it is a strict compiler loop.**

**🛠️ Tool Call by LLM:** `mcp_testforge_validate_and_write`
```json
{
  "projectRoot": "C:/Users/Rohit/mcp/TestForge",
  "files": [ ... ],
  "jsonPageObjects": [ ... ],
  "jsonSteps": [ ... ]
}
```

**⚠️ Unhappy Path Scenario (TS Errors):**
The MCP Server transpiles the JSON into TypeScript and runs `tsc --noEmit`. 
If the LLM made a mistake (e.g., missing an argument, or calling `.click()` on an element instead of `this.click()`), the MCP halts the write.

**📥 Response from MCP Server:**
```json
{
  "valid": false,
  "errors": [
    "src/pages/LoginPage.ts:42:15 - error TS2339: Property 'submitBtn' does not exist on type 'LoginPage'."
  ]
}
```

**♻️ LLM Reaction (The Retry Loop):**
The LLM sees the TypeScript error, realizes it forgot to define `submitBtn` in the locators array, fixes the JSON payload, and calls `mcp_testforge_validate_and_write` again until it receives `"valid": true`.

---

## Step 5: Execution & The "Street-Smart" Healing Loop (Live Session Reality)

In live sessions, tests rarely pass on the first try due to dynamic app behavior (e.g., React/Angular re-rendering, Strict Mode violations).

**🛠️ Tool Call by LLM:** `mcp_testforge_run_playwright_test`
```json
{
  "projectRoot": "C:/Users/Rohit/mcp/TestForge",
  "tags": "@smoke"
}
```

**🚨 The Failure:**
The test fails after a 30s timeout because a locator was either detached from the DOM during a React re-render or matched multiple elements (Strict Mode Violation). Playwright exits with an error code. 
*Behind the scenes, TestForge automatically drops an `error-context.md` file locally with a snapshot of the failure.*

**🛠️ Tool Call by LLM (Resolving the Failure): `mcp_testforge_self_heal_test`** 
The LLM passes the "Error DNA" returned by Playwright into the healer tool.
```json
{
  "errorDna": {
    "code": "Logic",
    "reason": "strict mode violation: locator('button') resolved to 3 elements",
    "causalChain": "..."
  }
}
```

**📥 Response from MCP Server:**
The MCP analyzes the failure against the live `error-context.md` and provides the LLM with a highly specific structural fix. 
*Example: It teaches the LLM to abandon brittle standard locators in favor of structural siblings (`p:has-text("...") + input`) or `data-test` attributes.*

**♻️ The Final Fix:**
The LLM calls `multi_replace_file_content` to apply the resilient locator fix, and runs `mcp_testforge_run_playwright_test` one last time. 

```json
{
  "success": true,
  "output": "1 passed (2.3s)",
  "reportPath": "playwright-report/index.html"
}
```

---

## Summary of the Full Live Session Flow

1. **Pre-Flight Intelligence**: `inspect_page_dom` or `gather_test_context` (Filters out 90% of useless HTML, providing exact locators).
2. **Context Intake**: `generate_gherkin_pom_test_suite` (Injects repo rules, `vasu-playwright-utils`, and BDD framework logic).
3. **Atomic Generation**: `validate_and_write` (LLM submits JSON; MCP compiles and rejects TypeScript errors via `tsc --noEmit`).
4. **Execution**: `run_playwright_test` (Executes the new suite).
5. **Dynamic Self-Healing (If Failed)**: `self_heal_test` (Reads `error-context.md`, returns resilient structural selectors, replacing brittle standard ones).
6. **Apply & Verify**: Re-write the fixed Page Object and re-run.
