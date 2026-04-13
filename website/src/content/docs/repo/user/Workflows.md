---
title: "🔄 MCP AI Conversation Workflows"
---

This document outlines the standard operational workflows when conversing with an AI powered by TestForge. All workflows follow the deterministic patterns defined in the `workflow_guide` tool.

### 🔄 1. New Project Setup Workflow (Phase 1 & 2)
**User:**
> "I want to start a new test project in the `automation/` directory."

**AI Engine:**
1. Calls `check_playwright_ready` to verify system requirements.
2. Calls `setup_project(projectRoot: 'automation/')`. This creates the `mcp-config.json` template.
3. AI pauses and asks the user to fill in project-specific URLs and credentials.
4. User confirms, and AI calls `setup_project` again to scaffold the full framework (BasePage, Feature dirs, Hooks).

### 🔄 2. Feature Generation & Self-Healing Workflow
**User:**
> "Write a test that logs into the system and asserts the welcome banner is visible."

**AI Engine:**
1. Calls `analyze_codebase()` (Turbo Mode) to discover Page Objects.
2. Calls `generate_gherkin_pom_test_suite({...})` to synthesize the suite.
3. Calls `validate_and_write(dryRun: false)` to commit code.
4. AI automatically runs `run_playwright_test`.
5. **If failure occurs**: AI analyzes the **Error DNA**. If the DNA is `Locators.Broken`, it automatically invokes `heal_and_verify_atomically` to find and verify the fix.

### 🔄 3. Dry Run / Secure Review Workflow
**User:**
> "Draft a cart test, but don't write to disk yet."

**AI Engine:**
1. Calls `analyze_codebase()`.
2. Calls `validate_and_write(dryRun: true)`. 
3. The MCP server audits the generated code for secrets and path traversal attempts, and returns a safe "Preview" diff.
4. AI asks for final approval.

### 🔄 4. Atomic Maintenance Workflow (The "Repairman")
**User:**
> "My selector for the 'Submit' button is broken, can you fix it?"

**AI Engine:**
1. Calls `inspect_page_dom` to gather the live accessibility tree.
2. Calls `heal_and_verify_atomically` with the broken selector.
3. Tool navigates, finds the best candidate, verifies it works, and updates the AI's internal Rule registry.
4. AI applies the fix to the Page Object file.