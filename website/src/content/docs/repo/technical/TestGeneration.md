---
title: "✍️ Test Generation & Atomic Staging"
---

TestForge uses a "Context-Aware" generation engine to synthesize Playwright-BDD tests that are syntactically perfect and architecturally consistent with your project.

---

## ✍️ 1. The Generation Pipeline

TestForge does not write code in a vacuum. It follows a rigorous 3-step pipeline:

### 📄 Phase 1: Deep Analysis (`analyze_codebase`)
Before a single line of Gherkin is written, the AI runs a full AST (Abstract Syntax Tree) scan of your repository. 
- **Step Discovery**: Finds every existing `@Given`, `@When`, and `@Then` regex.
- **Page Object Map**: Indexing methods in your `pages/` directory.
- **Structural Brain**: Identifies "God Nodes" (high-connectivity files) to avoid breaking core utilities.

### 📗 Phase 2: Orchestrated Prompting (`generate_gherkin_pom_test_suite`)
This tool builds the master prompt for the LLM. It injects:
- **JIT Framework Skills**: Best practices for Playwright (e.g., using `Locators.getByRole` instead of `CSS`).
- **Screen Context**: Only the relevant Page Objects needed for the current task (saves ~10k+ tokens).
- **Project Rules**: Any custom rules learned via `@mcp-learn` or `train_on_example`.

### 📄 Phase 3: Atomic Staging (`validate_and_write`)
This is the "Safety Gate". When the AI produces code, it is first placed in a **Virtual Staging Area**.
- **Syntax Check**: Full `tsc --noEmit` check to ensure the generated TypeScript compiles perfectly.
- **Gherkin Validation**: Ensures scenarios match the Playwright-BDD parser rules.
- **Dry Run**: You can request a "Dry Run" to see a Git-style Diff in the chat before any files are modified.

---

## 📄 2. Smart Contextual Injection

TestForge handles complex logic behind the scenes to keep your prompts simple:

- **Gherkin Compression**: Automatically merges repeated Scenario steps into a `Background:` block if they exceed the `backgroundBlockThreshold`.
- **NavGraph Integration**: Reads Mermaid diagrams in your docs to understand how to move from `LoginPage` -> `DashboardPage` without hallucinating navigation steps.
- **Type-Safe Factories**: Uses `generate_test_data_factory` to create realistic mock data (via Faker.js) that matches your TypeScript interfaces.

---

## 🛠️ 3. Refactoring & Maintenance

### 🛠️ `suggest_refactorings`
Keeps your automation suite lean by identifying:
- **Duplicate Steps**: Different Gherkin sentences that trigger the same logic.
- **Ghost Methods**: Page Object methods that are no longer used by any feature.
- **XPath Overuse**: Flags brittle selectors and suggests ARIA-based replacements.