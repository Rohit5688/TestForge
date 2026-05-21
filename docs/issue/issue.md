# Identified Gaps and Proposed Fixes

This document outlines the two verified gaps in the TestForge codebase, an analysis of why they occur, and the exact code proposals to fix them. No code has been modified in the actual source files.

## 1. Missing Gherkin AST Validation

**Location:** `TestForge/src/services/execution/StagingService.ts` (inside `stageAndValidate`)

**The Problem:**
Currently, the `stageAndValidate` method only extracts `.ts` files and runs them through `tsc --noEmit`. It completely ignores `.feature` files. If the LLM generates syntactically invalid Gherkin (e.g., missing a `Feature:` header, or using invalid step keywords), the server silently writes it to disk. The test execution will then fail later in a way that is harder for the LLM to understand and self-heal.

**The Solution:**
Add a lightweight parsing pass for all `.feature` files inside the staging directory *before* invoking `tsc`. If the Gherkin is invalid, throw a structured `McpError` pointing to the exact line, which forces the LLM into a `[REJECTION]` loop so it corrects its output.

**Proposed Implementation Snippet:**
```typescript
// Inside StagingService.ts -> stageAndValidate()
const featureFiles = files.filter(f => f.path.endsWith('.feature'));

for (const file of featureFiles) {
  const content = file.content;
  const lines = content.split('\n');
  
  let hasFeature = false;
  let hasScenario = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#')) continue;

    if (line.startsWith('Feature:')) hasFeature = true;
    else if (line.startsWith('Scenario:') || line.startsWith('Scenario Outline:')) hasScenario = true;
    else if (!line.match(/^(Given|When|Then|And|But|\*|Examples:|\|)/) && hasScenario && !line.startsWith('@')) {
      // If inside a scenario, steps must start with valid keywords
      throw new McpError(
        `[REJECTION] Invalid Gherkin syntax in ${file.path} at line ${i + 1}:\n"${lines[i]}"\nExpected a valid keyword (Given, When, Then, And, But).`,
        McpErrorCode.PROJECT_VALIDATION_FAILED
      );
    }
  }

  if (!hasFeature) {
    throw new McpError(`[REJECTION] Missing 'Feature:' declaration in ${file.path}`, McpErrorCode.PROJECT_VALIDATION_FAILED);
  }
}
```

---

## 2. Brittle Regex Flexibility in Self-Healing

**Location:** `TestForge/src/services/execution/SelfHealingService.ts` (inside `extractFailedLocators`)

**The Problem:**
The service attempts to extract failed locators from the raw Playwright terminal output using `const locatorRegex = /Locator:\s+(.+)/g;`. 
While this worked for older versions or specific assertion failures, modern Playwright action timeouts (like `.click()` timing out) print their logs as:
```text
Call log:
  - waiting for locator('.submit-btn')
```
Because of this, the healing service fails to extract the locator, resulting in an empty list and blocking the auto-healing process. As discussed, static AST parsing of the source code is dangerous here because users or custom wrappers often store locators in variables, which can only be safely evaluated at runtime.

**The Solution:**
Update the regex to hunt specifically for the evaluated locator strings that Playwright prints in its call log, regardless of the prefix.

**Proposed Implementation Snippet:**
```typescript
// Inside SelfHealingService.ts
private extractFailedLocators(output: string): string[] {
  const locators: string[] = [];
  
  // Match old format: "Locator: locator('.foo')"
  const oldRegex = /Locator:\s+(.+)/g;
  let match;
  while ((match = oldRegex.exec(output)) !== null) {
    if (match[1]) locators.push(match[1].trim());
  }

  // Match modern Playwright call log formats:
  // "waiting for getByRole('button')" or "locator('.submit-btn')"
  const modernRegex = /(?:locator|getBy[A-Za-z]+)\((['"`])(.*?)\1(?:,\s*\{[^}]*\})?\)/g;
  while ((match = modernRegex.exec(output)) !== null) {
    // Reconstruct the matched Playwright string to pass back to the LLM
    locators.push(match[0]);
  }

  return [...new Set(locators)];
}
```
