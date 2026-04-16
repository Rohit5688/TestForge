---
title: 🔧 Troubleshooting
description: Comprehensive error reference for TestForge — every common failure with root cause and fix.
---

import { Tabs, TabItem, Card, CardGrid } from '@astrojs/starlight/components';

This page is your first stop when something goes wrong. Every error is classified by where it occurs and includes a verified fix.

:::tip[Self-Diagnosis First]
Before reading this page, run `"Check the TestForge environment and report all failures"` in your AI chat. The `check_playwright_ready` tool will automatically identify 80% of setup issues.
:::

---

## 🔌 MCP Connection Failures

These errors prevent TestForge tools from appearing in your AI client.

### No tools appear after connecting

**Symptoms**: AI chat doesn't recognize TestForge tool calls; "unknown tool" responses.

| Cause | Fix |
| :--- | :--- |
| JSON syntax error in config file | Validate at [jsonlint.com](https://jsonlint.com) — most common is a trailing comma |
| Config file in wrong location | See the exact path for your OS in the [Installation guide](/TestForge/repo/user/installation/) |
| AI client not fully restarted | Quit the application completely (not just close the window), then reopen |
| Old npx cache serving broken version | Run `npm cache clean --force` then restart the AI client |

**Verify the config is being read**: Add `"env": { "DEBUG": "mcp:*" }` to the server config and check the AI client logs.

---

### `Error: spawn npx ENOENT`

**Cause**: Node.js / npx not found in the PATH that the AI client uses.

**Fix**:
```json
// Use the absolute path instead of relying on PATH
{
  "mcpServers": {
    "testforge": {
      "command": "/usr/local/bin/npx",  // macOS homebrew
      "args": ["-y", "testforge"]
    }
  }
}
```

Find your npx path with `which npx` (macOS/Linux) or `Get-Command npx` (Windows PowerShell).

---

### `Error: Cannot find module 'testforge'`

**Cause**: The TestForge package failed to download, or npm registry is unreachable.

**Fix**:
```bash
# Verify npm can reach the registry
npm ping

# Force fresh download
npm cache clean --force
npx --yes testforge --version
```

If behind a corporate proxy, see the [proxy configuration section](/TestForge/repo/user/installation/#proxy--corporate-network).

---

## 🏗️ Project Setup Failures

### `mcp-config.json not found`

**Cause**: AI ran a tool before initializing the project.

**Fix**: Run the setup prompt first:
> *"Initialize a new TestForge project in `[absolute/path/to/project]`"*

The `setup_project` tool creates `mcp-config.json`. Every other tool depends on it.

---

### `baseUrl is not reachable`

**Cause**: Your target application is not running, or the URL is wrong.

**Diagnosis steps**:
1. Open `mcp-config.json` and find the `baseUrl` field
2. Open it in your browser manually — does it load?
3. Check for `localhost` vs `127.0.0.1` — try both if one fails

**Common fixes**:

| Scenario | Fix |
| :--- | :--- |
| Dev server not started | Run `npm run dev` (or equivalent) before TestForge |
| Wrong port | Update `baseUrl` in `mcp-config.json` to match the actual port |
| HTTPS self-signed cert | Add `"ignoreHTTPSErrors": true` to `mcp-config.json` |
| Behind VPN | Ensure the VPN isn't blocking localhost connections |

---

### TypeScript compilation fails on `setup_project`

**Symptoms**: `tsc: command not found` or `TS2307: Cannot find module`.

**Fix**:
```bash
# In your project root:
npm install --save-dev typescript @types/node

# Verify tsconfig inherits correctly:
cat tsconfig.json  # Should have "extends": "./node_modules/..."
```

---

## 🧪 Test Generation Failures

### Generated feature file has no matching steps

**Symptom**: Tests run but all steps are `undefined` (yellow in Cucumber output).

**Cause**: Step definition file was generated but is not being picked up by the runner.

**Fix**: Check `playwright.config.ts` for the correct glob:
```typescript
// playwright.config.ts
const config: PlaywrightTestConfig = {
  use: {
    // ...
  },
};
// Check cucumber config:
// features: 'features/**/*.feature'
// steps: 'step-definitions/**/*.steps.ts'
```

Run: `"Check TestForge project structure and report any mismatches"` — the `analyze_codebase` tool will identify misconfigured paths.

---

### `generate_gherkin_pom_test_suite` returns empty output

**Cause**: The page DOM returned no actionable elements (all elements hidden, or wrong URL).

**Diagnosis**:
```
"Inspect the DOM at [URL] and tell me what elements TestForge found"
```

The `inspect_page_dom` tool returns the raw Accessibility Tree. If it shows fewer than 5 elements, the page likely:
- Requires authentication (use `loginMacro` parameter)
- Is a Single Page App that hasn't loaded yet (use `waitForSelector`)
- Is behind a cookie consent wall (use `storageState`)

---

### `validate_and_write` fails with TypeScript error

**Symptom**: "TS2305: Module has no exported member X" or "TS7016: Could not find a declaration file".

| Error | Fix |
| :--- | :--- |
| Import path wrong | Check that the generated `import` matches the actual filename (case-sensitive on Linux) |
| Missing `@types` package | `npm install --save-dev @types/node` |
| `basePageClass` not found | Verify `mcp-config.json` `basePageClass` points to an existing file |
| Custom wrapper not found | Set `customWrapperPackage` in `mcp-config.json` to the correct package name |

**Quick fix**: Run `"Fix the TypeScript errors in the last generated file"` — TestForge will re-inspect the error and patch the import.

---

### Generated locators don't match elements on the page

**Cause**: The page changed since the DOM was inspected, or the inspection captured a loading state.

**Fix**:
```
"Re-inspect the DOM at [URL] and regenerate the Page Object for [PageName]"
```

Always use `waitForSelector` for dynamic pages:
```typescript
// In the generate prompt:
"Inspect [URL], wait for selector '.dashboard-loaded' before capturing the DOM, then generate the Page Object"
```

---

## 🔬 Test Execution Failures

### `run_playwright_test` hangs indefinitely

**Cause**: Browser process spawned but test is waiting for a selector that never appears.

**Fix**:
1. Check `mcp-config.json` `timeouts.global` — default is `30000` (30s). Increase to `60000` for slow apps.
2. Run `"Get the current system state"` — the `get_system_state` tool shows if a test job is genuinely running.
3. Kill orphaned processes: `pkill -f playwright` (macOS/Linux) or `taskkill /IM "playwright.exe" /F` (Windows).

---

### `Error: Page crashed` or `Target closed`

**Cause**: The browser ran out of memory, or the page triggered a navigation that closed the context.

**Fix**:
```json
// mcp-config.json — increase browser timeout and disable sandbox for low-memory environments
{
  "playwrightOptions": {
    "launchOptions": {
      "args": ["--disable-dev-shm-usage", "--no-sandbox"]
    }
  }
}
```

---

### Tests pass locally but fail in CI

| Symptom | Cause | Fix |
| :--- | :--- | :--- |
| `browserType.launch: Executable doesn't exist` | Playwright browsers not installed in CI | Add `npx playwright install --with-deps` to CI setup |
| `net::ERR_CONNECTION_REFUSED` | App not started before tests | Add a health-check step in CI before running tests |
| Flaky timeouts | CI machines are slower | Increase `timeouts.global` to `60000` in CI env |
| Missing `.env` variables | CI doesn't have the `.env` file | Use CI secrets to inject `BASE_URL`, `TEST_USER`, etc. |

---

## 🔧 Self-Healing Failures

### `self_heal_test` finds no candidates

**Symptom**: "No replacement selectors found" after a test failure.

**Cause**: The element genuinely doesn't exist on the current page, or the XML hierarchy was not passed to the healer.

**Fix**:
```
"Inspect the current DOM at [URL], then self-heal the failing selector '[old-selector]'"
```

Always inspect fresh DOM before healing — never use a cached snapshot.

---

### Healed selector works once but breaks next run

**Cause**: The element has a dynamic ID or class that changes on every render.

**Fix**: After healing, run:
```
"Verify the healed selector '[selector]' and if it's fragile, find a more stable alternative using accessibility roles"
```

The `verify_selector` tool will flag `id=dynamic_xyz_12345` patterns and suggest `role=button[name='Submit']` alternatives.

---

### `train_on_example` called but future tests ignore the rule

**Cause**: The `scope` was set incorrectly — `file` scope only applies to one file.

**Fix**: Use `global` scope for patterns that apply project-wide:
```
"Train TestForge to always use accessibility IDs for login buttons — apply this rule globally"
```

---

## 📊 Token & Performance Issues

### `Token budget exhausted` mid-session

**Cause**: Too many `analyze_codebase` or full file reads in one session.

**Fix protocol**:
1. Start a **new AI conversation** (resets the context window)
2. Begin with: `"Connect to TestForge and show me the structural brain summary"` — this uses `execute_sandbox_code` (Turbo Mode) instead of full file reads
3. Avoid open-ended prompts like "Read all my test files" — always be specific

See the [Token Optimizer guide](/TestForge/repo/technical/tokenoptimizer/) for full prevention strategies.

---

### Sandbox execution timeout

**Symptom**: `"Sandbox execution exceeded 10000ms"`.

**Cause**: Script passed to `execute_sandbox_code` is doing too much work (e.g., reading an entire large JSON file).

**Fix**: Ask the sandbox to filter first:
```javascript
// Instead of returning everything:
// return forge.api.readFile('large-file.json')  ❌

// Filter inline:
const data = JSON.parse(await forge.api.readFile('large-file.json'));
return data.filter(item => item.status === 'failing').slice(0, 10);  ✅
```

---

## 🆘 Getting More Help

If this page doesn't resolve your issue:

1. **Check the session log**: Open `mcp-logs/viewer.html` in your browser — it shows every tool call, input, output, and error for the current session.
2. **File a GitHub issue**: [github.com/Rohit5688/TestForge/issues](https://github.com/Rohit5688/TestForge/issues) — include the session log output.
3. **Include diagnostics**: Always run `"Generate a TestForge diagnostics report"` before filing an issue — it captures Node version, Playwright version, config, and recent errors automatically.
