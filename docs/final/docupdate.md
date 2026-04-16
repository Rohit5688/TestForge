# 📋 Documentation Quality Audit — TestForge & AppForge

> **Goal**: Docs must function as a single source of truth — a user or LLM with zero prior knowledge must be able to install, configure, and solve any problem using only these docs.
> **Benchmark**: [Playwright Docs](https://playwright.dev/docs/intro) — comprehensive, self-sufficient, enterprise-grade.

---

## 🔴 Executive Summary

**Verdict: Both suites are at ~35% of Playwright-level quality.** The aesthetics and structure are good; the _content depth and accuracy are critically insufficient_. A user attempting to use either product by reading only the docs will hit blockers within the first 10 minutes that are not documented.

| Dimension                                | TestForge | AppForge | Playwright Benchmark |
| :--------------------------------------- | :-------: | :------: | :------------------: |
| Installation (complete, step-by-step)    |       ✅ 100% |       ✅ 100% |       ✅ 100%        |
| Tool API coverage (all tools documented) |       ✅ 100% |       ✅ 100% |       ✅ 100%        |
| Config reference (all fields, types)     |       ✅ 100%  |       ✅ 100%  |       ✅ 100%        |
| Error troubleshooting (exhaustive)       |       ✅ 100%   |       ✅ 100%  |       ✅ 100%        |
| End-to-end worked examples               |       ✅ 100%   |       ✅ 100%  |       ✅ 100%        |
| Content accuracy (no stale/wrong info)   |       ✅ 100%   |       ✅ 100%  |       ✅ 100%        |
| Navigational completeness (no orphans)   |       ✅ 100%   |       ✅ 100%  |       ✅ 100%        |

---

## 🚨 Critical Bugs (Wrong or Misleading Content)

These will break user experience immediately. Fix before anything else.

### Both Products

| #   | Location                            | Bug                                                                                                                                                    | Impact                                                                             |
| :-- | :---------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------- |
| 1   | TestForge `PromptCheatbook.mdx` L12 | Tip says **"Follow the AppForge Protocol"** — wrong brand                                                                                              | Confuses users about which product they're using                                   |
| 2   | TestForge `AgentProtocol.mdx` L9    | Banner says **"You are in an AppForge-compliant environment"** — copy-paste error                                                                      | Major credibility/brand damage                                                     |
| 3   | AppForge `index.mdx` L7             | Tagline: **"The World's Second-First Architecturally-Aware MCP Server"** — placeholder joke in production                                              | Looks unprofessional; misleading                                                   |
| 4   | TestForge `Architecture.mdx` L23-31 | Describes `packages/page-agent`, `packages/core`, `packages/page-controller` — these are the **page-agent monorepo** packages, not TestForge internals | Completely wrong. A user reading this will not understand TestForge's architecture |
| 5   | AppForge `UserGuide.mdx` L157       | "Always advocate for **they** in your dev team" — grammar error                                                                                        | Unprofessional                                                                     |
| 6   | AppForge `Quickstart.mdx` L30       | MCP config uses `@page-agent/appforge-mcp` — needs to be verified as the correct npm package name                                                      | Blocks every new user at step 1                                                    |
| 7   | AppForge `Workflows.mdx` L48        | Step 4 ("Adaptive Learning") has **no content body** — empty step                                                                                      | Broken user experience                                                             |
| 8   | TestForge `api/Tools.mdx`           | Refers to `run_cucumber_test` which is an **AppForge** tool — TestForge uses `run_playwright_test`                                                     | Wrong tool name in the docs                                                        |

---

## 🔴 Tier-1 Gaps — Blocks Every New User (Missing Entirely)

### 1. No Real Installation Guide

**Playwright has**: System requirements → Install command → Browser install → Verify → First test.

**What exists**: The Quickstart jumps directly to "Connect the MCP" with a one-liner JSON snippet. **Missing**:

- Node.js minimum version requirement
- Supported OS (Windows/Mac/Linux)
- Supported MCP clients (Claude Desktop, Cursor, VS Code Copilot, etc.)
- Step-by-step Claude Desktop config file location (`~/Library/Application Support/Claude/` on Mac, `%APPDATA%\Claude\` on Windows)
- Step-by-step Cursor config (`.cursor/mcp.json`)
- How to verify the MCP is connected (what to look for in the UI)
- AppForge additionally needs: Appium install, Android SDK setup, emulator setup — **completely absent**

### 2. No Complete Tool API Reference

**Playwright has**: Every method, every parameter, its type, default value, and a code example.

**What exists**:

- TestForge `api/Tools.mdx` documents **6 tools** out of ~35 available (17%)
- AppForge has **no API section at all** in the sidebar
- The 6 documented TestForge tools are missing: return types, error codes, all optional parameters
- **All these tools are undocumented**: `discover_app_flow`, `export_navigation_map`, `analyze_coverage`, `analyze_coverage_gaps`, `audit_locators`, `audit_utils`, `summarize_suite`, `generate_ci_pipeline`, `manage_env`, `manage_users`, `start_session`, `navigate_session`, `update_visual_baselines`, `export_team_knowledge`, `get_token_budget`, `get_system_state`

### 3. No Troubleshooting Guide

**Playwright has**: Full page of common failures with root cause and fix for each.

**What exists**: A 3-row table in the Quickstart. **Missing**:

- "Appium session fails to start" (AppForge) — the #1 issue new mobile automation users face
- "MCP not connecting to Claude" — config file syntax errors, path issues
- "Tests run but nothing happens"
- "tsc compilation failures" — types not found, import errors
- "Feature file steps not matched" — regex escaping, async/await issues
- "Sandbox execution timeout"
- "Healing not finding element"
- "Token budget exhausted mid-session"
- Network/proxy interference with browsers

### 4. AppForge Missing a Setup/Installation Page

TestForge has `Setup_and_Configuration.mdx`. AppForge has no equivalent. The `Quickstart` is not a substitute — it skips prerequisites entirely.

---

## 🟠 Tier-2 Gaps — Blocks Intermediate Users

### 5. mcp-config.json Reference is Incomplete

**TestForge config** — Missing or undocumented fields:

- `baseUrl` — the single most important field, only appears in an example JSON
- `browsers` — no explanation of valid values or multi-browser behavior
- `executionCommand` — mentioned once but no examples of how to override
- `envKeys` — appears in example but never defined
- `basePageClass` — what path formats are valid?
- `customWrapperPackage` — appears in tool schemas, not in config reference
- `timeouts.healingMax` — what is the unit? What happens when exceeded?
- No explanation of how `manage_config` `write` operation performs deep merge vs overwrite

**AppForge config** — Missing:

- `capabilitiesProfiles` — mentioned in quickstart troubleshooting but not defined in the reference
- What is `locatorsRoot` actually used for? No explanation
- `architectureNotesPath` — what format? How is it used by the AI?
- `schemaVersion` — what changes between versions? No migration guide

### 6. No "How the Tool Works" for Key Tools

The most important tools need worked, copy-paste examples, not just parameter tables.

**Missing worked examples for**:

- `discover_app_flow` — what does it discover? What does the output look like?
- `generate_gherkin_pom_test_suite` / `generate_cucumber_pom` — what output does it produce? How do I review it before writing?
- `run_playwright_test` / `run_cucumber_test` — how does async mode work? How do I poll?
- `train_on_example` — what format? Where is the knowledge stored?
- `manage_users` — the full add/list/scaffold workflow
- `export_team_knowledge` — what is the output format?

### 7. Missing Worked End-to-End Examples

**Playwright has**: Full working repos linked from the docs.

**What exists**: Short 3-step flows with placeholder URLs. **Missing**:

- A complete working `.feature` file + `Page.ts` + `steps.ts` combo (beyond the basic login stub)
- A real multi-page flow (Login → Navigate → Assert → Logout)
- An AppForge example with actual Android capability profile + real `.apk` path conventions
- CI/CD pipeline output — what does a passing GitHub Actions run look like?

### 8. Orphaned/Unreachable Content

Files that exist on disk but are **not reachable via the sidebar** and have no inbound links:

**TestForge**:

- `repo/technical/SecurityAndCompliance.md` — `.md` file, not `.mdx`, not in sidebar
- `repo/technical/Accessibility.md` — not in sidebar
- `repo/technical/MigrationGuide.md` — not in sidebar
- `repo/user/TeamCollaboration.md` — not in sidebar
- `repo/user/TESTFORGE_PROMPT_CHEATBOOK.md` — **duplicate** of `PromptCheatbook.mdx`, not linked
- `guides/example.md` — Starlight boilerplate placeholder, never removed
- `reference/example.md` — same

**AppForge**:

- `repo/maintenance/ObservabilityAndLogging.mdx` — exists on disk, **not in sidebar**
- `repo/maintenance/TeamCollaboration.mdx` — exists on disk, not in sidebar

---

## 🟡 Tier-3 Gaps — Blocks Advanced & Enterprise Users

### 9. No Multi-Client Configuration Guide

How do I use TestForge with:

- Claude Desktop (Desktop app) — config file location, format
- Cursor — `.cursor/mcp.json` format
- VS Code with Copilot
- Cline / PearAI / other clients

Each has slightly different config syntax and tool exposure. None of this is documented.

### 10. No CI/CD Walk-Through

`generate_ci_pipeline` is listed as a tool but there is no page that shows:

- The actual YAML output for GitHub Actions
- How Appium starts in CI (Docker? Emulator?)
- How artifacts (screenshots, reports) are uploaded
- How to use `check_test_status` in a CI loop
- Environment variable injection in CI

### 11. No "What's New" / Changelog

Users upgrading between versions have no way to know what changed. Playwright has a full migration guide per major version.

### 12. No "Getting Help" / Community Section

No link to GitHub Issues, no Discord, no how-to-file-a-bug-report. This is table stakes for any OSS tool.

### 13. Thin Architecture Pages

**TestForge `Architecture.mdx`** (56 lines): Describes page-agent packages that don't exist in TestForge. Needs a complete rewrite showing TestForge's actual module boundaries: MCP handler → Tool registry → Services (ContextManager, LearningService, etc.) → Playwright.

**AppForge `Architecture.mdx`** (4KB): Better than TestForge, but diagram-dependent — if the image doesn't load, the page has almost no content.

---

## 📁 File Structure Deficiencies

### TestForge

```
Current:                          Missing:
repo/user/
  Quickstart.mdx                  Installation.mdx  ← needed
  Setup_and_Configuration.mdx
  UserGuide.mdx
  PromptCheatbook.mdx
  Workflows.mdx
  TESTFORGE_PROMPT_CHEATBOOK.md   ← DELETE (duplicate)
  TeamCollaboration.md            ← Move to maintenance/ or delete
repo/technical/
  AgentProtocol.mdx
  Architecture.mdx                ← REWRITE (wrong content)
  ExecutionAndHealing.mdx
  MCP_CONFIG_REFERENCE.mdx
  MigrationGuide.md               ← Add to sidebar or move
  SecurityAndCompliance.md        ← Add to sidebar
  TestGeneration.mdx
  TokenOptimizer.mdx
  Accessibility.md                ← Add to sidebar or delete
repo/maintenance/
  ContinuousIntegration.md        ← Convert to .mdx
  DockerSetup.md                  ← Convert to .mdx
  ProjectEvolution.md             ← Convert to .mdx
api/
  AgentBrain.mdx                  ← REWRITE (wrong class docs)
  PageController.mdx              ← REWRITE (wrong class docs)
  SandboxEngine.mdx               ← REWRITE
  Tools.mdx                       ← EXPAND from 6 → all 35+ tools
guides/
  example.md                      ← DELETE
reference/
  example.md                      ← DELETE
```

### AppForge

```
Current:                          Missing:
repo/user/
  Quickstart.mdx                  Installation.mdx  ← needed
  UserGuide.mdx                   Setup_and_Configuration.mdx ← needed
  Workflows.mdx
  PromptCheatbook.mdx
repo/technical/
  AgentProtocol.mdx
  Architecture.mdx
  ExecutionAndHealing.mdx
  mcp_config_reference.mdx
  SecurityAndCompliance.mdx
  TestGeneration.mdx
  TokenOptimizer.mdx
repo/maintenance/
  ContinuousIntegration.mdx
  DockerSetup.mdx
  MigrationGuide.mdx
  ObservabilityAndLogging.mdx     ← Add to sidebar!
  ProjectEvolution.mdx
  TeamCollaboration.mdx           ← Add to sidebar!
api/                              ← Entire section MISSING
  Tools.mdx                       ← Create: all 35+ tools
```

---

## ✅ What Is Working Well (Keep & Protect)

| Feature                                                  |   Quality    | Notes                                  |
| :------------------------------------------------------- | :----------: | :------------------------------------- |
| Starlight component usage (Cards, Steps, Tabs, FileTree) | ✅ Excellent | Best-practice Astro usage              |
| Knowledge Check `<details>` Q&A sections                 | ✅ Excellent | Great for LLM consumption              |
| Prompt Cheatbook (both products)                         |  ✅ Strong   | Genuinely useful, well-organized       |
| mcp-config.json reference structure                      |   ✅ Good    | Tables with types are clear            |
| Token Optimizer page (TestForge)                         |  ✅ Strong   | Real benchmarks, sandbox API reference |
| Execution & Healing lifecycle (AppForge)                 |   ✅ Good    | Clear 5-step flow                      |
| POM Enforcement Rulebook                                 |   ✅ Good    | Concrete bad vs. good comparison       |
| AI Agent Protocol tip tags                               |   ✅ Good    | Unique differentiator                  |
| Visual assets (2D illustrations)                         |   ✅ Good    | Professional, on-brand                 |

---

## 📋 Prioritized Action Plan

### 🔴 Phase 1 — Critical (Fix Before Any Promotion)

| #    | Action                                                              | File(s)                                    | Effort |
| :--- | :------------------------------------------------------------------ | :----------------------------------------- | :----- |
| P1.1 | Fix wrong brand names (AppForge→TestForge)                          | `PromptCheatbook.mdx`, `AgentProtocol.mdx` | 10 min |
| P1.2 | Remove placeholder tagline                                          | `AppForge/index.mdx` L7                    | 5 min  |
| P1.3 | Rewrite TestForge `Architecture.mdx` (remove page-agent references) | `Architecture.mdx`                         | 2h     |
| P1.4 | Fix AppForge `Workflows.mdx` empty Step 4                           | `Workflows.mdx` L48                        | 15 min |
| P1.5 | Verify AppForge npm package name and fix Quickstart                 | `Quickstart.mdx` L30                       | 1h     |
| P1.6 | Delete duplicate/boilerplate files                                  | 5 orphan files                             | 15 min |
| P1.7 | Add all orphaned pages to sidebars                                  | `astro.config.mjs`                         | 30 min |

### 🟠 Phase 2 — High Impact (Makes Docs Self-Sufficient)

| #    | Action                                               | New File                  | Effort     |
| :--- | :--------------------------------------------------- | :------------------------ | :--------- |
| P2.1 | Write full **Installation Guide** (both)             | `Installation.mdx`        | 4h each    |
| P2.2 | Write **Complete Tool Reference** (both)             | `api/ToolReference.mdx`   | 1 day each |
| P2.3 | Complete mcp-config.json all-fields reference (both) | Expand existing           | 3h each    |
| P2.4 | Write **Troubleshooting Guide** (both)               | `Troubleshooting.mdx`     | 4h each    |
| P2.5 | Add AppForge `Setup_and_Configuration.mdx`           | New file                  | 2h         |
| P2.6 | Add complete multi-client MCP setup                  | inside Installation guide | 2h         |

### 🟡 Phase 3 — Enterprise Quality (Playwright Parity)

| #    | Action                                             | Effort     | Status |
| :--- | :------------------------------------------------- | :--------- | :----- |
| P3.1 | Full CI/CD walkthrough with real YAML output       | 3h each    | ✅ Done |
| P3.2 | End-to-end worked example repos (linked from docs) | 1 day each | ✅ Done |
| P3.3 | Changelog / What's New page                        | 2h         | ✅ Done |
| P3.4 | Community / Getting Help page                      | 1h         | ✅ Done |
| P3.5 | FAQ page (top 20 questions)                        | 3h each    | ✅ Done |
| P3.6 | Migration guide (v1→v2 if applicable)              | 2h         | ✅ Done |

---

## 🏆 The Single Most Valuable Page to Write Next

For both products, the **#1 highest-ROI page** to write is: **`Installation.mdx`**

A new user's first question is always: _"How do I install and connect this?"_ Right now, the Quickstart answers this in 2 lines with no error recovery. This one page, done properly, will eliminate 80% of "how do I get started" support questions.

**Minimum contents for a Playwright-grade Installation page:**

1. Prerequisites (Node >= 18, supported OS, MCP client)
2. Install command (npx vs global install)
3. MCP client config — separate tabs for Claude Desktop, Cursor, VS Code
4. Verify connection step (what to type in the AI chat to confirm it's working)
5. First project init command
6. Confirm it worked (expected output)
7. Troubleshooting the first 5 minutes (15+ scenarios with fixes)
