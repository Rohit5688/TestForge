<p align="center">
  <img src="docs/readme-logo.png" width="400" alt="TestForge Logo">
</p>

# 🛠️ TestForge | Web Automation MCP Server

An advanced, autonomous AI tool designed for Model Context Protocol (MCP) clients (like Cursor, Anthropic Desktop, etc.). This server provides an suite of highly specialized endpoints that transform your LLM into a Staff-Level QA Automation Engineer.

It natively understands the **Playwright-BDD** testing framework, enforcing strict Page Object Model (POM) patterns, web-first assertions, and defensive coding techniques.

---

## ⚡ 60-Second Quick Start: The "Buy Milk" Demo

Want to see TestForge in action immediately? Copy and paste these three prompts into your AI client (Cursor, Claude Desktop, etc.) to generate and run a real test on a live URL.

1.  **Prompt 1**: *"Check if Playwright is ready in my project at `/your/project/path`."*
2.  **Prompt 2**: *"I want to test the TodoMVC app at `https://demo.playwright.dev/todomvc`. Create a test that adds 3 items: 'Buy Milk', 'Clean Room', and 'Feed Cat', then verifies the count is 3."*
3.  **Prompt 3**: *"Now run the tests and show me the results."*

**What happens?** TestForge will inspect the live DOM, generate a typed Page Object, write the Gherkin feature, and execute the test natively. Zero configuration required.

---

## 🚀 Key Capabilities

This MCP Server bridges the gap between AI code generation and deterministic framework execution. It provides your AI with tools to:

1. **Scaffold & Configure**: Setup Playwright-BDD, isolate `.env` credentials, and manage role-based testing.
2. **Code Generation & Dry Runs**: Generate tightly-coupled Gherkin `.feature` files and Playwright Page Objects with AI. Preview changes before writing to disk.
3. **Legacy Migration**: Automatically parse and translate Java/Python Selenium frameworks into modern TypeScript Playwright-BDD components.
4. **Self-Healing Mechanics**: Execute tests locally, analyze failures, scrape the live Page DOM (Accessibility AOM), and automatically correct broken selectors.
5. **Autonomous Learning**: Teach the AI custom heuristics (`// @mcp-learn`). The AI will permanently store and inject your team's custom rules into future code generations.
6. **CI/CD & Defect Tracking**: Scaffold GitHub Actions, GitLab CI, and Jenkins pipelines. Export formatted Atlassian Jira bug reports directly from test failures.

## 📚 Documentation & User Guides

Detailed documentation, examples, and optimized prompts are organized in the `docs/` folder:

### 👤 User Guides
*   [**Prompt Cheatbook**](docs/user/TESTFORGE_PROMPT_CHEATBOOK.md) — 🆕 Specialized Playwright-BDD prompt library.
*   [**Onboarding Guide**](docs/user/Onboarding.md) — First-contact prompts and config questionnaire.
*   [**Team Collaboration**](docs/user/TeamCollaboration.md) — AI Learning Loop and @mcp-learn protocol.
*   [**User Guide**](docs/user/UserGuide.md) — Comprehensive functional walkthrough.
*   [**Workflows**](docs/user/Workflows.md) — Deterministic AI interaction patterns.

### 🛠️ Technical Reference
*   [**Config Reference**](docs/technical/MCP_CONFIG_REFERENCE.md) — Authoritative `mcp-config.json` schema.
*   [**Execution & Healing**](docs/technical/ExecutionAndHealing.md) — Error DNA diagnosis and Atomic Healing.
*   [**Test Generation**](docs/technical/TestGeneration.md) — Context-aware BDD synthesis and Atomic Staging.
*   [**Migration Guide**](docs/technical/MigrationGuide.md) — Porting Selenium (Java/Python) to Playwright.
*   [**Security & Compliance**](docs/technical/SecurityAndCompliance.md) — Local-first security and regulatory info.
*   [**Accessibility**](docs/technical/Accessibility.md) — Automated WCAG/Axe-core testing.
*   [**Token Optimizer**](docs/technical/TokenOptimizer.md) — Turbo Mode (Sandbox) for 98% savings.

### 📈 Maintenance & Infrastructure
*   [**Continuous Integration**](docs/maintenance/ContinuousIntegration.md) — Pipeline scaffolding and AI bug reporting.
*   [**Project Evolution**](docs/maintenance/ProjectEvolution.md) — Technical leap into the Atomic Staging era.
*   [**Docker Setup**](docs/maintenance/DockerSetup.md) — Local stdio and remote SSE cloud deployments.

---

## 🛠️ MCP Tool Reference (Exposed Capabilities)

### **Project Setup & Maintenance**
* `workflow_guide`: 🆕 **The Sensei** — Get step-by-step guidance for any task (Setup, Generation, Healing).
* `check_playwright_ready`: 🆕 **The Scout** — Verify Node.js, Playwright, and configs before starting.
* `setup_project`: Bootstraps a scalable framework with hooks and standard structure.
* `manage_config`: Reads/updates `mcp-config.json` capability builds (Visual Mode, Telemetry).
* `manage_env`: 🆕 **The Secret Keeper** — Securely handle `.env` credentials and example files.
* `repair_project`: 🆕 **The Mechanic** — Restores missing baseline files after interrupted setups.

### **Codebase Intelligence & Generation**
* `analyze_codebase`: AST-based extraction of existing Steps, Pages, and Helpers.
* `execute_sandbox_code`: 🚀 **TURBO MODE** — Execute JS in a secure V8 sandbox for **98% token savings**. Recommended for all analysis tasks.
* `generate_gherkin_pom_test_suite`: Heart of the machine. Generates BDD suites mapping English to strict POM code.
* `validate_and_write`: Syntactically validates TS/Gherkin and writes to disk with **Atomic Logic** (all or nothing).
* `migrate_test`: 🆕 **The Translator** — Port legacy Java/Python/JS Selenium into modern Playwright-BDD.

### **Execution & Healing**
* `inspect_page_dom`: Fetches the live **Accessibility Tree** to find target roles and names with 100% accuracy.
* `run_playwright_test`: Executes native `npx playwright test` and returns **Error DNA** on failure.
* `self_heal_test`: Analyzes Error DNA and live DOM context to auto-patch broken locators.
* `heal_and_verify_atomically`: 🆕 **The Orchestrator** — Heal, verify on live browser, and learn the fix in one atomic step.

### **Advanced Quality Assurance**
* `discover_app_flow`: 🆕 **The Cartographer** — Live crawl your site to build a persistent Navigation Graph.
* `export_navigation_map`: Visualizes your app transitions as a **Mermaid diagram**.
* `analyze_coverage`: Reports on missing core functional flows and negative tests.
* `audit_locators`: 🆕 **The Safety Officer** — Scans Page Objects and flags brittle or non-semantic selectors.
* `audit_utils`: 🆕 **The Coverage Inspector** — Reports missing Playwright API surface wrappers.
* `export_bug_report`: Auto-classifies failures into **Jira/Linear** ready Markdown tickets.

## Getting Started

### 🔌 Bootstrapping the Server

Add the local server to your MCP Client settings:

```json
{
  "mcpServers": {
    "testforge": {
      "command": "node",
      "args": ["/absolute/path/to/TestForge/dist/index.js"]
    }
  }
}
```

> [!TIP]
> This server also supports **SSE transport** via `--transport sse --port 3100`.

Then, simply open a chat and say: *"I have a new automation project located at /path/to/my/project. Please set up Playwright-BDD for me."*

*Designed for resilience, isolation, and enterprise-grade automation.*
