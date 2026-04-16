---
title: 🤝 Getting Help & Community
description: How to get support, file bugs, request features, and contribute to TestForge.
---

import { Card, CardGrid, LinkCard } from '@astrojs/starlight/components';

TestForge is an open-source project. The community is the fastest path to answers.

---

## 💬 Getting Support

<CardGrid>
  <LinkCard
    title="GitHub Discussions"
    description="Ask questions, show what you built, and get help from the community."
    href="https://github.com/Rohit5688/playwright-bdd-mcp/discussions"
  />
  <LinkCard
    title="GitHub Issues"
    description="Report bugs, request features, or file documentation issues."
    href="https://github.com/Rohit5688/playwright-bdd-mcp/issues"
  />
  <LinkCard
    title="GitHub Releases"
    description="Stay current on new features, bug fixes, and breaking changes."
    href="https://github.com/Rohit5688/playwright-bdd-mcp/releases"
  />
</CardGrid>

---

## 🐛 Reporting a Bug

A great bug report gets fixed faster. Use this template when filing an issue:

```markdown
## Environment
- TestForge version: `npm list testforge`
- Node.js version: `node --version`
- OS: [Windows 11 / macOS 14 / Ubuntu 22.04]
- AI client: [Claude Desktop / Cursor / VS Code Copilot]

## What happened
[Describe what you expected vs. what actually happened]

## Steps to reproduce
1. ...
2. ...

## Relevant output
```
[Paste the error message or relevant log lines here]
```

## mcp-config.json (credentials redacted)
```json
{ ... }
```
```

**Before filing:** Check the [Troubleshooting guide](/TestForge/repo/user/troubleshooting/) — your issue may already be documented.

### Auto-Generate a Bug Report

Let TestForge write the report for you after a test failure:
```
"Generate a bug report for the failing checkout test"
```

This calls `export_bug_report` and produces a Jira/GitHub-ready Markdown report with auto-classified severity.

---

## 🚀 Requesting a Feature

1. Search [existing issues](https://github.com/Rohit5688/playwright-bdd-mcp/issues) first — your idea may already be requested
2. Open a new issue with the label `enhancement`
3. Describe: **the problem you're trying to solve**, not just the solution — this helps maintainers find the best implementation path

---

## 🛠️ Contributing

We welcome contributions of all sizes — typo fixes, tests, new tools, and documentation improvements.

### Quick Contribution Path

1. **Fork** the repo on GitHub
2. **Create a branch**: `git checkout -b feature/my-improvement`
3. **Make your changes** — see `CONTRIBUTING.md` for code standards
4. **Run tests**: `npm test`
5. **Open a Pull Request** against `main`

### What We're Looking For

- Bug fixes with test coverage
- New MCP tool implementations
- Documentation improvements (especially worked examples)
- Performance improvements to the SandboxEngine
- New healing strategies for `self_heal_test`

---

## 📋 Staying Current

<CardGrid>
  <Card title="Watch Releases" icon="github">
    Click **Watch → Custom → Releases** on the GitHub repo to get notified of every new version.
  </Card>
  <Card title="Read the Changelog" icon="open-book">
    Every release tag includes a full changelog with breaking changes, new tools, and fixes.
  </Card>
</CardGrid>

---

## 🔗 Related Projects

<CardGrid>
  <LinkCard
    title="AppForge"
    description="The mobile (Appium + Cucumber) counterpart to TestForge."
    href="https://rohit5688.github.io/AppForge"
  />
  <LinkCard
    title="Playwright"
    description="The browser automation framework TestForge is built on."
    href="https://playwright.dev"
  />
  <LinkCard
    title="Cucumber BDD"
    description="The Gherkin feature file syntax used by TestForge."
    href="https://cucumber.io/docs/gherkin/"
  />
</CardGrid>
