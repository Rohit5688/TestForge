// chromium is imported lazily inside startSession() to ensure the
// Error.stackTraceLimit patch in index.ts runs first (ESM hoist issue on Windows/Node 20+).
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
      // Lazy import — ensures Error.stackTraceLimit patch in index.ts fires before playwright loads.
      // Top-level ESM import would be hoisted past the patch, causing read-only property error on Windows/Node 20+.
      const { chromium } = await import('playwright');

      // TF-NEW-02: Retry browser launch — transient in CI (missing binary, stale lock, etc.)
      const launchResult = await withRetry(
        () => chromium.launch({
          headless: options.headless !== false,
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
  public async navigate(url: string, waitUntil: 'load' | 'domcontentloaded' | 'networkidle' = 'load', timeoutMs: number = 30000, screenshot: boolean = false, projectRoot?: string): Promise<string> {
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

      const result: Record<string, unknown> = {
        success: true,
        url: this.page!.url(),
        status: response?.status(),
        title: await this.page!.title()
      };

      // Optional screenshot — LLM "eyes" after navigation
      if (screenshot) {
        try {
          const { ScreenshotStorage } = await import('../../utils/ScreenshotStorage.js');
          const buffer = await this.page!.screenshot({ type: 'png', fullPage: false });
          const stored = ScreenshotStorage.storeBase64(projectRoot || process.cwd(), 'navigate', buffer.toString('base64'));
          result.screenshot = stored.filePath;
          result.screenshotNote = 'Open this file to see what the browser sees right now.';
        } catch { /* soft fail */ }
      }

      return JSON.stringify(result, null, 2);
    } catch (error: any) {
      return JSON.stringify({
        success: false,
        error: `Failed to navigate to ${url}: ${error.message}`
      }, null, 2);
    }
  }

  /**
   * Proactively verifies a selector without running a full test.
   * Handles all three selector shapes the TestForge ecosystem produces:
   *   1. vasu-playwright-utils API strings: getLocatorByRole('button', { name: 'X' }),
   *      getLocatorByTestId('id'), getLocatorByLabel('Email'), getLocatorByText('Submit'),
   *      getLocatorByPlaceholder('Email') — parsed and translated to this.page.getBy*().
   *   2. Vanilla Playwright strings: page.getByRole('button', { name: 'X' }) etc.
   *      — stripped of `page.` prefix and resolved via this.page.getBy*().
   *   3. Raw CSS / XPath / text= selectors — passed to this.page.locator() directly.
   *
   * No vasu import, no eval, no Function constructor.
   * This service owns a vanilla Playwright Page — translation happens at string-parse level.
   */
  public async verifySelector(selector: string): Promise<string> {
    if (!this.page) {
      return JSON.stringify({
        success: false,
        error: 'No active session. Please run start_session or navigate_session first.'
      }, null, 2);
    }

    try {
      const locator: Locator = this.resolveLocator(selector);

      // Proactive check only — wait max 3s, not the full 30s test timeout.
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
      const strictModeViolation = count > 1;

      return JSON.stringify({
        success: true,
        verified: isVisible && isEnabled && !strictModeViolation,
        count,
        isVisible,
        isEnabled,
        strictModeViolation,
        message: strictModeViolation
          ? `Found ${count} elements — will throw strict-mode violation. Scope more narrowly.`
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

  /**
   * Translates any selector string the TestForge ecosystem produces into a
   * Playwright Locator using this.page (vanilla Playwright Page).
   *
   * Covers:
   *   - vasu getLocatorByRole / getLocatorByTestId / getLocatorByLabel /
   *     getLocatorByText / getLocatorByPlaceholder
   *   - Native page.getByRole / page.getByTestId / page.getByLabel /
   *     page.getByText / page.getByPlaceholder
   *   - Raw CSS, XPath, text= selectors
   */
  private resolveLocator(selector: string): Locator {
    const page = this.page!;

    // ── Shape 1: vasu-playwright-utils standalone function calls ─────────────
    // getLocatorByRole('button', { name: 'Submit' })
    const vasuRole = selector.match(/^getLocatorByRole\((.+)\)$/s);
    if (vasuRole) return PlaywrightSessionService.buildGetByRole(page, vasuRole[1]!);

    // getLocatorByTestId('login-btn')
    const vasuTestId = selector.match(/^getLocatorByTestId\((['"`])(.+?)\1\)$/);
    if (vasuTestId) return page.getByTestId(vasuTestId[2]!);

    // getLocatorByLabel('Email address')
    const vasuLabel = selector.match(/^getLocatorByLabel\((['"`])(.+?)\1(?:,(.+))?\)$/s);
    if (vasuLabel) return page.getByLabel(vasuLabel[2]!, PlaywrightSessionService.parseOpts(vasuLabel[3]));

    // getLocatorByText('Submit')
    const vasuText = selector.match(/^getLocatorByText\((['"`])(.+?)\1(?:,(.+))?\)$/s);
    if (vasuText) return page.getByText(vasuText[2]!, PlaywrightSessionService.parseOpts(vasuText[3]));

    // getLocatorByPlaceholder('Search...')
    const vasuPlaceholder = selector.match(/^getLocatorByPlaceholder\((['"`])(.+?)\1(?:,(.+))?\)$/s);
    if (vasuPlaceholder) return page.getByPlaceholder(vasuPlaceholder[2]!, PlaywrightSessionService.parseOpts(vasuPlaceholder[3]));

    // ── Shape 2: vanilla page.getBy* strings ────────────────────────────────
    // page.getByRole('button', { name: 'Submit' })
    const pageRole = selector.match(/^(?:this\.)?page\.getByRole\((.+)\)$/s);
    if (pageRole) return PlaywrightSessionService.buildGetByRole(page, pageRole[1]!);

    // page.getByTestId('id')
    const pageTestId = selector.match(/^(?:this\.)?page\.getByTestId\((['"`])(.+?)\1\)$/);
    if (pageTestId) return page.getByTestId(pageTestId[2]!);

    // page.getByLabel('Email')
    const pageLabel = selector.match(/^(?:this\.)?page\.getByLabel\((['"`])(.+?)\1(?:,(.+))?\)$/s);
    if (pageLabel) return page.getByLabel(pageLabel[2]!, PlaywrightSessionService.parseOpts(pageLabel[3]));

    // page.getByText('Submit')
    const pageText = selector.match(/^(?:this\.)?page\.getByText\((['"`])(.+?)\1(?:,(.+))?\)$/s);
    if (pageText) return page.getByText(pageText[2]!, PlaywrightSessionService.parseOpts(pageText[3]));

    // page.getByPlaceholder('Search')
    const pagePlaceholder = selector.match(/^(?:this\.)?page\.getByPlaceholder\((['"`])(.+?)\1(?:,(.+))?\)$/s);
    if (pagePlaceholder) return page.getByPlaceholder(pagePlaceholder[2]!, PlaywrightSessionService.parseOpts(pagePlaceholder[3]));

    // ── Shape 3: raw CSS / XPath / text= ────────────────────────────────────
    return page.locator(selector);
  }

  /** Parse `'role', { name: 'X', exact: true }` → page.getByRole(role, opts). */
  private static buildGetByRole(page: Page, argsStr: string): Locator {
    const firstArg = argsStr.match(/^(['"`])(.+?)\1/);
    if (!firstArg) throw new Error(`Cannot parse role from: ${argsStr}`);
    const role = firstArg[2]!;
    const rest = argsStr.slice(firstArg[0].length).replace(/^\s*,\s*/, '');
    return page.getByRole(role as any, PlaywrightSessionService.parseOpts(rest) as any);
  }

  /**
   * Leniently parses a JS object literal string → plain object.
   * Normalises single-quoted keys/values to double-quoted before JSON.parse.
   * Returns undefined on failure — opts are always best-effort.
   */
  private static parseOpts(raw: string | undefined): Record<string, any> | undefined {
    if (!raw?.trim()) return undefined;
    try {
      const normalised = raw
        .trim()
        .replace(/'/g, '"')               // 'x' → "x"
        .replace(/([{,]\s*)(\w+)\s*:/g, '$1"$2":'); // unquoted keys → "key":
      return JSON.parse(normalised);
    } catch {
      return undefined;
    }
  }

  public getPage(): Page | null {
    return this.page;
  }
}
