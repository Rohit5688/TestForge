# Pre-Generation Context & Token Efficiency Optimization Report

> [!NOTE]
> This document summarizes the recent architectural changes across both `AppForge` and `TestForge` repositories to optimize LLM interactions, token usage, and execution stability.

## 1. Original Idea & Core Objectives

The primary goal of these changes was to drastically improve **Token Efficiency** and **Code Generation Accuracy**:

- **Lowering Completion Defaults**: Prevent the LLM from outputting heavy boilerplate (imports, syntax wrappers, extensive comments) during test creation. Instead, the LLM outputs strict JSON matrices that internal transpilers expand into compliant code behind the scenes.
- **Raising Input Quality**: "Spend cheap input tokens to save expensive completion tokens." Instead of having the AI guess locators, we scrape, filter, and feed exact `TestContext` (UI elements + XHR Network calls) to the generator prompt prior to generation.

## 2. What We Changed / Implemented

### TestForge Implementation

- **`[NEW] src/types/TestContext.ts`**: Introduced strict schema interfaces (`PageContext`, `NetworkCall`, `PageElement`) to establish a versioned standard for the data we collect from the live pages.
- **`[NEW] src/services/TestContextGathererService.ts`**: Built an isolated, ephemeral Playwright crawler. It securely evaluates target URLs, extracts actionable ARIA accessibility tree snapshots, intercepts live `fetch/xhr` network traffic, and automatically cleans up its own sessions.
- **`[MODIFY] src/index.ts`**: Exposed the `gather_test_context` tool to the MCP ecosystem, enabling agents to run non-invasive dry-runs.
- **`[MODIFY] src/services/TestGenerationService.ts`**: Rewrote the prompting architecture based on collected context. If pre-gathered DOM Data is found, it directs the LLM (zero-guessing). If not, it halts generation and forces the LLM to invoke `gather_test_context` first.

### AppForge Implementation

- **`[NEW] src/utils/JsonToStepsTranspiler.ts`**: Introduced a JSON abstraction mapped specifically for WDIO/Cucumber framework components. The LLM now only produces stripped-down arrays containing `{ pattern, page, method, args }`.
- **`[MODIFY] src/services/TestGenerationService.ts`**: Enforced the `jsonSteps` interface alongside rigorous "no-inline-comments" directives.
- **`[MODIFY] src/tools/execute_sandbox_code.ts`**: Stabilized our abstract syntax parser script by tracking down and patching a `node: any` type hole with a formal implementation `node: ts.Node`.

## 3. What We Deliberately Skipped (What We Did Not Do)

- **No TestForge Context Scraping applied globally in AppForge**: We intentionally bypassed bolting `TestContextGathererService` onto AppForge because Appium has natively different network interception behavior and already provides `inspect_ui_hierarchy` (XML DOM gatherer).
- **Excluded Non-API Network Traffic**: While recording network events for Playwright auto-healing, we aggressively filtered out analytics/tracking (Mixpanel, Google, DoubleClick) and visual statics.
- **No Disruption to Existing Tool Chains**: Tool architectures remained untouched; all context upgrades operated on completely optional/augmented inputs.

---

> [!IMPORTANT]
>
> ## Next to Think (Future Optimization Task)
>
> **Dynamic Context Load Balancing**
> We can't just dump huge data into the LLM as input. We need to actively consider the LLM context size. If we can understand beforehand what the context size available is, based on that we can split or selectively prune the data to pass to the LLM. Doing this reliably will prevent the LLM from hallucinating due to context overload.
