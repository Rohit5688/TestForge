---
title: "🩹 Execution, Healing & Error DNA"
---

TestForge is not a static code generator; it is an **Active QA Orchestrator**. It executes tests, analyzes failures via **Error DNA**, and heals selectors using live browser interaction.

---

## 🩹 1. Intelligent Test Execution

### 📄 `run_playwright_test`
This tool triggers the full Playwright-BDD pipeline: `npx bddgen` followed by `npx playwright test`.

- **Asynchronous Monitoring**: For large suites, the tool returns a `jobId` immediately so the AI can perform other tasks while tests run.
- **Error DNA Classification**: On failure, TestForge parses the terminal stack traces into a deterministic **DNA Signature**. This tells the AI *exactly* what type of failure occurred without reading 1000 lines of logs.

| DNA Signature | Meaning | AI Action Strategy |
| :--- | :--- | :--- |
| `Locators.Broken` | The element exists but the selector is stale. | Trigger `heal_and_verify_atomically`. |
| `Environment.TimedOut` | The page didn't load or is extremely slow. | Increase timeouts or check `baseUrl`. |
| `Scripting.Syntax` | A syntax error exists in the generated `.ts` file. | Regenerate the file via `validate_and_write`. |
| `Assertion.Failed` | The logic is correct, but the application state is wrong. | Log a bug report in CI. |

---

## 🩹 2. Atomic Self-Healing

One of TestForge's most powerful features is **Atomic Orchestration**. Instead of a slow loop of "Guess -> Code -> Run -> Fail", it uses a single verified call.

### 📄 `heal_and_verify_atomically`
Used when a `Locators.Broken` DNA signature is detected. 
1. **Live Inspection**: It launches a browser and navigates to the failing state.
2. **Selector Discovery**: It scans the **Accessibility Tree** to find the closest semantic match.
3. **Verification**: It attempts to interact with the *new* selector in the live session.
4. **Learning**: If successful, it returns the verified selector and updates the AI's "Rule Brain" so the mistake is never repeated.

---

## 📄 3. DOM & Visual Inspection

### 📄 `inspect_page_dom`
The AI "sees" your application through this tool. Unlike raw HTML dumps, it returns a **Simplified Accessibility Tree**.
- **ARIA-First**: It prioritizes Roles and Labels (e.g., `getByRole('button', { name: 'Login' })`).
- **Visual Parity**: If `enableVisualExploration` is toggled in `mcp-config.json`, it also returns base64 screenshots for the AI to analyze layout issues.

---

## 📄 4. Results Summarization

### 📄 `summarize_suite`
After a run, the AI calls this to parse the Playwright JSON reporter.
- **Scenario Filter**: Identifies exactly which `@tags` failed.
- **Trend Analysis**: Groups failures by **Error DNA** to identify if the issue is a "Global Breakage" (e.g., Auth Server down) or local flakiness.