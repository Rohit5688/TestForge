---
title: 📐 System Architecture
description: The internal module boundaries and data flow of the TestForge MCP Server.
---

import { Steps, Badge, Card, CardGrid, Tabs, TabItem } from '@astrojs/starlight/components';

This document maps the internal architecture of the TestForge MCP Server — the actual modules running on your machine when you use TestForge in Claude Desktop or Cursor.

:::note[What you will learn]
- **Module map**: The five internal services and what each owns.
- **Request lifecycle**: How a natural-language prompt becomes committed test code.
- **Adapter pattern**: How TestForge bridges AI reasoning to Playwright execution.
- **Safety layers**: Where TypeScript validation and secret auditing are enforced.
:::

---

## 🏛️ Internal Module Map

TestForge is a single Node.js MCP server. Internally it is divided into five services with strict boundaries.

![TestForge Master Orchestration](../../../../assets/master_orchestration_2d.png)

| Module | Responsibility | Key Files |
| :--- | :--- | :--- |
| **MCP Handler** | Receives tool calls from the AI client via the MCP SDK. Routes each call to the correct service. | `src/index.ts` |
| **ContextManager** | Maintains a rolling window of the current session context: scanned DOM snapshots, codebase map, navigation graph. Limits context to the last **1 scan** per page to prevent bloat. | `src/services/ContextManager.ts` |
| **TestGenerationService** | Core generation logic. Reads existing Page Objects and Step Definitions, applies relevance filtering, and produces the generation prompt for the LLM. | `src/services/TestGenerationService.ts` |
| **LearningService** | Persistent knowledge store (`mcp-learning.json`). Records healed selectors, team patterns, and anti-patterns so every future generation benefits. | `src/services/LearningService.ts` |
| **SandboxEngine** | Isolated V8 environment for local script execution. Processes DOM trees, runs AST queries, and pattern searches — **nothing is sent to the LLM**. | `src/services/SandboxEngine.ts` |

---

## 🔄 The Full Request Lifecycle

A single prompt like *"Generate a login test for https://myapp.com"* triggers this internal sequence:

<Steps>

1.  **AI Client → MCP Handler**  
    Your AI assistant (Claude/Cursor) calls `generate_gherkin_pom_test_suite`. The MCP SDK deserializes the tool call and routes it to `TestGenerationService`.

2.  **Context Warm-Up (`ContextManager`)**  
    `ContextManager.getContext()` checks if the project has been analyzed. If not, it triggers `analyze_codebase` to build the structural map. This is the "Warm Brain" — subsequent calls skip this step.

3.  **DOM Extraction (`inspect_page_dom`)**  
    The target URL is launched in a headless Playwright browser. The Accessibility Tree is extracted, irrelevant nodes (hidden, decorative) are pruned, and only semantic elements are passed forward.

4.  **Relevance Filtering (`TestGenerationService`)**  
    The service queries `LearningService` for any known rules for this project. It then filters the existing Page Objects to send **only** the relevant classes to the LLM — not the entire codebase.

5.  **LLM Synthesis**  
    The filtered context + DOM snapshot + user intent is sent to the LLM. The LLM returns a structured JSON payload containing the `.feature`, `Page.ts`, and `steps.ts` content.

6.  **Safety Gate (`validate_and_write`)**  
    Before any file is written, the content is validated:
    - **TypeScript**: `tsc --noEmit` against the project's tsconfig.
    - **Gherkin**: Cucumber parser verifies `.feature` syntax.
    - **Secret Audit**: Regex scan for hardcoded passwords or API keys.

7.  **Commit to Disk**  
    Passing files are written atomically. The `LearningService` updates the navigation graph with any new screens discovered.

</Steps>

---

## 🔌 The "Reasoning-to-Execution" Bridge

TestForge acts as a **Smart Adapter** between the AI Reasoning Engine and the Playwright Execution Environment.

<Tabs>
  <TabItem label="AI Side (MCP)">
    The AI calls tools using the **Model Context Protocol**. Each tool has a typed Zod schema for input validation. The AI never touches the filesystem directly.
    ```typescript
    // Incoming tool call (simplified)
    { tool: "validate_and_write", params: { files: [...], projectRoot: "/my-app" } }
    ```
  </TabItem>
  <TabItem label="Execution Side (Playwright)">
    TestForge uses the Playwright Node.js API directly — no Playwright MCP dependency. This gives full control over browser lifecycle, network interception, and trace capture.
    ```typescript
    // Internal execution (SandboxEngine)
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(url);
    ```
  </TabItem>
</Tabs>

| Layer | Responsibility | Protocol |
| :--- | :--- | :--- |
| **AI Reasoning** | Plan generation and tool selection. | Natural Language → JSON (MCP) |
| **MCP Handler** | Deserializes, validates, routes. | MCP (JSON-RPC) |
| **TestGenerationService** | Context assembly, relevance filtering. | TypeScript method calls |
| **SandboxEngine** | Heavy local computation. | V8 Isolate |
| **Playwright** | Browser control and DOM extraction. | Chrome DevTools Protocol (CDP) |

---

## 🛡️ Security Boundaries

By design, the following data **never leaves your machine**:

- Raw source code (analyzed in the sandbox, only summaries sent to LLM)
- `.env` values and credential files
- `users.*.json` test data
- Playwright traces and screenshots (stored locally in `mcp-logs/`)

:::caution[Security Note]
TestForge honors your `.gitignore`. It will never write `users.json` or `.env` files to disk unless previously whitelisted in your `mcp-config.json`.
:::

---

## 🔗 Related Deep-Dives

- [Token Optimization & Sandbox Engine](/TestForge/repo/technical/tokenoptimizer/)
- [Atomic Healing Lifecycle](/TestForge/repo/technical/executionandhealing/)
- [Master Configuration Reference](/TestForge/repo/technical/mcp_config_reference/)
