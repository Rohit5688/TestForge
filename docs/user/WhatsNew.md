---
title: ✨ What's New (Changelog)
description: Recent updates, new MCP tools, and breaking changes in TestForge.
---

import { Badge } from '@astrojs/starlight/components';

This document tracks all high-impact features, MCP tool additions, and migration requirements for major TestForge versions. For full chronological commits, visit the [GitHub Releases](https://github.com/Rohit5688/playwright-bdd-mcp/releases) page.

---

## v2.0 (The Enterprise Release) <Badge text="Latest" variant="success" />

The v2.0 release transitions TestForge from a lightweight script generator into a full production-ready intelligent test orchestrator. It completely overhauls the internal architecture to prioritize safety, token-efficiency, and deep config integration.

### 🌟 Major Features
- **Async Test Execution**: `run_playwright_test` now supports fire-and-forget execution with async polling, preventing the MCP timeout window from killing long-running test suites.
- **Deep Discovery**: New `discover_app_flow` tool spawns a headless browser to systematically crawl an app, automatically mapping DOMs to known routes.
- **Atomicity Pipeline**: Introduction of `validate_and_write` and `heal_and_verify_atomically` — actions that validate Gherkin syntax constraints *before* touching the file system.

### 🛠️ New & Updated Tools
- **`manage_config`**: Consolidates 4 legacy tools into a single action for reading, mutating, checking permissions, and scaffolding.
- **`execute_sandbox_code`**: (Turbo Mode) Securely executes Javascript AST parsers across thousands of files directly via the MCP server interface, slashing token context reads by 95%.
- **`export_bug_report`**: Can now parse failing Playwright `ErrorDna` and output a Jira-ready Markdown ticket containing visual artifacts and execution logs.

### 💥 Breaking Changes & Migrations
- `mcp-config.json` now enforces strict typing based on `zod`. Any unknown properties will throw a validation error rather than being silently ignored.
- Built-in UI commands (`start_session` and `stop_session`) are now explicitly prefixed as actions under the updated structural interface.

---

## v1.5 (The Intelligence Upgrade)

Focused on the AI "Global Brain" and cross-repository synchronization, making TestForge agents smarter over time.

### 🌟 Major Features
- **Project Structure Scanning**: Agents can now interpret `structural-brain.json` providing "God Node" diagrams and mitigating dangerous refactors to highly coupled page models.
- **Cross-Layer Utility Coverage**: Added `audit_utils` to ensure base methods correctly bubble up Appium logic through wrapper SDKs.

### 🛠️ New Tools
- **`train_on_example`**: Enables TestForge to permanently memorize a manual test correction or logic change, injecting it as structured criteria into all future prompts.
- **`export_team_knowledge`**: Flushes the `.TestForge/mcp-learning.json` brain out to a human-readable Markdown manifest for manual oversight.

---

## v1.0 (Initial Release)

The initial MVP proving tests can be natively generated, executed, and healed directly within an MCP-connected agent using standard Gherkin behavior definitions. 

* `run_playwright_test` implementation.
* Basic AST extraction.
* Legacy setup logic.
