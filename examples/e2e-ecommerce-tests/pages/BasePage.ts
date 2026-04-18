// ─────────────────────────────────────────────────────────────────────
// BasePage — TestForge Standard Base Class
//
// PURPOSE (Token Efficiency + Synchronization)
// Instead of: await this.page.locator('button').click()
// Write:      await this.click(this.submitBtn)
//
// Every wrapper enforces human-like synchronization automatically:
//   scrollIntoViewIfNeeded → waitFor visible → action
// This prevents the #1 cause of flaky tests: acting before element is ready.
// ─────────────────────────────────────────────────────────────────────
import { Page, Locator, expect } from '@playwright/test';
import 'dotenv/config';

export class BasePage {
  constructor(protected readonly page: Page) {}

  // ── Navigation ────────────────────────────────────────────────────

  protected async goto(url: string): Promise<void> {
    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
  }

  /** Wait for a named API response before continuing. */
  protected async waitForResponse(urlFragment: string, status = 200): Promise<void> {
    await this.page.waitForResponse(
      resp => resp.url().includes(urlFragment) && resp.status() === status
    );
  }

  // ── Actions (human-simulated, synchronization built-in) ────────────

  /**
   * Click with built-in scroll + visibility check.
   * Never use page.click(selector) or locator.click({ force: true }) directly.
   */
  protected async click(locator: Locator): Promise<void> {
    await locator.scrollIntoViewIfNeeded();
    await locator.waitFor({ state: 'visible' });
    await locator.click();
  }

  /**
   * Fill a text input. Clears existing value before typing.
   */
  protected async fill(locator: Locator, value: string): Promise<void> {
    await locator.waitFor({ state: 'visible' });
    await locator.fill(value);
  }

  /**
   * Select a dropdown option by visible label.
   */
  protected async selectOption(locator: Locator, label: string): Promise<void> {
    await locator.waitFor({ state: 'visible' });
    await locator.selectOption({ label });
  }

  /**
   * Hover over an element (e.g. to reveal a dropdown menu).
   */
  protected async hover(locator: Locator): Promise<void> {
    await locator.scrollIntoViewIfNeeded();
    await locator.hover();
  }

  // ── Assertions (convenience wrappers for common checks) ────────────

  protected async expectVisible(locator: Locator): Promise<void> {
    await expect(locator).toBeVisible();
  }

  protected async expectText(locator: Locator, text: string): Promise<void> {
    await expect(locator).toContainText(text);
  }

  // ── Utilities ─────────────────────────────────────────────────────

  /**
   * Wait for the page to finish its initial load (domcontentloaded).
   * Do NOT use networkidle — modern SPAs keep network active permanently.
   */
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