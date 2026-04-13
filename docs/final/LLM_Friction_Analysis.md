# LLM Friction Analysis: TestForge MCP Server

## Overview
This document outlines common bottlenecks, "hallucination traps," and interaction failures that AI Agents (LLMs) might encounter while operating the **TestForge** framework autonomously. This analysis is derived directly from the operational friction observed during the hardening of the **AppForge** architectural foundation.

While the "Gravity Chain" patterns (WHEN/WHAT/HOW descriptions + JSON Action hints) mitigate many sequence errors, specific tool mechanics and Playwright-BDD quirks listed below remain high-risk failure modes if not tightly controlled by the LLM.

---

## 🛑 1. The Sandbox Confinement Trap (execute_sandbox_code)
**The Risk**: LLMs regularly assume the `execute_sandbox_code` environment is a standard Node.js instance with unrestrained access to the `fs` and `child_process` runtime.
**The Failure Mode**: The LLM writes standard node scripts like `fs.writeFileSync(...)` or `require('exec')(...)` inside the sandbox chunk, which immediately crash because the V8 sandbox is isolated.
**The Fix/Gravity Rule**: The LLM **must** strictly use the explicitly exported `apiRegistry` (e.g., `await forge.api.readFile()`) and ONLY return serializable primitives or small JSON objects. The sandbox does not retain state between calls.

## 🔁 2. The Healing Recursion Loop (validate_and_write)
**The Risk**: `validate_and_write` enforces syntactic and AST correctness, and critically, *attempts to self-heal up to 3 times internally on failure* before bubbling the exception out.
**The Failure Mode**: If `validate_and_write` exhausts its 3 attempts and returns an `ERROR` state to the MCP server, an LLM might immediately attempt to call `self_heal_test` or re-invoke `validate_and_write` with slightly different code, triggering another massive token-consuming 3x retry loop rather than halting.
**The Fix/Gravity Rule**: The LLM must respect the explicit `{ action: "CLARIFICATION_REQUIRED" }` or error remediations returned by the tool. If the internal healing fails, the structural DOM is likely hostile and requires human confirmation using `request_user_clarification`.

## 🕸️ 3. The Empty DOM "Snapshot" Trap (inspect_page_dom)
**The Risk**: Unlike Appium XML (which generally renders all static native elements instantly), `inspect_page_dom` scrapes a Web browser's Accessibility Tree which is highly dynamic and relies on hydration.
**The Failure Mode**: The LLM calls `inspect_page_dom` without a `waitForSelector` or `loginMacro`. The browser loads the skeleton or an unauth screen, returning an empty semantic DOM. In turn, the LLM falsely concludes the UI has no elements and generates an empty/broken Page Object.
**The Fix/Gravity Rule**: Always pass a `waitForSelector` when analyzing SPAs (React/Vue/Angular), and ensure the `start_session` or `storageState` authentication context was verified beforehand.

## 📦 4. The "Underlying Framework" Overwrite Bug
**The Risk**: A core premise of TestForge is the **Implicit Wrapper Rule** — `playwright-bdd` wraps `@playwright/test` completely.
**The Failure Mode**: The LLM encounters a generic Playwright import error in a legacy test and automatically runs `npx install @playwright/test` on the host machine. This creates a duplicate dependency version mismatch, instantly breaking the `playwright-bdd` singleton generator configuration. 
**The Fix/Gravity Rule**: LLMs MUST NEVER manually install base dependencies or override the underlying `playwright.config.ts` scaffolding manually without explicitly using `manage_config` or the `setup_project` tools.

## ⚡ 5. Manual AST Edits vs. POM Orchestration 
**The Risk**: An LLM attempting to update an existing Gherkin Step or Page Object manually (via `replace_file_content` or `sed` equivalents) rather than using `validate_and_write`.
**The Failure Mode**: An LLM modifies a `.ts` Page Object directly but fails to identically update its reference parameter signature in the corresponding `.feature` step definition. `Playwright-BDD` will crash during compilation.
**The Fix/Gravity Rule**: The LLM should consistently batch all feature/TypeScript changes simultaneously through the `validate_and_write` tool so the internal TestForge engine validates AST alignment prior to disk commitment.

## 🔐 6. Stale Session Amnesia
**The Risk**: The `start_session` / `navigate_session` persistent background contexts are separated by multiple conversational turns.
**The Failure Mode**: The LLM starts a session, conducts research, writes code, and then assumes 10 turns later that it can just call `verify_selector` on an element that was destroyed when the active session timed out or the framework naturally closed it off.
**The Fix/Gravity Rule**: LLMs must constantly confirm session tracking or use `start_session` specifically just prior to interacting with `verify_selector`.

---

## Operational Mitigation (The "Gravity Chain" Blueprint)

To proactively avoid the LLM slipping into these operational traps, TestForge relies almost entirely on the **`workflow_guide`** blueprint mechanism. 

Any LLM picking up an empty TestForge workspace **MUST** call `workflow_guide` (via the prompt enforcement rule added in the tools array). This ensures the LLM's first move is bounded strictly to deterministic execution (e.g., *scaffold -> env -> check -> validate*) rather than generic LLM-style guessing.
