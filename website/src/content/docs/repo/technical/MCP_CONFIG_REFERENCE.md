---
title: "⚙️ TestForge Configuration & Setup Reference"
---

This is the authoritative technical reference for configuring TestForge (Playwright-BDD). It covers the `mcp-config.json` schema and the lifecycle tools used to manage your automation environment.

---

## 🛠️ 1. Project Lifecycle Tools

Use these tools to establish and maintain a healthy automation environment.

| Tool | Phase | Purpose |
| :--- | :--- | :--- |
| `check_playwright_ready` | 🛡️ Scout | Verifies Node.js, Playwright, and project structure are valid. |
| `setup_project` | 🏗️ Bootstrap | Scaffolds the BDD framework (Folders, BasePage, Hooks, Configs). |
| `manage_env` | 🔐 Secrets | Safely manages `.env` files without leaking secret values to the AI. |
| `repair_project` | 🩹 Mechanic | Restores missing baseline files without overwriting custom code. |

---

## ⚙️ 2. `mcp-config.json` Schema

The `mcp-config.json` file is the "Brain" of the integration. It defines how TestForge interacts with your codebase.

### 📄 Core Settings
- **`version`** (`string`): Configuration schema version (Expected: `"2.4.0"`).
- **`projectRoot`** (`string`): Absolute path to the automation project.
- **`baseUrl`** (`string`): The target URL for web automation.

### 📄 Directory Layout (`dirs`)
| Field | Default | Description |
| :--- | :--- | :--- |
| `features` | `"features"` | Path to Gherkin `.feature` files. |
| `pages` | `"pages"` | Path to Page Object Model `.ts` files. |
| `stepDefinitions` | `"step-definitions"` | Path to Cucumber-style step definitions. |
| `testData` | `"test-data"` | Folder for the User Store and JSON fixtures. |

### 🩹 Playwright Execution
- **`browserName`** (`string`): Default browser (`"chromium"`, `"firefox"`, `"webkit"`).
- **`browsers`** (`string[]`): Matrix of browsers for cross-browser testing.
- **`retries`** (`number`): Number of execution retries for failed tests.
- **`playwrightConfig`** (`string`): Path to your existing `playwright.config.ts`.

### ✍️ AI Generation Heuristics
- **`basePageClass`** (`string`): The class (or package) all generated POMs must extend.
- **`waitStrategy`** (`string`): Playwright load state strategy (`"networkidle"`, `"load"`, `"commit"`).
- **`tags`** (`string[]`): Default tags recommended by the AI (e.g., `["@smoke", "@regression"]`).
- **`backgroundBlockThreshold`** (`number`): Merges repeated steps into `Background:` blocks if count > N.

---

## 📄 3. Credentials & User Management

TestForge uses a **Deterministic User Store** to prevent hardcoded passwords.

### ⚙️ Config Mapping
In `mcp-config.json`:
```json
{
  "credentials": {
    "strategy": "users-json",
    "environment": "staging"
  }
}
```

### 🔄 Operational Workflows
1. **Scaffold**: `manage_users(action: "scaffold")` creates `test-data/users.staging.json`.
2. **Retrieve**: AI uses the `getUser(role)` helper in generated Page Objects for type-safe auth.
3. **Redaction**: Secret values are automatically redacted in MCP tool logs.

---

## 📄 ⏲ 4. Timeouts & Robustness
Adjust these in the `timeouts` block to handle slow environments:
- **`testRun`**: Max execution time for the full test suite shell command.
- **`sessionStart`**: Max wait for browser launch and initial navigation.
- **`healingMax`**: Number of self-healing attempts before failing a `validate_and_write` call.