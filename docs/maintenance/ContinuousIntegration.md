---
title: "🚀 Continuous Integration & AI Bug Reporting"
---

TestForge provides native tools to automate the deployment, execution, and reporting of your Playwright-BDD test suites in industrial CI/CD environments.

---

## 🚀 1. Automated Pipeline Scaffolding

### 🔄 `generate_ci_workflow`
Quickly generate production-ready YAML configuration files for your CI provider. These workflows are pre-configured to handle:
- **Playwright Dependencies**: Auto-installs browsers and OS-level dependencies.
- **BDD Code Generation**: Runs `npx bddgen` before test execution.
- **Artifact Management**: Automatically saves Playwright Traces, Videos, and HTML reports on failure.

**Supported Providers**: GitHub Actions, GitLab CI.

---

## 📄 2. AI-Driven Bug Reporting

### 📄 `export_bug_report`
When a test fails, TestForge uses its **Error DNA** matrix to generate a structured, Jira-ready Markdown report. This eliminates manual log gathering.

**The Report Includes**:
- **Severity**: Auto-classified based on the failure type.
- **DNA Root Cause**: Precise technical diagnosis (e.g., `Locators.Broken` vs `Assertion.Failed`).
- **Reproduction Steps**: Extracted directly from your Gherkin scenario.
- **Trace Context**: Links to the exact video and trace artifacts.

---

## 🔍 3. Coverage & Quality Analysis

### 📈 `analyze_coverage` (Mental Model)
TestForge can analyze your `.feature` files and Page Objects to identify **Screen Coverage Gaps**. 
- It identifies UI components and flows that are mentioned in your Page Objects but have no corresponding Gherkin scenarios.
- **Action**: It suggests new BDD scenarios to fill these gaps, which you can then generate using `generate_gherkin_pom_test_suite`.

---

## 🚀 4. CI Best Practices for TestForge

1. **Headless Mode**: Ensure `browserName` in `mcp-config.json` is compatible with your CI runner (standard is `chromium`).
2. **Secret Management**: Inject your `baseUrl` and login credentials via environment variables (e.g., GitHub Secrets) rather than commiting a `.env` file.
3. **Trace Retention**: Always retain the `test-results/` directory as a CI artifact. TestForge reports are much easier to debug when the AI can read the failing trace.