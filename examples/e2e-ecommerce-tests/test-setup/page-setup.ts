/**
 * page-setup.ts
 * ──────────────────────────────────────────────────────────────────────────
 * Sets up the Playwright page singleton BEFORE each BDD scenario using
 * a test.extend fixture with { auto: true }.
 *
 * WHY: playwright-bdd's `importTestFrom` option points bddgen at this file.
 *      Every generated step file receives the `test` export from here, so
 *      setPage(page) is guaranteed to run before any step executes.
 *
 * WHY test.extend (not beforeEach): test.extend is parallel-safe.
 *   Each Playwright worker runs one test at a time and owns its own async
 *   context, so the module-level _page variable in vasu-playwright-utils
 *   is never shared across concurrent tests.
 *
 * Page Objects use getPage() from vasu-playwright-utils — no constructor arg.
 * ──────────────────────────────────────────────────────────────────────────
 */
import { test as base } from 'playwright-bdd';
import { setPage } from 'vasu-playwright-utils';

export const test = base.extend<{ autoSetup: void }>({
  autoSetup: [
    async ({ page }, use) => {
      // Bind the fresh Playwright page to the per-worker singleton store.
      // Playwright cleans up page after use() — nothing to teardown manually.
      setPage(page);
      await use();
    },
    { auto: true },
  ],
});