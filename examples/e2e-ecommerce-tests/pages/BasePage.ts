// ─────────────────────────────────────────────────────────────────────
// BasePage — TestForge Standard Base Class
//
// SINGLETON PAGE PATTERN (via vasu-playwright-utils + test-setup/page-setup.ts)
// The page is injected automatically before each test via the fixture in
// test-setup/page-setup.ts. Page Objects need NO constructor argument:
//
//   const homePage = new HomePage();   ✅ correct
//   const homePage = new HomePage(page); ❌ wrong — no page arg needed
//
// Every action wrapper enforces human-like synchronization:
//   scrollIntoViewIfNeeded → waitFor visible → action
// ─────────────────────────────────────────────────────────────────────
import { Locator, expect } from '@playwright/test';
import { getPage, clickByJS, acceptAlert, dismissAlert, getAlertText, check, uncheck, selectByText } from 'vasu-playwright-utils';
import 'dotenv/config';

export class BasePage {
  // Reads from the per-test page singleton set by test-setup/page-setup.ts.
  // Safe for parallel workers: each worker runs one test at a time.
  protected get page() { return getPage(); }

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
    await locator.waitFor({ state: "attached" });
    await locator.scrollIntoViewIfNeeded();
    await locator.waitFor({ state: "visible" });
    // Aggressive stability check: wait for a tiny moment to ensure layout shift settles
    await this.page.waitForTimeout(100);
    await locator.click();
  }

  /**
   * Click using JS (bypasses visibility checks and layout blockers).
   * Essential for legacy buttons on LambdaTest that sometimes fail standard clicks.
   */
  protected async clickJS(locator: Locator): Promise<void> {
    await locator.waitFor({ state: "attached" });
    await locator.scrollIntoViewIfNeeded();
    await clickByJS(locator);
  }

  /**
   * Fill a text input. Clears existing value before typing.
   */
  protected async fill(locator: Locator, value: string): Promise<void> {
    await locator.waitFor({ state: 'attached' });
    await locator.scrollIntoViewIfNeeded();
    await locator.waitFor({ state: 'visible' });
    await locator.fill(value);
  }

  /**
   * Select a dropdown option by visible label.
   */
  protected async selectOption(locator: Locator, label: string): Promise<void> {
    await locator.waitFor({ state: 'attached' });
    await locator.scrollIntoViewIfNeeded();
    await locator.waitFor({ state: 'visible' });
    await locator.selectOption({ label });
  }

  /**
   * Hover over an element.
   */
  protected async hover(locator: Locator): Promise<void> {
    await locator.waitFor({ state: 'attached' });
    await locator.scrollIntoViewIfNeeded();
    await locator.waitFor({ state: 'visible' });
    await locator.hover();
  }

  /**
   * Clicks and handles a JS alert, confirmation, or prompt.
   */
  protected async handleAlert(locator: Locator, accept = true, promptText?: string): Promise<string> {
    if (accept) {
      return await acceptAlert(locator, { promptText });
    } else {
      return await dismissAlert(locator);
    }
  }

  /**
   * Checks or unchecks a checkbox.
   */
  protected async setCheckbox(locator: Locator, shouldCheck: boolean): Promise<void> {
    if (shouldCheck) {
      await check(locator);
    } else {
      await uncheck(locator);
    }
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
    console.log(`[BasePage] Navigating to: ${url}`);
    await this.goto(url);
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