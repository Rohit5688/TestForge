---
name: testforge-playwright-bdd
description: Maintain TestForge Playwright-BDD feature files and step definitions using TestForge MCP conventions.
---

# TestForge Playwright-BDD

Use this skill when creating or editing `.feature` files, step definitions, and page objects in a TestForge-scaffolded project. This adapts Playwright-BDD practice to TestForge MCP conventions.

## Discover Existing Test Language

- Prefer `list_existing_steps({ projectRoot })` before writing new Gherkin.
- If using shell fallback, run `npx bddgen export` with the project config and reuse matching patterns exactly.
- Read existing `.feature` files for tag, Background, Scenario Outline, data table, and doc string conventions.

## Required Step Pattern

- Import `createBdd` from `playwright-bdd`.
- Import `test` from `../test-setup/page-setup.js`.
- Declare `const { Given, When, Then } = createBdd(test);`.
- In normal UI steps, instantiate page objects without passing `page`: `const loginPage = new LoginPage();`.
- Keep raw Playwright calls out of steps; steps should call page object methods.

```typescript
import { createBdd } from 'playwright-bdd';
import { test } from '../test-setup/page-setup.js';

const { Given, When, Then } = createBdd(test);

Given('I sign in as an admin', async () => {
  const loginPage = new LoginPage();
  await loginPage.signInAs('admin');
});
```

## API and Network Exceptions

- For pure API work inside TestForge steps, prefer `getRequest()` from `vasu-playwright-utils`.
- For network interception tied to a browser action, fixture destructuring is allowed only when the step explicitly needs Playwright `page` or `request`.
- Keep API payload interfaces in `models/` when payloads are complex.

## Tags and Targeted Runs

- Match existing tag conventions such as `@smoke`, `@regression`, or product-specific tags.
- Prefer `run_playwright_test({ projectRoot, tags:"@tag" })` to verify tagged work.
- TestForge sends tag filters to both `bddgen --tags` and Playwright `--grep`.
- For one feature, use `run_playwright_test` with `specificTestArgs` rather than running the whole suite.

## Gherkin Rules

- Keep scenarios business-readable and avoid implementation details.
- Use Scenario Outline for repeated examples.
- Use Background only when multiple scenarios share the same setup.
- Do not invent duplicate step text when `list_existing_steps` shows a reusable semantic match.
