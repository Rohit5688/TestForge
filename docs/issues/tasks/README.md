# TestForge MCP Action Plan

> 🛑 **DEVELOPMENT STATUS: ON HOLD** — TestForge hardening is documented but paused. All tiers below are planned. Tier 7 tasks are the highest value quick-wins when development resumes, as they come directly from the Skills/reference guide.

This directory encapsulates the finalized execution roadmap for the TestForge Architectural Hardening project. This structure mirrors the proven AppForge hardening sequence, translating high-level goals into granular, token-friendly, and stable operations.

## How to Start a New Chat Session for Any Task

Paste this as your opening message in a new chat:

```
Read the task file at:
c:\Users\Rohit\mcp\TestForge\docs\issues\tasks\TASK-XX-name.md

Follow the instructions exactly. Make only the changes described.
Run npm run build in c:\Users\Rohit\mcp\TestForge after making changes.
Mark the task DONE when the build passes.
```

---

## Execution Rules

1. **Atomic P0 Execution**: Do not move to the next task until the current one establishes a stable, tested build.
2. **Sequential Progress**: Execute tasks strictly sequentially to maintain dependency chains.
3. **No-Regression Promise**: Run `npm run build` before exiting any task to prevent compounding runtime errors.
4. **🚨 Testing Protocol (Mandatory from TASK-26 onward)**:
   - `npm test` must pass with zero failures before marking any task DONE
   - Coverage must remain ≥ 90% (lines/functions/statements)
   - New code written in a task requires new test cases in `src/tests/`
   - If modifying a service with no test file, create one as part of that task

---

## 🔴 Tier 1: Security & Integrity (Foundation)

| #      | Task File                                         | What It Fixes                                       | Effort |
| :----- | :------------------------------------------------ | :-------------------------------------------------- | :----- |
| **01** | [TASK-01](./TASK-01-config-deep-merge.md) ✅ DONE | Deep merge data loss bug in `McpConfigService.ts`   | Small  |
| **02** | [TASK-02](./TASK-02-command-injection-audit.md)   | Shell `exec(string)` → `execFile`/`spawn` arrays    | Small  |
| **03** | [TASK-03](./TASK-03-defensive-boundary-fdr.md)    | Wrap `ts-morph` AST parsers in `try/catch` per file | Small  |

---

## 🔵 Tier 2: Core Platform Consistency

| #      | Task File                                              | What It Fixes                                                                                  | Effort |
| :----- | :----------------------------------------------------- | :--------------------------------------------------------------------------------------------- | :----- |
| **04** | [TASK-04](./TASK-04-mcpconfig-interface-expansion.md)  | Add `playwrightConfig`, `tsconfigPath`, `dirs`, `browsers`, `envKeys` to `McpConfig` interface | Small  |
| **05** | [TASK-05](./TASK-05-normalise-tool-inputs.md)          | Dual-field JSON tool descriptions (`toolAction`, `toolSummary`)                                | Small  |
| **06** | [TASK-06](./TASK-06-testforge-error-implementation.md) | Structured `TestForgeError` exceptions; session-prerequisite gates                             | Small  |

> ⚠️ TASK-04 must be done before TASK-21. All command construction depends on typed config fields.

---

## 🟢 Tier 3: Path Enforcement, Allowlisting & Command Construction

| #      | Task File                                          | What It Fixes                                                                                           | Effort |
| :----- | :------------------------------------------------- | :------------------------------------------------------------------------------------------------------ | :----- |
| **07** | [TASK-07](./TASK-07-validate-write-allowlist.md)   | `validate_and_write` allowlist from `config.dirs` (not hardcoded)                                       | Small  |
| **08** | [TASK-08](./TASK-08-fix-scanner-paths.md)          | Reroute `analyze_codebase`, `summarize_suite` to configured dirs                                        | Small  |
| **09** | [TASK-09](./TASK-09-wrapper-package-resolution.md) | `customWrapperPackage` via `require.resolve({ paths: [projectRoot] })`                                  | Small  |
| **17** | TASK-17-bdd-config-detection.md                    | `CodebaseAnalyzerService` checks `config.playwrightConfig` for BDD detection                            | Small  |
| **19** | TASK-19-audit-locators-pagesroot.md                | `audit_locators` defaults `pagesRoot` from `config.dirs.pages`                                          | Small  |
| **21** | [TASK-21](./TASK-21-command-construction.md)       | Fix `bddgen --config`, `playwright test --config --tsconfig`, env file loading per `currentEnvironment` | Medium |
| **22** | TASK-22-check-environment-config-aware.md          | `check_environment` uses `config.playwrightConfig`, `config.envKeys.baseUrl`, `config.browsers`         | Small  |

> ⚠️ **TASK-21 is the highest everyday-usage impact**. Run after TASK-04 (needs typed config).  
> ⚠️ TASK-02 and TASK-21 both modify `TestRunnerService.ts` — do TASK-02 first, then TASK-21.

---

## 🟡 Tier 4: Setup & Upgrade Experience

| #      | Task File                                      | What It Fixes                                                                                        | Effort |
| :----- | :--------------------------------------------- | :--------------------------------------------------------------------------------------------------- | :----- |
| **10** | [TASK-10](./TASK-10-setup-project-twophase.md) | Two-phase `setup_project`: config template first, scaffold second                                    | Medium |
| **11** | [TASK-11](./TASK-11-incremental-upgrade.md)    | Intelligent `upgrade_project` config-diff loop                                                       | Medium |
| **12** | [TASK-12](./TASK-12-dynamic-env-user-store.md) | User Store synced to `manage_users` + `authStrategy` config                                          | Medium |
| **18** | TASK-18-env-key-reporting.md                   | `analyze_codebase` populates `envConfig.keys` from actual `.env` file contents                       | Small  |
| **23** | TASK-23-base-url-auto-resolve.md               | Auto-resolve `baseUrl` from `.env[config.envKeys.baseUrl]` in 3 tool handlers                        | Small  |
| **24** | TASK-24-browser-install-from-config.md         | `setup_project` and `upgrade_project` install only `config.browsers`, not hardcoded chromium+firefox | Small  |

---

## 🟣 Tier 5: Deep Discovery Engine

| #      | Task File                                         | What It Fixes                                                        | Effort |
| :----- | :------------------------------------------------ | :------------------------------------------------------------------- | :----- |
| **13** | [TASK-13](./TASK-13-lockfile-import-trace.md)     | Lockfile + `import` trace for transitive framework detection         | Medium |
| **14** | [TASK-14](./TASK-14-bdd-standardisation.md)       | `createBdd()` pattern + POM style from config                        | Small  |
| **15** | [TASK-15](./TASK-15-self-heal-classifications.md) | Extended self-heal classifications (hidden element, overlay, scroll) | Small  |
| **16** | [TASK-16](./TASK-16-caching-layer.md)             | `.testforge-cache.json` mtime-keyed acceleration                     | Medium |

---

## ⭐ Tier 6: Cross-Cutting Concerns (Run After Each Tier)

| #      | Task File                                            | What It Fixes                                                            | Applies To | Effort |
| :----- | :--------------------------------------------------- | :----------------------------------------------------------------------- | :--------- | :----- |
| **25** | [TASK-25](./TASK-25-project-extensions-wiring.md)    | `projectExtensions` ExtensionLoader utility + wiring into 5 services     | TestForge  | Medium |
| **26** | [TASK-26](./TASK-26-test-coverage-infrastructure.md) | c8 coverage infrastructure, 90% threshold, 5 missing baseline test files | Both repos | Medium |
| **27** | [TASK-27](./TASK-27-docs-audit-update.md)            | Audit and update all outdated docs in both repos after each tier         | Both repos | Medium |

> ⚠️ TASK-26 should be done **immediately after Tier 1** to establish the coverage baseline.
> TASK-27 should be done **after each tier** (not just once at the end) to prevent drift.
> TASK-25 can be done after TASK-04 (depends on interface being typed).

---

## ⚪ Tier 7: MCP SDK Modernization (Skills-Derived, Start Here When Resuming)

These tasks come directly from the `Skills/reference/node_mcp_server.md` guide. They are architectural modernizations that improve tool discoverability, context safety, and LLM quality measurement. **Do these first when development resumes** — they are independent of the Tier 1–6 security chain.

| #      | Task File                                                   | What It Does                                                                         | Effort | Depends On |
| :----- | :---------------------------------------------------------- | :----------------------------------------------------------------------------------- | :----- | :--------- |
| **28** | [TASK-28](./TASK-28-sdk-migration-register-tool.md)         | Migrate all 30+ tools from deprecated `setRequestHandler` to `server.registerTool()` | Large  | None       |
| **29** | [TASK-29](./TASK-29-tool-annotations-structured-content.md) | Add annotations per tool + `structuredContent` on JSON-returning tools               | Small  | TASK-28    |
| **30** | [TASK-30](./TASK-30-character-limit-truncation.md)          | Add 25k `CHARACTER_LIMIT` truncation to 5 large-output tools                         | Small  | None       |
| **31** | [TASK-31](./TASK-31-evaluation-harness.md)                  | Create `evaluation.xml` + `evaluation.py` baseline accuracy run                      | Medium | None       |

> 🔗 TASK-29 depends on TASK-28. TASK-30 and TASK-31 are independent.

## What Each Task Fixes (User-Facing Impact)

| Task   | Problem Fixed                                                                                                                            |
| :----- | :--------------------------------------------------------------------------------------------------------------------------------------- |
| 01 ✅  | Updating one nested config key silently deleted all sibling keys                                                                         |
| 02     | `tags` like `@smoke && rm -rf /` could execute as shell commands                                                                         |
| 03     | One malformed `.ts` file aborted the entire `analyze_codebase` call                                                                      |
| 04     | Typed interface missing `playwrightConfig`, `tsconfigPath`, `dirs`, `browsers` — forced `as any` casts                                   |
| 05     | Tool calls lacked structured `toolAction`/`toolSummary` for LLM routing                                                                  |
| 06     | `verify_selector` with no active session returned a raw 500 stack trace                                                                  |
| 07     | `validate_and_write` rejected files in custom directories like `src/tests/`                                                              |
| 08     | `summarize_suite` always looked in `/features` even if features were elsewhere                                                           |
| 09     | Scoped packages (`@myorg/helpers`) and monorepo symlinks weren't resolved                                                                |
| 10     | `setup_project` failed on ANY project that had `package.json` already                                                                    |
| 11     | `upgrade_project` ignored newly added config fields — no incremental scaffolding                                                         |
| 12     | `manage_users` always created `admin/standard/readonly` ignoring project strategy                                                        |
| 13     | `customize_wrapper` only saw direct deps — missed transitive framework usage                                                             |
| 14     | Generated code always used `createBdd(test)` — broke projects using `createBdd()`                                                        |
| 15     | Hidden elements and overlays returned generic "SCRIPTING" classification                                                                 |
| 16     | `analyze_codebase` rescanned all AST every call — slow on large repos                                                                    |
| 17     | BDD detection returned false on projects with non-root playwright config                                                                 |
| 18     | `analyze_codebase` always returned `envConfig.keys: []` — never parsed `.env`                                                            |
| 19     | `audit_locators` always looked in `/pages` ignoring `config.dirs.pages`                                                                  |
| **21** | **`bddgen` and `playwright test` never received `--config` or `--tsconfig` flags — every non-root config project failed every test run** |
| **22** | **`check_environment` falsely reported FAIL for projects with non-root playwright config**                                               |
| **23** | **Users had to manually type the app URL for every `inspect_page_dom` call despite it being in `.env`**                                  |
| **24** | **`setup_project` always installed Firefox even when `config.browsers: ['chromium']`**                                                   |
| **25** | **Project-specific config files (feature flags, logs, API registries) were never injected into LLM context**                             |
| **26** | **No coverage gate — regressions in service logic went undetected across task sessions**                                                 |
| **27** | **Docs drifted from code — config reference docs had missing fields and wrong defaults**                                                 |
| **28** | All tools use deprecated SDK API — no per-tool annotations, no `structuredContent`, no future compatibility                              |
| **29** | LLM clients cannot cache read-only tools or detect destructive tools without annotations                                                 |
| **30** | `analyze_codebase` and `inspect_page_dom` can return 100k-char dumps that overflow context windows                                       |
| **31** | No automated way to verify Claude can actually use TestForge tools accurately on real tasks                                              |
