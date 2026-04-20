import { Locator, expect } from '@playwright/test';
import { getPage } from 'vasu-playwright-utils';
import 'dotenv/config';

export class BasePage {
  protected get page() { return getPage(); }

  protected async goto(url: string): Promise<void> {
    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
  }

  protected async waitForResponse(urlFragment: string, status = 200): Promise<void> {
    await this.page.waitForResponse(
      resp => resp.url().includes(urlFragment) && resp.status() === status
    );
  }

  protected async click(locator: Locator): Promise<void> {
    await locator.scrollIntoViewIfNeeded();
    await locator.waitFor({ state: 'visible' });
    await locator.click();
  }

  protected async fill(locator: Locator, value: string): Promise<void> {
    await locator.waitFor({ state: 'visible' });
    await locator.fill(value);
  }

  protected async selectOption(locator: Locator, label: string): Promise<void> {
    await locator.waitFor({ state: 'visible' });
    await locator.selectOption({ label });
  }

  protected async hover(locator: Locator): Promise<void> {
    await locator.scrollIntoViewIfNeeded();
    await locator.hover();
  }

  protected async expectVisible(locator: Locator): Promise<void> {
    await expect(locator).toBeVisible();
  }

  protected async expectText(locator: Locator, text: string): Promise<void> {
    await expect(locator).toContainText(text);
  }

  async waitForStable(visibilityCheck?: Locator): Promise<void> {
    await this.page.waitForLoadState('domcontentloaded');
    if (visibilityCheck) await expect(visibilityCheck).toBeVisible();
  }

  async closePopups(): Promise<void> {
    const candidates = [
      this.page.getByRole('button', { name: 'Close' }),
      this.page.locator('button.close').first(),
      this.page.locator('.modal-close').first(),
    ];
    for (const btn of candidates) {
      if (await btn.isVisible()) { await btn.click(); break; }
    }
  }

  async navigate(url: string): Promise<void> {
    await this.goto(url);
    await this.waitForStable();
    await this.closePopups();
  }

  async checkAccessibility(scanName = 'Page Scan'): Promise<void> {
    const { AxeBuilder } = await import('@axe-core/playwright');
    const results = await new AxeBuilder({ page: this.page })
      .withTags(['wcag2aa', 'wcag21aa', 'wcag2a'])
      .analyze();
    if (results.violations.length > 0) {
      console.error(`[A11Y] ${scanName}:`, results.violations.map(v => v.description));
    }
    expect(results.violations).toEqual([]);
  }
}