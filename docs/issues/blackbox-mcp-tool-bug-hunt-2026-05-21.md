# Black-Box MCP Tool Bug Hunt - 2026-05-21

## Scope

Goal: exercise TestForge as an MCP end user before fixing code.

Test method:
- MCP server launched through stdio with `node dist/index.js`.
- Tool calls made through `@modelcontextprotocol/sdk` client.
- Real repo source was not edited during this phase.
- Mutating calls targeted a temporary copy of `examples`: `/private/tmp/testforge-mcp-blackbox-TFPMyO`.
- Local fixture site served from the temp copy at `http://127.0.0.1:8765/`.
- Full run artifact: `/private/tmp/testforge-mcp-blackbox-TFPMyO/mcp-blackbox-results.json`.
- Follow-up SauceDemo acceptance project: `/private/tmp/testforge-saucedemo-flow-uPZyrg/project`.
- SauceDemo artifacts:
  - First MCP pass: `/private/tmp/testforge-saucedemo-flow-uPZyrg/saucedemo-mcp-results-first-pass.json`
  - Recovery pass: `/private/tmp/testforge-saucedemo-flow-uPZyrg/saucedemo-mcp-results.json`

Coverage:
- 47 tools exposed by MCP.
- 57 tool calls executed.
- Every exposed tool was called at least once.
- Additional edge calls were made for suspected failure modes: invalid workflow alias, env secret write/read, command override, detached run polling, and browser DOM JSON mode.

Environment caveats:
- The Codex shell sandbox blocks some localhost/network checks unless escalated. The fixture URL returned HTTP 200 outside the sandbox.
- Browser tools could not complete a happy-path DOM scrape because the Playwright browser executable was missing in the active environment.
- `setup_project` and `upgrade_project` can take longer than a 30s MCP request timeout during cold setup.

## Bug Summary

| ID | Severity | Area | Status | Summary |
| --- | --- | --- | --- | --- |
| BB-01 | Critical | Secrets | Fixed | `manage_env` echoed real secret values on write and read. |
| BB-02 | Critical | Secrets | Fixed | `manage_users list` returned full credential objects, including password fields. |
| BB-03 | High | Execution | Fixed | `run_playwright_test` reported `0 passed, 0 failed` as success. |
| BB-04 | High | Execution | Fixed | Detached run polling reported `0 passed, 0 failed` as `status: "passed"`. |
| BB-05 | High | Execution/Security | Fixed | `run_playwright_test.overrideCommand` accepted arbitrary commands; detached mode executed them through a shell. |
| BB-06 | High | Remote MCP | Confirmed | Streamable HTTP mode prints “listening” and exits immediately. |
| BB-07 | High | Browser/DOM | Fixed | `inspect_page_dom(returnFormat:"json")` reported success and cached context even when DOM inspection failed. |
| BB-08 | High | Setup/Browser | Fixed | `upgrade_project` reported Playwright browsers installed, but browser launch still failed with missing executable. |
| BB-09 | Medium | Browser Session | Fixed | `navigate_session` could null-deref after auto-start failed. |
| BB-10 | Medium | Browser Import | Fixed | Browser tools produced `Error.stackTraceLimit` read-only failure in the full smoke run. |
| BB-11 | Medium | UX/Timeout | Confirmed | `setup_project` / `upgrade_project` can exceed common 30s MCP request timeout without progress. |
| BB-12 | Low | UX | Confirmed | `workflow_guide` rejects intuitive workflow alias `generation`. |
| BB-13 | Low/Env | Environment-sensitive | `check_environment` reported reachable localhost fixture as unreachable inside sandbox. |
| BB-14 | High | Setup/Install | Fixed | `setup_project` could return `installed:false` with no raw install error and leave no `node_modules`. |
| BB-15 | High | Validation/Write | Fixed | `validate_and_write(dryRun:true)` writes files anyway. |
| BB-16 | High | Validation/TS Config | Fixed | Generated path mappings omit `baseUrl`, breaking `tsc` with TS5090. |
| BB-17 | Medium | Scaffold/Execution | Fixed | Scaffolded `features/sample.feature` is tagged `@smoke` but has no step definitions, blocking first test runs. |
| BB-18 | Medium | Execution | Fixed | `run_playwright_test` applies tags/specific args to Playwright only; `bddgen` still processes unrelated broken features. |

## Detailed Findings

### BB-01 - `manage_env` Leaks Secret Values

Severity: Critical

Repro:
```json
manage_env({
  "projectRoot": "/private/tmp/testforge-mcp-blackbox-TFPMyO",
  "action": "write",
  "entries": [
    { "key": "API_TOKEN", "value": "supersecret-token-1234567890" },
    { "key": "BASE_URL", "value": "http://127.0.0.1:8765" }
  ]
})
```

Actual:
```json
{
  "written": [
    "API_TOKEN=supersecret-token-1234567890",
    "BASE_URL=http://127.0.0.1:8765"
  ]
}
```

Follow-up read also returned:
```json
"values": {
  "API_TOKEN": "supersecret-token-1234567890"
}
```

Expected:
- Never return secret values to the MCP client.
- Return keys and redacted values only, e.g. `API_TOKEN=[REDACTED]`.
- `read` should expose key presence, not raw values.

Ripple risk:
- Tool output is sent to the LLM/client transcript.
- Token-budget and observability wrappers may also process the raw output string.

Fix status:
- Fixed in `src/tools/manage_env.ts`.
- Public `manage_env` responses now redact all values and return written key names only.
- Internal `EnvManagerService.read()` still returns raw values for runtime consumers like test execution.
- Regression coverage added in `src/tests/ManageEnvTool.test.ts`.
- Black-box MCP verification confirmed output does not include `supersecret-token-1234567890` or `https://www.saucedemo.com`, while `.env` still stores the token.

Follow-up gap noticed while fixing:
- `manage_env.write` had told users to use an overwrite flag, but the tool schema does not expose one. The message now states that overwrite is not currently exposed.

### BB-02 - `manage_users list` Returns Credential Objects

Severity: Critical

Repro:
```json
manage_users({
  "projectRoot": "/private/tmp/testforge-mcp-blackbox-TFPMyO",
  "action": "list",
  "environment": "staging"
})
```

Actual:
```json
"users": {
  "admin": {
    "username": "admin@yourapp.com",
    "password": "***FILL_IN***",
    "role": "admin"
  }
}
```

Expected:
- `list` should return roles and metadata only, or redact all credential fields.
- Real `users.staging.json` files may contain real usernames/passwords, so this is a leak risk even though the test data had placeholders.

Fix status:
- Fixed in `src/tools/manage_users.ts`.
- Public `manage_users list` responses now return role names, user count, and configured field names only.
- Credential values such as `username`, `password`, and extra metadata values are not returned.
- Internal `UserStoreService.read()` still returns raw values for runtime consumers like `getUser()`.
- Regression coverage added in `src/tests/ManageUsersTool.test.ts`.
- Black-box MCP verification confirmed output does not include `real-admin-password-1234567890`, `admin.person@example.com`, or `Admin Person`.

Follow-up gap noticed while fixing:
- `UserStoreService` supports custom `mcp-config.json` `dirs.testData`, but `UserSecurityManager` hardcodes `.gitignore` entries as `test-data/users.{env}.json`. If a project stores user credentials under a custom test-data directory, the actual credential file may not be gitignored correctly.

### BB-03 - `run_playwright_test` Reports Zero Tests as Success

Severity: High

Repro:
```json
run_playwright_test({
  "projectRoot": "/private/tmp/testforge-mcp-blackbox-TFPMyO"
})
```

Actual:
```text
[SUMMARY] 0 passed, 0 failed ✅

[FAILURES] passed=0 failed=0
```

Expected:
- Zero tests should be a failed or blocked run.
- The tool already has a “NO TESTS RAN” concept in raw runner output, but the final tool response compresses it into success.

Ripple risk:
- Agents will stop after a false green result.
- `LastResultStore` may store the run as passed, preventing healing.

Fix status:
- Fixed in `src/tools/run_playwright_test.ts`.
- The tool response formatter now preserves `NO TESTS RAN` output and appends structured `{ noTestsRan: true }`.
- It no longer emits `[SUMMARY] 0 passed, 0 failed ✅` for zero-test foreground runs.
- Regression coverage added in `src/tests/RunPlaywrightTestTool.test.ts`.
- Black-box MCP verification used a no-test-output command as a harness and confirmed the public tool output contains `NO TESTS RAN` and `"noTestsRan": true`, with no false-green summary.

Follow-up handled while fixing BB-04:
- The shared summary parser now supports Playwright-BDD compact output like `PASS (1) FAIL (0)`.

### BB-04 - Detached Run Polling Reports Zero Tests as Passed

Severity: High

Repro:
```json
run_playwright_test({
  "projectRoot": "/private/tmp/testforge-mcp-blackbox-TFPMyO",
  "overrideCommand": "node -v",
  "detached": true
})
```

Then:
```json
get_test_run_status({
  "projectRoot": "/private/tmp/testforge-mcp-blackbox-TFPMyO",
  "runId": "<returned runId>"
})
```

Actual:
```json
{
  "status": "passed",
  "passed": 0,
  "failed": 0,
  "failures": []
}
```

Expected:
- Detached status parsing should share the same zero-test guard as foreground execution.
- A command that is not Playwright output should not become a passed test run.

Fix status:
- Fixed in `src/tools/get_test_run_status.ts`.
- Detached polling now uses the same summary parser as foreground `run_playwright_test`.
- Completed logs with no recognized test counts return `status: "failed"` and `noTestsRan: true`.
- New detached runs write exit metadata to the `.done` file while still supporting legacy timestamp-only `.done` files.
- Regression coverage added in `src/tests/GetTestRunStatusTool.test.ts`.
- Black-box MCP verification started a detached `node -v` run and confirmed polling returned `status: "failed"`, `passed: 0`, `failed: 0`, and `noTestsRan: true`.

Compatibility note:
- The shared parser now recognizes Playwright-BDD compact output such as `PASS (1) FAIL (0)`, which helps custom/gold-repo npm scripts report correctly without changing `executionCommand` behavior.

### BB-05 - Arbitrary `overrideCommand` Is Accepted

Severity: High

Repro:
```json
run_playwright_test({
  "projectRoot": "/private/tmp/testforge-mcp-blackbox-TFPMyO",
  "overrideCommand": "node -v"
})
```

Actual:
- Tool accepted and executed the command.
- Response then hit BB-03 and reported `0 passed, 0 failed ✅`.

Expected:
- Tool should either remove `overrideCommand` from public schema or restrict it to configured package scripts / allowlisted runners.
- Detached mode is especially risky because it executes a shell string.

Fix status:
- Fixed in `src/tools/run_playwright_test.ts`, `src/services/execution/TestRunnerService.ts`, and `src/utils/CommandPolicy.ts`.
- Public `overrideCommand` is now restricted to package-script invocations that exist in the project `package.json`, e.g. `npm run automated-test` or `npm run gold:e2e`.
- The restriction is script-name agnostic: no hardcoded package script names are used, so project-specific/gold-repo scripts remain supported.
- Foreground test execution now honors `mcp-config.json` `executionCommand` when no per-call override is provided.
- Detached execution no longer uses `sh -c`; it spawns the parsed command with argument arrays and passes `TAGS` through `env`.
- Regression coverage added in `src/tests/CommandPolicy.test.ts` and `src/tests/TestRunnerService.test.ts`.
- Black-box MCP verification confirmed `overrideCommand: "node -v"` is blocked, while `npm run automated-test` works through both explicit override and config-driven execution, including detached polling.

Follow-up gap noticed while fixing:
- `TestRunnerService` parsed compact Playwright-BDD output like `PASS (1) FAIL (0)` differently than detached status parsing. This is now aligned so custom package scripts do not get mislabeled as `NO TESTS RAN`.

### BB-06 - Streamable HTTP Mode Exits Immediately

Severity: High

Repro:
```bash
node dist/index.js --port 3311 --host 127.0.0.1
```

Actual:
```text
[TestForge] Remote HTTP listening on http://127.0.0.1:3311/mcp
```

Then the process exits with code 0, so the endpoint is not actually available.

Expected:
- Process should stay alive and serve `/mcp`.
- Streamable HTTP mode should support at least initialize/listTools/callTool lifecycle.

### BB-07 - `inspect_page_dom` JSON Mode Reports Success After Failure

Severity: High

Repro, with browser executable missing:
```json
inspect_page_dom({
  "projectRoot": "/private/tmp/testforge-mcp-blackbox-TFPMyO",
  "url": "http://127.0.0.1:8765/",
  "returnFormat": "json"
})
```

Actual:
```text
✅ Page DOM inspected and cached in JSON format for project: /private/tmp/testforge-mcp-blackbox-TFPMyO.
You can now call generate_gherkin_pom_test_suite without passing domJsonContext.
```

But `returnFormat:"yaml"` for the same URL returned a browser launch error.

Expected:
- If DOM inspection returns an error string, JSON mode should not cache it and should not claim success.
- The tool should return a clear error result.

Ripple risk:
- Generation may use cached error text as DOM context and produce bad tests.

Fix status:
- Fixed in `src/tools/inspect_page_dom.ts`.
- Failed DOM inspections returned by `DomInspectorService` as `[ERROR] ...` now return an MCP error result before context recording or JSON cache writes.
- JSON mode no longer emits the “inspected and cached” success message for failed inspections.
- Regression coverage added in `src/tests/InspectPageDomTool.test.ts`, including a handler-level check that failed JSON inspection does not write `domInspectionCache` or record a scan.
- Black-box MCP verification confirmed `inspect_page_dom({ returnFormat: "json" })` against an unreachable target returns `isError: true`, includes `[ERROR]`, and does not claim cached success.

### BB-08 - `upgrade_project` Claims Browsers Installed But Launch Fails

Severity: High

Repro:
```json
upgrade_project({ "projectRoot": "/private/tmp/testforge-mcp-blackbox-TFPMyO" })
```

Actual upgrade output included:
```text
✅ playwright-bdd updated to latest (includes @playwright/test as a peer).
✅ Playwright browsers installed.
```

Retest:
```json
start_session({ "operation": "start", "headless": true })
```

Actual:
```text
Failed to start session: browserType.launch: Executable doesn't exist at
/Users/rsakhawalkar/Library/Caches/ms-playwright/chromium_headless_shell-1223/...
Please run: npx playwright install
```

Expected:
- `upgrade_project` should only claim browser install success after verifying launchable browser binaries.
- If install fails or is skipped, return a warning/blocker with exact command.

Fix status:
- Fixed in `src/services/setup/ProjectMaintenanceService.ts`.
- Browser install success is now only reported after a real Chromium launch verification using the same Playwright runtime MCP browser tools use.
- Existing local browser caches are launch-verified before skipping reinstall; stale/unlaunchable caches trigger a reinstall attempt.
- If browser install is skipped or launch verification fails, `upgrade_project` returns a warning plus the exact repair command: `npx playwright install chromium firefox --with-deps`.
- Regression coverage added in `src/tests/ProjectMaintenanceService.test.ts`.
- Black-box MCP verification forced a missing-browser environment and confirmed `upgrade_project` returned the launch verification failure and fix command without the old false `✅ Playwright browsers installed.` claim.

### BB-09 - `navigate_session` Null-Derefs After Auto-Start Failure

Severity: Medium

Repro:
```json
navigate_session({
  "url": "http://127.0.0.1:8765/",
  "projectRoot": "/private/tmp/testforge-mcp-blackbox-TFPMyO"
})
```

Actual:
```json
{
  "success": false,
  "error": "Failed to navigate to http://127.0.0.1:8765/: Cannot read properties of null (reading 'goto')"
}
```

Expected:
- If auto-start fails, return the start-session failure directly.
- Do not continue to `page.goto` with a null page.

Fix status:
- Fixed in `src/services/execution/PlaywrightSessionService.ts`.
- `navigate()` now checks the auto-start result and returns the start-session failure directly when browser startup fails.
- Added a defensive guard for the unexpected case where auto-start reports success but no page was created.
- Regression coverage added in `src/tests/PlaywrightSessionService.test.ts`.
- Black-box MCP verification forced a missing-browser environment and confirmed `navigate_session` returned `Failed to start session...` without the old `Cannot read properties of null (reading 'goto')` message.

### BB-10 - Browser Tools Hit `Error.stackTraceLimit` Failure

Severity: Medium

Observed in full smoke run before later browser retest:
```text
Cannot assign to read only property 'stackTraceLimit' of function 'function Error() { [native code] }'
```

Affected calls:
- `inspect_page_dom_yaml`
- `gather_test_context`
- `start_session`
- `discover_app_flow`

Expected:
- Startup patch should prevent this consistently.

Note:
- Later retest reached a different blocker: missing Playwright browser executable. This should be retested after browser install is fixed.

Fix status:
- Fixed in `src/utils/PlaywrightRuntime.ts`, `src/services/dom/DomInspectorService.ts`, `src/services/dom/TestContextGathererService.ts`, `src/services/app-flow/LiveCrawlerSession.ts`, `src/services/execution/PlaywrightSessionService.ts`, and `src/services/setup/ProjectMaintenanceService.ts`.
- Root cause: several browser services had top-level runtime imports from `playwright`. In ESM, those imports can execute before the startup patch in `index.ts`, so the guard was not reliable.
- Browser services now use a shared lazy `importPlaywright()` helper that makes `Error.stackTraceLimit` writable immediately before loading Playwright.
- Runtime `playwright` imports at module top-level were removed from browser tool paths; only type-only imports remain.
- Regression coverage added in `src/tests/PlaywrightRuntime.test.ts`.
- Black-box MCP verification started the server with a preload script that made `Error.stackTraceLimit` read-only before startup, then exercised `start_session`, `navigate_session`, `inspect_page_dom`, `gather_test_context`, and `discover_app_flow`. The server stayed up and returned browser-install errors, with no `stackTraceLimit` failure.

### BB-11 - Setup/Upgrade Can Exceed Common MCP Timeout

Severity: Medium

Full smoke with a 30s MCP timeout:
- `upgrade_project`: request timeout.
- `setup_project`: request timeout.

Targeted retest with 120s timeout:
- `upgrade_project`: succeeded in ~20s.
- `setup_project`: succeeded in <1s after warm setup.

Expected:
- Long-running setup tools should either complete within typical client timeouts, support detached/progress mode, or return an early actionable plan.

### BB-12 - `workflow_guide` Rejects Intuitive Alias

Severity: Low

Repro:
```json
workflow_guide({ "workflow": "generation" })
```

Actual:
```text
Invalid option: expected one of "new_project"|"write_test"|"run_and_heal"|"debug_flaky"|"all"
```

Expected:
- Either accept common aliases like `generation`, `write`, `healing`, or include alias guidance in the tool description/error.

### BB-13 - `check_environment` Localhost Reachability Is Environment-Sensitive

Severity: Low / needs retest outside sandbox

Repro:
```json
check_environment({
  "projectRoot": "/private/tmp/testforge-mcp-blackbox-TFPMyO",
  "baseUrl": "http://127.0.0.1:8765"
})
```

Actual:
```text
BASE_URL "http://127.0.0.1:8765" is not reachable. Should we update it?
```

But external verification of the same fixture returned HTTP 200 when run outside the sandbox.

Expected:
- In normal user environments, localhost should be reachable.
- If sandbox/network policy blocks the check, the tool should distinguish “network denied” from “app unreachable” if possible.

### BB-14 - `setup_project` Hides Dependency/Browser Install Failures

Severity: High

SauceDemo flow repro:
```json
setup_project({ "projectRoot": "/private/tmp/testforge-saucedemo-flow-uPZyrg/project" })
```

Actual first cold setup:
```json
{
  "phase": 2,
  "status": "SETUP_COMPLETE",
  "installed": false,
  "message": "⚠️ Package install skipped (node_modules already present or install failed)"
}
```

But `node_modules` did not exist and `npm ls --depth=0` showed every dependency as missing.

Observed recovery:
- Direct `npm install` succeeded.
- Direct `npx playwright install chromium firefox --with-deps` succeeded.
- `upgrade_project` later reported the raw npm/browser failure, but `setup_project` did not.

Expected:
- Do not report `SETUP_COMPLETE` when dependencies are missing.
- Return the failed command, exit code, and compact stderr.
- Split status into dependency install vs browser install, e.g. `{ npmInstalled, browsersInstalled }`.

Fix status:
- Fixed in `src/utils/DependencyManager.ts` and `src/services/setup/ProjectSetupService.ts`.
- `DependencyManager` now returns structured install diagnostics while preserving the old boolean wrapper for compatibility.
- `setup_project` now returns `status: "SETUP_BLOCKED"` when npm/browser install fails, not `SETUP_COMPLETE`.
- Setup output now includes `installDetails: { success, npmInstalled, browsersInstalled, steps[] }`, where each step includes command, exit code, stderr/stdout snippets, and skipped state.
- Browser install is reported separately from npm install; browser install is skipped with an explicit reason if npm install fails.
- Regression coverage added in `src/tests/DependencyManager.test.ts` and `src/tests/ProjectSetupService.test.ts`.
- Black-box MCP verification used a broken local `file:` dependency and confirmed `setup_project` returned `SETUP_BLOCKED`, `npmInstalled:false`, `browsersInstalled:false`, failed command `npm install`, exit code/error details, no old vague install message, and no `node_modules`.

### BB-15 - `validate_and_write(dryRun:true)` Writes Files Anyway

Severity: High

Repro:
```json
validate_and_write({
  "projectRoot": "/private/tmp/testforge-saucedemo-flow-uPZyrg/project",
  "dryRun": true,
  "files": [
    { "path": "features/saucedemo-login.feature", "content": "..." },
    { "path": "pages/SauceLoginPage.ts", "content": "..." },
    { "path": "step-definitions/saucedemo-login.steps.ts", "content": "..." }
  ]
})
```

Actual response:
```text
[DRY RUN] Validation ✅ passed. Nothing written to disk.
```

Actual filesystem:
- `features/saucedemo-login.feature` existed.
- `pages/SauceLoginPage.ts` existed.
- `step-definitions/saucedemo-login.steps.ts` existed.
- `list_existing_steps` then found the new step definitions.

Expected:
- Dry run must never write generated files, mutate `.mcp-manifest.json`, mutate `tsconfig.json`, or run tests.
- Validation should stage in temp only and return the prospective diff.

Fix status:
- Fixed in `src/tools/validate_and_write.ts` and `src/services/io/FileWriterService.ts`.
- `dryRun:true` now validates through temp staging before the normal atomic write path and returns a preview without calling `createTestAtomically`.
- Dry-run no longer invokes the test runner, writes generated files, creates parent directories, saves `.mcp-manifest.json`, or mutates `tsconfig.json`.
- Regression coverage added in `src/tests/ValidateAndWriteTool.test.ts`, including handler-level checks that dry-run bypasses the atomic writer and runner.
- Black-box MCP verification confirmed `validate_and_write({ dryRun:true })` returns a dry-run preview while leaving the target feature file, parent directory, manifest, and `tsconfig.json` untouched.

Follow-up gap noticed while fixing:
- `OrchestrationService.createTestAtomically()` calls `stageAndValidate()` but does not clean up the successful staging directory it receives. This is not a dry-run write bug, but it can leak temp directories during normal writes.

### BB-16 - Path Mapping Mutation Breaks TypeScript

Severity: High

After `validate_and_write(dryRun:true)`, `tsconfig.json` contained:
```json
"paths": {
  "features/*": ["features/*"],
  "pages/*": ["pages/*"],
  "step-definitions/*": ["step-definitions/*"]
}
```

But no `baseUrl` was added.

Actual:
```text
tsconfig.json(...): error TS5090: Non-relative paths are not allowed when 'baseUrl' is not set.
```

Expected:
- If adding `compilerOptions.paths`, also add `"baseUrl": "."`.
- Prefer not mutating `tsconfig.json` during dry runs.

Fix status:
- Fixed in `src/utils/TsConfigManager.ts`.
- When TestForge adds or repairs `compilerOptions.paths`, it now adds `"baseUrl": "."` if no local `baseUrl` exists.
- Existing custom `baseUrl` values are preserved.
- Existing `paths` configs missing `baseUrl` are repaired even when the requested mapping already exists.
- Dry-run remains read-only from the BB-15 fix, so `tsconfig.json` is not mutated during dry-run previews.
- Regression coverage added in `src/tests/TsConfigManager.test.ts`.
- Black-box MCP verification confirmed the real `validate_and_write` write path adds `baseUrl: "."`, writes the generated feature, and `tsc --noEmit --project tsconfig.json` completes without TS5090.

Follow-up gap noticed while fixing:
- `validate_and_write` builds `[WRITE DIFF]` after files are written, then checks `fs.existsSync()`, so newly created files are reported as `modified`. The write succeeds, but the diff status is not truthful.

### BB-17 - Scaffolded Sample Feature Blocks First Runs

Severity: Medium

Scaffolded file:
```gherkin
@smoke
Feature: Sample Playwright BDD Test

  Scenario: Verify page loads
    Given I navigate to the home page
    Then the page title should be visible
```

Actual:
```text
npm test -- --project chromium features/saucedemo-login.feature
Missing step definitions:
Given('I navigate to the home page', ...)
Then('the page title should be visible', ...)
```

Expected:
- Either scaffold matching sample steps, omit the sample feature, or avoid tagging it with default runnable tags like `@smoke`.

Fix status:
- Fixed in `src/utils/ProjectScaffolder.ts` and `src/services/setup/ProjectSetupService.ts`.
- The sample feature is now a deterministic `@smoke @setup` TestForge setup smoke test backed by `step-definitions/sample.steps.ts`.
- The sample steps open a `data:` URL and assert the title/heading, so a fresh project can validate the BDD/Playwright wiring before a real app URL is configured.
- `setup_project` and `repair_project` now scaffold the sample steps file when missing without overwriting existing files.
- Regression coverage added in `src/tests/ProjectScaffolder.test.ts` and `src/tests/ProjectSetupService.test.ts`.
- Black-box MCP verification confirmed `setup_project` creates `features/sample.feature` and `step-definitions/sample.steps.ts`; `bddgen` completes without missing-step errors; `playwright test --grep @setup --project chromium --list` lists the setup smoke scenario.

Follow-up gap noticed while fixing:
- `bddgen` emits a non-blocking warning that `defineBddConfig({ importTestFrom })` is no longer needed and suggests including that setup file in the `steps` pattern instead.

### BB-18 - Targeted Runs Do Not Filter `bddgen`

Severity: Medium

`run_playwright_test` appends `tags` / `specificTestArgs` to the Playwright command, but `bddgen` still runs over all features first.

Impact:
- A targeted run for the newly generated SauceDemo feature is blocked by unrelated broken sample features.
- Direct workaround succeeded:
```bash
npx bddgen test --tags @saucedemo
npx playwright test --grep @saucedemo --project chromium
```

Expected:
- When `tags` is supplied, run `bddgen test --tags <expression>` before Playwright.
- When a specific feature is supplied, avoid letting unrelated missing-step features fail generation.

Fix status:
- Fixed in `src/services/execution/TestRunnerService.ts` and `src/tools/run_playwright_test.ts`.
- Tag-filtered runs now pass the tag expression to `bddgen` via `--tags` before appending Playwright `--grep` args.
- Specific `.feature` runs now create a generated temporary Playwright config under `.TestForge/generated-configs/` that narrows the `playwright-bdd` `features` list before `bddgen` runs.
- Custom `executionCommand` / package-script flows remain honored; tag filters are also exposed as `TAGS` in the runner environment for scripts that already use it.
- Regression coverage added in `src/tests/TestRunnerService.test.ts` for tag forwarding, specific feature config generation, and feature-path extraction.
- Black-box MCP verification used one valid target feature and one intentionally broken unrelated feature. Both `tags: "@target"` and `specificTestArgs: "features/target.feature ..."` completed without missing-step errors, and the unrelated broken feature was not generated into `.features-gen`.

Follow-up gap noticed while fixing:
- `run_playwright_test` can still format some zero-test Playwright outputs as `[SUMMARY] 0 passed, 0 failed ✅` when the runner output does not contain the exact `NO TESTS RAN` marker. This is a separate truthfulness gap from BB-03’s original foreground case.

## SauceDemo Acceptance Notes

Target:
- `https://www.saucedemo.com`
- Scenario: login as `standard_user` / `secret_sauce`, verify `Sauce Labs Backpack`.

Generated files in temp project:
- `features/saucedemo-login.feature`
- `pages/SauceLoginPage.ts`
- `step-definitions/saucedemo-login.steps.ts`

After manual recovery and temp-only workarounds:
- `npm install`: passed.
- `npx playwright install chromium firefox --with-deps`: passed.
- Added `"baseUrl": "."` to temp `tsconfig.json`.
- Added `@saucedemo` tag to the generated feature to bypass the scaffolded sample feature.
- `npm run lint`: passed.
- `npx bddgen test --tags @saucedemo`: passed.
- `npx playwright test --grep @saucedemo --project chromium`: passed with `PASS (1) FAIL (0)`.

Interpretation:
- The generated SauceDemo BDD/POM code is viable.
- The public MCP workflow is still not trustworthy end-to-end because setup, dry-run writes, TypeScript config mutation, sample scaffolding, and runner filtering interfere before the test can pass through MCP normally.

## Tool Coverage Notes

Passed/smoked without obvious product bug in this environment:
- `analyze_codebase`
- `analyze_coverage`
- `analyze_coverage_gaps`
- `analyze_trace`
- `audit_locators`
- `audit_utils`
- `check_environment` with caveat BB-13
- `check_playwright_ready` correctly reported missing deps in the temp copy
- `create_test_atomically`
- `execute_sandbox_code`
- `export_bug_report`
- `export_jira_bug`
- `export_navigation_map`
- `export_team_knowledge`
- `generate_ci_pipeline`
- `generate_gherkin_pom_test_suite` preview mode
- `generate_test_data_factory`
- `get_flaky_selectors`
- `get_project_contract`
- `get_system_state`
- `get_token_budget`
- `list_existing_steps`
- `manage_config`
- `migrate_test`
- `repair_project`
- `request_user_clarification`
- `scan_structural_brain`
- `self_heal_test` with browser caveat
- `suggest_refactorings`
- `summarize_suite`
- `train_on_example`
- `verify_selector` with browser caveat
- `workflow_guide` with alias caveat

Not happy-path verified due browser executable blocker:
- `discover_app_flow`
- `gather_test_context`
- `heal_and_verify_atomically`
- `navigate_session`
- `start_session`

Execution tools with remaining confirmed follow-ups:
- `update_visual_baselines`

## Recommended Fix Order

1. Redact all secrets from env/user tools. (`manage_env` and `manage_users list` are fixed; custom user-store gitignore handling still needs a follow-up.)
2. Lock down `run_playwright_test.overrideCommand` and remove shell execution from detached mode. (Fixed.)
3. Make zero-test runs fail in foreground and detached status parsing. (Fixed.)
4. Fix Streamable HTTP process lifecycle.
5. Make DOM JSON mode fail honestly instead of caching errors. (Fixed.)
6. Fix browser setup verification and session failure propagation. (Fixed.)
7. Fix `validate_and_write(dryRun:true)` so it is actually read-only. (Fixed.)
8. Add `"baseUrl": "."` when adding TypeScript path mappings, or stop adding path mappings implicitly. (Fixed.)
9. Remove/fix the scaffolded `@smoke` sample feature so fresh projects can run. (Fixed.)
10. Pass tags/specific filters into `bddgen`, not just `playwright test`. (Fixed.)
11. Add progress/detached behavior or timeout guidance for setup/upgrade.
