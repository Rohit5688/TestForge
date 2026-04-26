# Full Tool Surface Audit — TestForge + AppForge

> Generated via sandbox script. 89 tools analyzed in ~90ms.

---

## Summary

| Server    | Total  | ✅ Clean | ⚠️ Gaps |
| --------- | ------ | -------- | ------- |
| TestForge | 46     | 40       | **6**   |
| AppForge  | 43     | 9        | **34**  |
| **Total** | **89** | **49**   | **40**  |

> AppForge is significantly behind TF on both description format and error contract standardization.

---

## Gap Classification

Three gap types detected:

| Code                     | Meaning                                                                         | Impact                                        |
| ------------------------ | ------------------------------------------------------------------------------- | --------------------------------------------- |
| `desc:N/4`               | Tool description missing TRIGGER/RETURNS/NEXT/COST fields                       | LLM picks wrong tool or uses it at wrong time |
| `OLD:toMcpErrorResponse` | Error returned as content, not thrown — LLM can't programmatically branch on it | Breaks self-healing loop                      |
| `no-structured-block`    | Returns raw text — no `[FAILURES]`, `[WRITE DIFF]`, etc.                        | LLM must parse free text to act               |

---

## TestForge Gaps (6 tools)

| Tool                         | Desc    | Has Block | Error Pattern | Gaps                                                                                       |
| ---------------------------- | ------- | --------- | ------------- | ------------------------------------------------------------------------------------------ |
| `create_test_atomically`     | 4/4     | —         | ⚠️ old        | OLD:toMcpErrorResponse + no-structured-block                                               |
| `get_project_contract`       | 4/4     | —         | none          | no-structured-block (returns `[PROJECT CONTRACT]` but not flagged — likely false positive) |
| `heal_and_verify_atomically` | **1/4** | —         | ⚠️ old        | desc incomplete + OLD error + no block                                                     |
| `inspect_page_dom`           | 4/4     | —         | none          | no-structured-block (has `⚠️ LOCATOR QUALITY WARNINGS` — likely false positive)            |
| `list_existing_steps`        | 4/4     | —         | none          | no-structured-block                                                                        |
| `verify_selector`            | 4/4     | —         | none          | no-structured-block                                                                        |

> [!NOTE]
> `get_project_contract` and `inspect_page_dom` likely false positives — they use custom block labels not in the scan regex. Real TF gaps = **4 tools**.

---

## AppForge Gaps (34 tools)

### 🔴 Critical — Desc broken + OLD error pattern

| Tool                         | Desc | Error  | Notes                        |
| ---------------------------- | ---- | ------ | ---------------------------- |
| `check_appium_ready`         | 0/4  | throw  | No description format at all |
| `generate_test_data_factory` | 0/4  | ⚠️ old | No format + old error        |
| `get_session_health`         | 0/4  | none   | No format                    |
| `get_token_budget`           | 0/4  | none   | No format                    |
| `inject_app_build`           | 0/4  | none   | No format                    |
| `migrate_test`               | 0/4  | ⚠️ old | No format + old error        |
| `request_user_clarification` | 0/4  | ⚠️ old | No format + old error        |
| `set_credentials`            | 0/4  | none   | No format                    |
| `setup_project`              | 0/4  | throw  | No format                    |

### 🟡 Medium — OLD error pattern (description ok)

| Tool                   | Desc | Notes                             |
| ---------------------- | ---- | --------------------------------- |
| `analyze_coverage`     | 4/4  | OLD:toMcpErrorResponse            |
| `diff_ui_state`        | 4/4  | OLD:toMcpErrorResponse            |
| `export_bug_report`    | 4/4  | OLD:toMcpErrorResponse            |
| `get_device_context`   | 4/4  | OLD:toMcpErrorResponse            |
| `inspect_ui_hierarchy` | 4/4  | OLD:toMcpErrorResponse            |
| `navigate_to_screen`   | 4/4  | OLD:toMcpErrorResponse + no block |
| `start_appium_session` | 4/4  | OLD:toMcpErrorResponse + no block |

### 🟠 Low — Desc incomplete only

| Tool                         | Desc | Notes                         |
| ---------------------------- | ---- | ----------------------------- |
| `analyze_codebase`           | 1/4  | Add TRIGGER/RETURNS/NEXT/COST |
| `audit_utils`                | 1/4  | Add format                    |
| `check_test_status`          | 1/4  | Add format                    |
| `create_test_atomically`     | 2/4  | Partial — finish format       |
| `end_appium_session`         | 1/4  | Add format                    |
| `export_navigation_map`      | 1/4  | Add format                    |
| `export_team_knowledge`      | 1/4  | Add format                    |
| `extract_navigation_map`     | 1/4  | Old duplicate of export?      |
| `heal_and_verify_atomically` | 2/4  | Partial                       |
| `manage_users`               | 1/4  | Add format                    |
| `verify_selector`            | 1/4  | Add format                    |

### ⚪ Structural / No Block (returns raw text with try/catch)

| Tool                         | Notes                                      |
| ---------------------------- | ------------------------------------------ |
| `create_test_atomically`     | Should return `[WRITE DIFF]` equivalent    |
| `execute_sandbox_code`       | Returns raw JSON — block could help signal |
| `heal_and_verify_atomically` | Should return `[HEAL RESULT]` block        |
| `manage_config`              | Returns raw text — ok for read ops         |
| `manage_users`               | Returns raw text                           |
| `navigate_to_screen`         | Should confirm screen reached              |
| `repair_project`             | Returns raw list — low priority            |
| `self_heal_test` (AF)        | Should return `[HEAL INSTRUCTION]` block   |
| `start_appium_session`       | Should confirm `[SESSION STARTED]`         |
| `summarize_suite`            | Returns raw text — low priority            |
| `upgrade_project`            | Returns raw list — low priority            |
| `validate_and_write` (AF)    | Missing `[WRITE DIFF]` that TF has         |

---

## Priority Action Plan

### P1 — HIGH (breaks self-healing loop)

1. **AF `validate_and_write`**: Add `[WRITE DIFF]` + `[REJECTION]` blocks (copy from TF)
2. **AF `heal_and_verify_atomically`**: Fix desc (2/4) + migrate old error to `throw McpErrors`
3. **AF `self_heal_test`**: Add `[HEAL INSTRUCTION]` block, fix old error pattern
4. **AF `start_appium_session`**: Add `[SESSION STARTED]` block + fix old error
5. **TF `heal_and_verify_atomically`**: Fix desc (1/4) + fix old error pattern

### P2 — MEDIUM (LLM picks wrong tool / misreads output)

6. **AF desc 0/4 tools** (9 tools): Add TRIGGER/RETURNS/NEXT/COST to `check_appium_ready`, `get_session_health`, `get_token_budget`, `inject_app_build`, `migrate_test`, `request_user_clarification`, `set_credentials`, `setup_project`, `generate_test_data_factory`
7. **AF old error pattern** (desc=4/4 tools): Migrate `analyze_coverage`, `diff_ui_state`, `export_bug_report`, `navigate_to_screen`

### P3 — LOW (polish)

8. **AF desc 1/4 tools**: Update remaining 11 tools with partial descriptions
9. **`extract_navigation_map`**: Investigate if duplicate of `export_navigation_map` — possible dead code

---

## Clean Tools (no action needed)

**TF (40 clean):** analyze_codebase, analyze_coverage, analyze_coverage_gaps, analyze_trace, audit_locators, audit_utils, check_environment, check_playwright_ready, discover_app_flow, execute_sandbox_code, export_bug_report, export_jira_bug, export_navigation_map, export_team_knowledge, gather_test_context, generate_ci_pipeline, generate_gherkin_pom_test_suite, generate_test_data_factory, get_flaky_selectors, get_system_state, get_token_budget, manage_config, manage_env, manage_users, migrate_test, navigate_session, repair_project, request_user_clarification, run_playwright_test, scan_structural_brain, self_heal_test, setup_project, start_session, suggest_refactorings, summarize_suite, train_on_example, update_visual_baselines, upgrade_project, validate_and_write, workflow_guide

**AF (9 clean):** audit_mobile_locators, check_environment, generate_ci_workflow, generate_cucumber_pom, run_cucumber_test, scan_structural_brain, suggest_refactorings, train_on_example, workflow_guide
