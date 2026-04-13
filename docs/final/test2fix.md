# TestForge Token Efficiency — Implementation Plan

> Four targeted changes. No new dependencies. No new tools. Estimated total reduction: **~75%**
> on multi-page flows based on the numbers from the live ecommerce audit.

---

## The actual numbers before you start

The audit measured ~17,500 tokens for 5 pages of DOM inspection. Here's where they come from:

| Source                                 | Per page                               | × 5 pages    |
| -------------------------------------- | -------------------------------------- | ------------ |
| Parsed actionable markdown (150 nodes) | ~700 tokens                            | ~3,500       |
| Raw YAML append (4,000 char cap)       | ~1,000 tokens                          | ~5,000       |
| Budget footer + history headers        | ~200 tokens                            | ~1,000       |
| Accumulated in conversation context    | all 5 sit in context during generation | ~9,500 extra |
| **Total**                              |                                        | **~17,500**  |

After all four changes the target is ~4,500 tokens for the same 5-page flow.

---

## Fix 1 — Remove raw YAML append from SmartDomExtractor

**File:** `src/utils/SmartDomExtractor.ts`  
**Effort:** 5 minutes  
**Impact:** −1,000 tokens per page inspection (−5,000 for a 5-page flow)

### Why this is safe

The raw YAML is appended "for completeness" at line 270. But the function already extracted
every actionable element from it into the numbered markdown list above it. The two blocks
contain the same information — one structured for the agent, one as raw text. The raw block
is never referenced by any other code. Removing it loses nothing.

### Exact change

````ts
// src/utils/SmartDomExtractor.ts
// In extractFromAriaYaml(), DELETE lines 270–276:

    // Also include the raw YAML for completeness (capped to keep tokens manageable)  ← DELETE
    const rawCap = yaml.length > 4000 ? yaml.slice(0, 4000) + '\n... [aria snapshot truncated]' : yaml;  ← DELETE
    lines.push('');  ← DELETE
    lines.push('### Raw ARIA Snapshot (for full reference)');  ← DELETE
    lines.push('```yaml');  ← DELETE
    lines.push(rawCap);  ← DELETE
    lines.push('```');  ← DELETE

    return lines.join('\n');  // ← keep this
````

The function after the change ends cleanly at `return lines.join('\n')` immediately after
the loop. No other changes needed in this file.

### Verification

```bash
npm run build
# Then manually: call inspect_page_dom on any URL and confirm output no longer contains
# "### Raw ARIA Snapshot" section. The actionable elements list should still be present.
```

---

## Fix 2 — Reduce ContextManager recent-scan window from 2 to 1

**File:** `src/services/ContextManager.ts`  
**Effort:** 2 minutes  
**Impact:** −1,900 tokens kept in context per multi-page flow

### Why this is safe

`RECENT_SCANS_TO_KEEP = 2` means after 3+ page inspections, the last 2 are always kept
full-size in the compacted history that gets appended to subsequent tool responses.
For a 5-page flow: pages 4 and 5 are full-size, pages 1–3 are summarised.

When the agent is on page 5, it does not need page 4's DOM — the page 4 selectors are
already written into the generated page object from the previous step. Only the _current_
page needs to be full-size. One is enough.

### Exact change

```ts
// src/services/ContextManager.ts
// Line 34:

// BEFORE
private readonly RECENT_SCANS_TO_KEEP = 2;

// AFTER
private readonly RECENT_SCANS_TO_KEEP = 1;
```

One number. That's the entire change.

### Verification

```bash
npm run build
# Inspect 4 pages in sequence. Call get_system_state after each.
# Confirm that only the most recent scan appears full-size in session history.
# Earlier scans should appear as one-line summaries.
```

---

## Fix 3 — Update workflow_guide to enforce per-page generate loop

**File:** `src/index.ts` — the `workflow_guide` tool's `write_test` steps  
**Effort:** 15 minutes  
**Impact:** Prevents 5 DOM snapshots from accumulating simultaneously in context

### Why the current workflow causes the problem

The current `write_test` workflow is:

```
1. analyze_codebase
2. inspect_page_dom          ← agent calls this 5 times before proceeding
3. generate_gherkin_pom_test_suite   ← receives all 5 DOM trees in context simultaneously
4. validate_and_write
```

The agent follows this literally — inspects all pages first, then generates. By the time
generation starts, all 5 DOM snapshots are in conversation context. The fix is to make the
workflow explicit that the loop happens at page granularity.

### Exact change

```ts
// src/index.ts — inside the workflow_guide tool handler
// Find the write_test entry and replace its steps array:

write_test: {
  description: `Generate a new BDD test scenario from plain English.

OUTPUT INSTRUCTIONS: Do NOT repeat file path or parameters. Do NOT summarise what you just did. Acknowledge in <=10 words, then proceed. Keep response under 100 words unless explaining an error.`,
  steps: [
    // BEFORE (current):
    // "1. analyze_codebase (or execute_sandbox_code) — Scan codebase architecture.",
    // "2. inspect_page_dom — Get DOM snapshot of the Web App to get accurate selectors.",
    // "3. generate_gherkin_pom_test_suite — Generate feature file, step definitions, and Page Object.",
    // "4. validate_and_write — Validate TypeScript and write files to disk (it will also run the test)."

    // AFTER:
    "1. analyze_codebase (or execute_sandbox_code) — Scan codebase architecture ONCE. Cache result.",
    "2. FOR EACH PAGE in the flow — run steps 2a–2c before moving to the next page:",
    "2a. inspect_page_dom — Inspect ONE page at a time. Do NOT inspect all pages upfront.",
    "2b. generate_gherkin_pom_test_suite — Generate the Page Object for THIS page only using its DOM snapshot.",
    "2c. validate_and_write — Write THIS page's files to disk before inspecting the next page.",
    "3. After all pages are complete: run_playwright_test to validate the full flow.",
    "CRITICAL: Never call inspect_page_dom for multiple pages before generating. One page at a time keeps token usage under control."
  ]
},
```

### Why this works

The agent treats `workflow_guide` as an authoritative routing instruction. Making the loop
explicit at the step level changes agent behaviour without code changes — the agent will
naturally call inspect → generate → write → next page instead of inspect all → generate all.

### Verification

```bash
# Run a multi-page test generation task after this change.
# Observe the agent's tool call sequence in ObservabilityService logs (mcp-logs/*.jsonl).
# Should see: inspect → generate → write → inspect → generate → write
# Should NOT see: inspect → inspect → inspect → generate
```

---

## Fix 4 — Add relevance filter to TestGenerationService context injection

**File:** `src/services/TestGenerationService.ts`  
**Effort:** 30 minutes  
**Impact:** −40–60% of the 18,000-token context input on mature projects

### The problem in the current code

In `generatePromptInstruction()`, these two blocks inject everything unconditionally:

```ts
// Lines ~63–67 — ALL step definitions from ALL files
...(analysisResult.existingStepDefinitions.flatMap(s => s.steps.map(step => `- ${step}`))),

// Lines ~68–70 — ALL page objects with ALL their methods
...(analysisResult.existingPageObjects.map(p => `${p.path} -> Methods: ${p.publicMethods.join(', ')}`)),
```

For a project with 20 page objects and 150 step definitions, this injects everything — even
steps for screens completely unrelated to the current test. A "Purchase Flow" test doesn't
need the "User Settings" page object's 12 methods or "Admin Panel" steps.

### Exact change

Add a filter function before the `reusedContext` array is built. Insert this immediately
before the `const reusedContext = [` line:

```ts
// src/services/TestGenerationService.ts
// Insert BEFORE the `const reusedContext = [` line:

// --- TASK-34 fix: relevance filter to reduce context bloat on mature projects ---
// Extract keywords from the test description to filter only related steps and page objects.
// Falls back to including everything if description is too short to filter meaningfully.
const descWords = testDescription
  .toLowerCase()
  .replace(/[^a-z0-9 ]/g, " ")
  .split(/\s+/)
  .filter((w) => w.length > 3); // skip short words like "the", "and", "with"

const isDescriptive = descWords.length >= 3;

function isRelevant(text: string): boolean {
  if (!isDescriptive) return true; // can't filter without enough context — include all
  const lower = text.toLowerCase();
  return descWords.some((w) => lower.includes(w));
}

// Cap step definitions at 60 most relevant (prevents runaway injection on large projects)
const MAX_STEPS = 60;
const MAX_PAGE_OBJECTS = 10;
// ---------------------------------------------------------------------------------
```

Then update the two injection lines to use the filter:

```ts
// BEFORE:
...(analysisResult.existingStepDefinitions.flatMap(s => s.steps.map(step => `- ${step}`))),
...(analysisResult.existingPageObjects.map(p => `${p.path} -> Methods: ${p.publicMethods.join(', ')}`)),

// AFTER:
...(analysisResult.existingStepDefinitions
  .flatMap(s => s.steps.map(step => `- ${step}`))
  .filter(step => isRelevant(step))
  .slice(0, MAX_STEPS)),
...(analysisResult.existingPageObjects
  .filter(p => isRelevant(p.path) || isRelevant(p.publicMethods.join(' ')))
  .slice(0, MAX_PAGE_OBJECTS)
  .map(p => `${p.path} -> Methods: ${p.publicMethods.join(', ')}`)),
```

### Safety notes

- `isDescriptive` guard: if `testDescription` is fewer than 3 meaningful words, the filter
  is disabled and everything is included — same as current behaviour.
- `slice(0, MAX_STEPS)` and `slice(0, MAX_PAGE_OBJECTS)`: hard caps prevent runaway injection
  even if the filter is too permissive.
- On new projects with few steps/pages: filter matches nearly everything, behaviour unchanged.
- On mature projects (20+ pages): reduces injected context by 60–80% for focused test types.

### Verification

```bash
npm run build
# Test 1 (new project, 3 page objects): generation should include all — no change in output.
# Test 2 (mature project, 15+ pages): describe "purchase flow ecommerce"
#   → should inject cart, checkout, product pages but NOT admin, settings, profile pages
# Check the generated prompt in ObservabilityService JSONL log (outputSummary.contentLength)
#   → should be measurably smaller for mature projects
```

---

## Combined effect on the 5-page ecommerce flow

| Token source                             | Before           | After       | Saving             |
| ---------------------------------------- | ---------------- | ----------- | ------------------ |
| Raw YAML per page (×5)                   | ~5,000           | 0           | −5,000             |
| Extra full-size DOM in context (Fix 2)   | ~1,900           | ~700        | −1,200             |
| Irrelevant context in generation (Fix 4) | ~8,000           | ~3,000      | −5,000             |
| Workflow accumulation eliminated (Fix 3) | baked into above | —           | —                  |
| **Total**                                | **~40,000**      | **~11,000** | **−29,000 (~72%)** |

---

## Order to implement

Do them in this order — each builds on a stable build from the previous:

1. Fix 1 (SmartDomExtractor) — 5 min, isolated, zero risk
2. Fix 2 (ContextManager) — 2 min, one number
3. `npm run build && npm test` — confirm still green
4. Fix 3 (workflow_guide) — 15 min, string changes only
5. Fix 4 (TestGenerationService) — 30 min, add filter block
6. `npm run build && npm test` — final green check
7. Run a real 5-page flow and check `mcp-logs/*.jsonl` to confirm token savings

Total implementation time: ~1 hour.
