# 📗 TestForge AI Prompt Cheatbook (Playwright-BDD)

This cheatbook provides a library of high-precision prompts optimized for the TestForge (Playwright-BDD) ecosystem. Use these to command the AI for complex web automation tasks with minimal token waste.

---

## 🦖 The Caveman Protocol (Token Optimization)

To save tokens and increase speed, you can use **Caveman Mode**.
> **Prompt**: *"Switch to Caveman Mode. Minimal output, no repeat paths, use surgical edits only."*

---

## 🧪 1. Core Automation Prompts

### 👁️ Structural Discovery (New URLs)
Always use the Accessibility Tree for 100% selector accuracy.
> **Prompt**: *"Inspect the DOM at `https://myapp.com/dashboard` using `inspect_page_dom`. Identify the 'Submit' button and the 'Main Navigation' menu, then generate a typed Page Object for this view."*

### ✍️ Gherkin-to-Code (Atomic Generation)
Generate a full BDD suite in one pass.
> **Prompt**: *"Analyze my codebase architecture, then use `generate_gherkin_pom_test_suite` for this intent: [English Description]. Ensure it uses existing `BasePage` methods. Finally, use `validate_and_write` to commit and run it."*

### 🩹 Atomic Healing
Fix a broken test in one go.
> **Prompt**: *"My 'Login' test just failed with a 'selector not found' error. Call `heal_and_verify_atomically` on `loginPage.submitButton`. It will find the fix, test it live, and update the Page Object automatically."*

---

## 🌐 2. Advanced Web Interactions

### 🔐 Authenticated Flows
Leverage the `UserStore` for type-safe credentials.
> **Prompt**: *"Create a dashboard test. Authenticate as the 'admin' role from my `UserStore`. Verify that the 'System Settings' link is visible."*

### 📥 API Interceptors & DTO Assertions
Handle dynamic data with strict TypeScript types.
> **Prompt**: *"Intercept the GET `/api/v1/profile` response. Generate a TypeScript DTO for the response body in `src/models/Profile.ts`, then assert that the `username` returned matches the UI display."*

### 🎭 Iframes & Multi-Tab
Navigate complex layouts gracefully.
> **Prompt**: *"Navgiate to the help center. It opens in a new tab. Verify the title, then close the tab and return to the main dashboard. If you need to interact with the support chat, remember it's inside an iframe."*

---

## 🛠️ 3. Maintenance & CI

### 🧭 Orchestration Guidance
Not sure what to do next?
> **Prompt**: *"Run `workflow_guide(workflow: 'write_test')` to give me the exact tool sequence for adding a new scenario."*

### 🧠 Teaching the AI (@mcp-learn)
Inject tribal knowledge into the agent's brain.
> **Prompt**: *"Hey, whenever you see a 'DataGrid', you must always wait for the `.loading-spinner` to disappear first. Use `train_on_example` to learn this rule for all future generations."*
