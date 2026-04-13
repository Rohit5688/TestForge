---
title: "📱 UserGuide"
---

Welcome to the future of automated testing! This guide will walk you through setting up, mastering, and troubleshooting your Playwright-BDD MCP integration. No more boring docs—let's get your tests running at light speed. 🚀

---

## 📄 Quick Start: From Zero to "Green" in 60 Seconds

The fastest way to see the magic. Copy these prompts into your AI chat (Cursor/Claude) one by one:

1.  **Phase 1: Readiness check**
    > *"Check if Playwright is ready in my project at `/your/project/path`."*

2.  **Phase 2: Generate current test**
    > *"I want to test the TodoMVC app at `https://demo.playwright.dev/todomvc`. Create a test that adds 3 items: 'Buy Milk', 'Clean Room', and 'Feed Cat', then verifies the count is 3."*

3.  **Phase 3: Execute & Verify**
    > *"Now run the tests and show me the results."*

---

## 📄 1. Getting Started

### 📄 New Project: From Zero to "Green" in 60 Seconds
If you're starting from scratch, the `setup_project` tool is your best friend.

1.  **Run the Tool**: Call `setup_project` with an empty directory.
2.  **What Happens?**: 
    *   Creates `features/`, `pages/`, and `step-definitions/` folders.
    *   Installs `@playwright/test`, `playwright-bdd`, `typescript`, and `dotenv`.
    *   Scaffolds `playwright.config.ts` and `tsconfig.json`.
    *   Generates a starter `.env` and `mcp-config.json`.
3.  **Next Step**: Run `npx bddgen && npx playwright test` to see the example pass!

### 📄 Existing Project: Bring the Magic to Your Code
Already have a Playwright project? We'll adapt to *you*.

1.  **Run Readiness**: Call `check_playwright_ready`.
2.  **Run Analysis**: Call `analyze_codebase`. This extracts all your existing Page Objects and utilities into the AI's "brain".
3.  **Turbo Analysis**: For large projects (>100 files), tell the AI: *"Use Turbo Mode (execute_sandbox_code) to analyze my project structure and helpers."* This saves up to 98% tokens!
4.  **Repair & Maintenance**: If you accidentally deleted baseline files, run `repair_project` to restore them without touching your custom code.

---

## 🛠️ 2. The Power Tools in Your Belt

| Tool | Purpose | When to Use |
| :--- | :--- | :--- |
| `workflow_guide` | 🧭 The Sensei | **Standard start.** Ask: *"What should I do next?"* to get a deterministic plan. |
| `execute_sandbox_code` | 🚀 **Turbo Mode** | **High efficiency.** Use for large-scale codebase queries or data extraction. |
| `generate_gherkin_pom_test_suite` | ✍️ The Architect | Create new BDD features and typed Page Objects. |
| `validate_and_write` | ✅ The Builder | Commit generated code to disk with logic-check (TSC). |
| `inspect_page_dom` | 👁️ The Visionary | Get 100% accurate Accessibility Tree locators from any URL. |
| `run_playwright_test` | 🏃 The Sprinter | Execute tests and return **Error DNA** if things break. |
| `heal_and_verify_atomically` | 🩹 The Orchestrator | Fix a broken selector, test it live, and learn it in one go. |
| `discover_app_flow` | 🗺️ The Cartographer | Map out your application's navigation graph automatically. |

---

## 📄 3. Real-World Power Examples

### 📄 A. Multi-Environment Login (The Right Way)
Stop hardcoding usernames! Use the `UserStoreService` to manage credentials safely.

**1. Create your user store:**
Run `manage_users { action: "scaffold", projectRoot: "/path/to/project" }`.

**2. Use it in your Page Object (`LoginPage.ts`):**
```typescript
import { getUser } from '../test-data/user-helper.js';

export class LoginPage extends BasePage {
  async loginAs(role: 'admin' | 'standard') {
    const { username, password } = getUser(role);
    await this.page.fill('input[name="user"]', username);
    await this.page.fill('input[name="pass"]', password);
    await this.page.click('button#login');
  }
}
```

### 📱 B. Advanced Interactions: Drag & Drop
Our tools handle complex Playwright locators automatically.

**Scenario**: Drag an item in a list.
```gherkin
Scenario: Reorder list
  Given I navigate to "https://jqueryui.com/sortable/"
  When I drag sortable item 1 to the position of item 5
  Then I verify item 1 is at index 5
```

**Implementation Tip**:
Use `inspect_page_dom` to find the exact CSS selector for the sortable items. The AI will then generate a clean `dragTo` step.

### 📄 C. Adding Custom Roles on the Fly
Want to test a flow as a 'supervisor' or 'auditor'? You can add *any* number of custom users and roles instantly.
*   **Prompt**: *"Add 'supervisor' and 'auditor' roles to my user store."*
*   **What the AI does**: It runs the `manage_users` tool and adds these roles to `test-data/users.{env}.json`. Most importantly, it **automatically regenerates** `test-data/user-helper.ts` so your IDE has 100% type-safety and autocomplete for `getUser('supervisor')`!

---

## 🆘 4. Troubleshooting: The "Error DNA" Matrix

| Symptom | Probable Root Cause | The Fix 🛠️ |
| :--- | :--- | :--- |
| `DNA: Locators.Broken` | The selector changed in a new frontend deployment. | Run `heal_and_verify_atomically`. It finds the replacement and updates your POM. |
| `DNA: Environment.MissingKey` | Your `.env` or `mcp-config.json` is missing a required key. | Run `manage_config` to sync schema or `manage_env` to scaffold keys. |
| `DNA: Scripting.Syntax` | A `// TODO` or syntax error was accidentally committed. | `validate_and_write` usually catches this. Re-run it with the correct content. |
| `Undefined Step` | The Gherkin text doesn't match the regex in your `.ts`. | Run `analyze_codebase` to re-index steps. |
| `Locator timeout` | The page is slow or the selector is stale. | Increase `timeouts.sessionStart` in `mcp-config.json`. |

---

## 📗 5. Prompting Masterclass: How to Talk to the AI

The more specific your prompt, the better the automation. Use these templates to command the agent:

### 📄 A. Simple Steps (Navigation & Visibility)
*   **Prompt**: *"Create a test that navigates to `https://example.com`, checks that the header 'Welcome' is visible, and clicks the 'Get Started' button."*
*   **Best for**: Sanity checks and basic navigation flows.

### 📄 B. Authenticated Flows (Username & Password)
*   **Prompt**: *"Add a login test for `https://myapp.com/login`. Use the `admin` role from my user store. Verify that 'Dashboard' is visible after login."*
*   **Pro Tip**: The AI will automatically use the `getUser('admin')` helper we generated!

### 📄 C. Complex Actions (Drag, Iframes, & Data)
*   **Prompt**: *"Create a scenario on `https://demo.com/editor`. 1. Switch to the editor iframe. 2. Clear the canvas. 3. Drag the 'Rectangle' tool from the sidebar to the center of the canvas. 4. Verify the rectangle exists in the DOM."*
*   **Best for**: Functional testing of rich web apps.

### 📱 D. Multi-Tab Interactions & Reverting
*   **Prompt**: *"Click 'Open Report' to open a new tab. Verify the report loads, then switch back to the main tab and click 'Logout'."*
*   **What the AI does**: It handles the popup gracefully via `Promise.all([context.waitForEvent('page'), action])`, passes the new tab to the Page Object, then calls `await page.bringToFront()` on your original tab to logout!

### 📄 E. API Interception, Mocking & Capturing Responses
*   **Prompt (Mocking)**: *"Mock the `/api/permissions` endpoint to return a 403 status before clicking 'Edit'."*
*   **Prompt (Capturing)**: *"Click 'Submit'. Wait for the `/api/orders` API response, capture the ID, and verify the UI shows success."*
*   **What the AI does**: When capturing mid-action responses, the AI stringently uses `Promise.all([page.waitForResponse('...'), action()])` to completely eliminate race conditions. It stores the parsed JSON in a scoped variable so subsequent validations can assert against it seamlessly.

### 📄 F. Secure API Auth & Dynamic Payloads (`fixtures/`)
*   **Prompt**: *"Before navigating, make a POST request to `/api/v1/users`. Use the payload from `fixtures/new-user.json` and authenticate using a Bearer token from the `.env` file."*
*   **What the AI does**: 
    1. Extracts the native Playwright-BDD `request` fixture.
    2. **Prevents bloated Gherkin text!** It reads the body natively via `JSON.parse(fs.readFileSync('fixtures/new-user.json', 'utf8'))` inside the `.ts` step definition.
    3. Handles **Authentication dynamically** by building the `Authorization: Bearer ${process.env.API_TOKEN}` header natively in the execution block, ensuring secrets NEVER leak into your visible `.feature` files.

### 📄 G. TypeScript DTOs & Strict Typing (`models/`)
*   **Prompt (Assertions)**: *"Wait for the GET request to `/api/users/1`. Generate a TypeScript DTO interface for the User response and use it to assert the `email` property."*
*   **Prompt (Modification)**: *"Intercept the GET `/api/config` response. Use the corresponding DTO to change the `featureFlag` to `true` and fulfill the request with the modified body."*
*   **What the AI does**: It abandons implicit `any` parsing. It intelligently creates `export interface ...` files in your project's `models/` directory. In your step definitions, it casts the JSON to these types to guarantee type-safe compile-time assertions and provides a structured way to modify/mock responses natively!

---

## 📗 6. The "Dos & Don'ts" of AI Prompting

| Do 👍 | Don't 👎 |
| :--- | :--- |
| **Provide URLs**: Always include the full URL (e.g. `https://...`) so the tool can inspect the real DOM. | **Be Vague**: Avoid prompts like *"Fix my tests"* without providing the failing terminal output or logs. |
| **Mention Roles**: Use names like `admin`, `guest`, or `editor` to trigger the `UserStore` logic. | **Ask for Selectors**: Don't waste time asking for CSS selectors. Let the AI find them using `inspect_page_dom`. |
| **Specify Tags**: Say *"Tag this as @smoke"* so the `summarize_suite` and `run_playwright_test` tools can filter them. | **Manual Overwrites**: Don't manually edit the generated steps unless necessary. Use `self_heal_test` to fix them via the AI. |
| **Ask for Analysis**: Before a big change, ask *"Analyze my codebase and tell me if I have existing Page Objects for X."* | **Ignore Warnings**: If `validate_and_write` gives an overwrite warning, check it! It means you've made manual changes. |

---

## 🌟 7. Pro Tips for Advanced Users

1.  **Environment Switching**:
    ```bash
    # Run tests on Staging
    TEST_ENVIRONMENT=staging npx bddgen && npx playwright test
    
    # Run tests on Local
    TEST_ENVIRONMENT=local npx bddgen && npx playwright test
    ```
2.  **Autonomous Healing**: In `validate_and_write`, the server will automatically re-inspect the DOM if a locator fails and try a 2nd/3rd time with a new selector. **Trust the automation!**

3.  **Enforcing Custom Wrappers**:
    If your team uses a custom testing wrapper around Playwright (e.g., to handle logging or global waits), you can enforce its usage globally.
    *Open `mcp-config.json` and add:*
    ```json
    {
      "basePageClass": "my-custom-wrapper-pkg"
    }
    ```
    Now, the AI will ignore raw Playwright APIs (`this.page.click()`) and explicitly use your custom wrapper's methods across all generated Page Objects! You don't even need to ask for it in the prompt.

4.  **Forcing Specific Tags**: 
    The AI is strictly bound by the `tags` array in `mcp-config.json` (e.g., `['@smoke', '@regression']`). If you want to force a specific tag classification for a new test suite, simply tell the AI in your prompt:
    *   **Prompt**: *"Create a login test and make sure you tag it with @smoke."*
    *   The AI will override its default tag-selection logic and inject `@smoke` directly above your `Scenario:` in the generated `.feature` file.

---

> [!NOTE]
> **Need more help?** Just paste your terminal error directly to the AI and say: *"Hey, run self_heal_test on this output!"*

**Happy Testing! 🎭✨**