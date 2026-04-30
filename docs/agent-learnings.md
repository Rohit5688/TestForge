# 🧠 TestForge Agent Learnings

This document contains implementation gotchas, non-obvious bugs, and architectural patterns specific to the **TestForge** repository.

## 🛠️ Tool Integration Gotchas

### [INTEGRATION] Response Footer Pollution
- **Context**: `execute_sandbox_code`, `self_heal_test`, `generate_gherkin_pom_test_suite`.
- **Issue**: These tools append `[Session Cost: ...]` to the output.
- **Fix**: ALWAYS strip the footer before calling `JSON.parse()`. Use `text.split("\n\n[Session Cost:")[0]`.

### [HEALING] Brittle Scripting Regex
- **Context**: `SelfHealingService.classifyFailure`.
- **Issue**: The regex `/element\(s\) not found/i` is extremely rigid. 
- **Fix**: Ensure mock error messages in tests use the literal string `element(s)` to trigger `SCRIPTING_FAILURE` until the regex is relaxed in code.

### [SANDBOX] AST Method Formatting
- **Context**: Sandbox AST analysis.
- **Issue**: Method extraction includes access modifiers (e.g., `public login()`).
- **Fix**: When verifying method existence, check for `.includes("methodName")` rather than exact equality, or handle the modifier in the assertion.

### [GENERATION] Dynamic Filenames
- **Context**: Gherkin suite generation.
- **Issue**: Filenames are slugified from `testDescription`.
- **Fix**: Avoid hardcoding expected filenames like `login.feature`. Use `.feature` suffixes for assertions or check the `[GENERATION PLAN]` output block for the actual created paths.

## 🏗️ Architecture Notes

### [GOD-NODES]
- **ContextManager.ts**: Central state for DOM snapshots.
- **TestGenerationService.ts**: Core logic for Gherkin and POM planning.
- *Changes to these files ripple across all tool implementations.*
