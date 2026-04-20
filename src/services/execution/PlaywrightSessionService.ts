import { chromium } from 'playwright';
import type { Browser, BrowserContext, Page, Locator } from 'playwright';
import { withRetry, RetryPolicies } from '../../utils/RetryEngine.js';

export interface SessionOptions {
  headless?: boolean;
  viewport?: { width: number; height: number };
  storageState?: string;
  userAgent?: string;
}

export class PlaywrightSessionService {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  /**
   * Starts a persistent browser session.
   */
  public async startSession(options: SessionOptions = {}): Promise<string> {
    if (this.browser) {
      return JSON.stringify({
        success: true,
        message: 'A session is already running.',
        url: this.page?.url() || 'about:blank'
      }, null, 2);
    }

    try {
      // TF-NEW-02: Retry browser launch — transient in CI (missing binary, stale lock, etc.)
      const launchResult = await withRetry(
        () => chromium.launch({
          headless: options.headless !== false, // default to headless unless explicitly false
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
        }),
        RetryPolicies.playwrightBrowser
      );
      this.browser = launchResult.value;

      const contextOptions: Parameters<Browser['newContext']>[0] = {
        viewport: options.viewport || { width: 1280, height: 720 }
      };
      if (options.storageState) contextOptions.storageState = options.storageState;
      if (options.userAgent) contextOptions.userAgent = options.userAgent;
      
      this.context = await this.browser.newContext(contextOptions);

      this.page = await this.context.newPage();

      return JSON.stringify({
        success: true,
        message: 'Playwright session started successfully.',
      }, null, 2);
    } catch (error: any) {
      this.endSession(); // Cleanup partial state
      return JSON.stringify({
        success: false,
        error: `Failed to start session: ${error.message}`
      }, null, 2);
    }
  }

  /**
   * Ends the current browser session.
   */
  public async endSession(): Promise<string> {
    try {
      if (this.context) await this.context.close().catch(() => {});
      if (this.browser) await this.browser.close().catch(() => {});
      
      this.page = null;
      this.context = null;
      this.browser = null;

      return JSON.stringify({
        success: true,
        message: 'Session closed successfully.'
      }, null, 2);
    } catch (error: any) {
      return JSON.stringify({
        success: false,
        error: `Error closing session: ${error.message}`
      }, null, 2);
    }
  }

  /**
   * Navigates the persistent session to a URL.
   */
  public async navigate(url: string, waitUntil: 'load' | 'domcontentloaded' | 'networkidle' = 'load', timeoutMs: number = 30000): Promise<string> {
    if (!this.page) {
       // Auto-start if forgotten
       await this.startSession();
    }

    try {
      let finalUrl = url;
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
          finalUrl = `https://${url}`;
      }
      const response = await this.page!.goto(finalUrl, { waitUntil, timeout: timeoutMs });
      
      return JSON.stringify({
        success: true,
        url: this.page!.url(),
        status: response?.status(),
        title: await this.page!.title()
      }, null, 2);
    } catch (error: any) {
      return JSON.stringify({
        success: false,
        error: `Failed to navigate to ${url}: ${error.message}`
      }, null, 2);
    }
  }

  /**
   * Proactively verifies a selector without running a full test.
   * Checks if it resolves to exactly one element and if it is visible/enabled.
   */
  public async verifySelector(selector: string): Promise<string> {
    if (!this.page) {
      return JSON.stringify({
        success: false,
        error: 'No active session. Please run start_session or navigate_session first.'
      }, null, 2);
    }

    try {
      let locator: Locator;
      
      if (selector.includes('getBy') || selector.includes('locator(')) {
           const normalized = selector.replace(/^(this\.)?page\./, '');
           const evalContext = await this.page.evaluateHandle((selStr: string) => {
               // We can't eval Playwright driver API in browser DOM!
               // Returning error for now if it requires driver-side eval
           }, selector);
      }

      if (selector.startsWith('getBy')) {
           return JSON.stringify({
               success: false,
               error: 'verify_selector currently only accepts standard CSS, XPath, or text selectors, not playwright getBy helper chains. Use `button:has-text("Submit")` instead.'
           }, null, 2);
      }
      
      locator = this.page.locator(selector);
      
      // We do not wait 30s as this is a proactive check. Wait max 3s.
      await locator.first().waitFor({ state: 'attached', timeout: 3000 }).catch(() => {});

      const count = await locator.count();
      if (count === 0) {
        return JSON.stringify({
          success: false,
          verified: false,
          error: `Selector '${selector}' did not match any elements on the current page.`
        }, null, 2);
      }

      const isVisible = await locator.first().isVisible();
      const isEnabled = await locator.first().isEnabled();

      // Check if it resolves to multiple elements which could cause strict mode violations later
      const strictModeViolation = count > 1;

      return JSON.stringify({
        success: true,
        verified: isVisible && isEnabled && !strictModeViolation,
        count,
        isVisible,
        isEnabled,
        strictModeViolation,
        message: strictModeViolation 
             ? `Found ${count} elements matching '${selector}', which will cause a Strict Mode violation in Playwright.`
             : (isVisible && isEnabled) 
                  ? 'Selector is valid, visible, and interactable.' 
                  : 'Selector found but element is hidden or disabled.'
      }, null, 2);

    } catch (error: any) {
      return JSON.stringify({
        success: false,
        verified: false,
        error: `Exception during verification: ${error.message}`
      }, null, 2);
    }
  }

  public getPage(): Page | null {
    return this.page;
  }
}
