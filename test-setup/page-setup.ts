import { test as base } from 'playwright-bdd';
import { setPage } from 'vasu-playwright-utils';

export const test = base.extend<{ autoSetup: void }>({
  autoSetup: [
    async ({ page }, use) => {
      setPage(page);
      await use();
    },
    { auto: true },
  ],
});