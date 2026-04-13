// Standard Playwright APIs are imported from @playwright/test.
// @playwright/test matches the version used by playwright-bdd and is installed implicitly.
import { Page, expect } from '@playwright/test';
import 'dotenv/config';

export class BasePage {
  constructor(protected page: Page) {}

  async waitForStable(selector?: string) {
    await this.page.waitForLoadState('networkidle');
    if (selector) await expect(this.page.locator(selector)).toBeVisible();
  }

  async closePopups() {
    const selectors = ['[aria-label="Close"]', 'button.close', '.modal-close'];
    for (const sel of selectors) {
      const btn = this.page.locator(sel).first();
      if (await btn.isVisible()) await btn.click();
    }
  }

  async navigate(url: string) {
    await this.page.goto(url);
    await this.waitForStable();
    await this.closePopups();
  }

  async checkAccessibility(scanName = 'Page Scan') {
    const { AxeBuilder } = await import('@axe-core/playwright');
    const results = await new AxeBuilder({ page: this.page })
      .withTags(['wcag2aa', 'wcag21aa', 'wcag2a'])
      .analyze();
    if (results.violations.length > 0) {
      console.error(`[A11Y] Violations found in ${scanName}:`, results.violations);
    }
    expect(results.violations).toEqual([]);
  }
}