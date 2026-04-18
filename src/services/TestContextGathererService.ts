import { chromium } from 'playwright';
import type { Browser, Page } from 'playwright';
import type { TestContext, PageContext, PageElement, NetworkCall } from '../types/TestContext.js';

export interface LoginMacro {
  loginPath: string;
  userSelector: string;
  usernameValue: string;
  passSelector: string;
  passwordValue: string;
  submitSelector: string;
}

export interface GatherOptions {
  baseUrl: string;
  /** Relative paths to visit, e.g. ['/login', '/dashboard']. May include full URLs. */
  paths: string[];
  storageState?: string;
  /** Perform a login before visiting protected paths */
  loginMacro?: LoginMacro;
}

// XHR/fetch calls to these host fragments are noise, never useful for waitForResponse()
const ANALYTICS_HOST_FRAGMENTS = [
  'google-analytics', 'doubleclick', 'facebook.net', 'hotjar', 'sentry.io',
  'amplitude', 'mixpanel', 'segment.io', 'fullstory', 'logrocket', 'clarity.ms',
  'newrelic', 'datadog', 'intercom', 'crisp.chat'
];

const INTERACTIVE_ROLES = new Set([
  'button', 'link', 'textbox', 'checkbox', 'radio', 'combobox',
  'menuitem', 'option', 'tab', 'searchbox', 'spinbutton', 'switch', 'slider'
]);



export class TestContextGathererService {
  /**
   * Visits each URL in options.paths, captures the DOM (actionable elements only)
   * and XHR/fetch network calls that fire on page load.
   *
   * Uses an EPHEMERAL browser — does NOT touch or share the persistent session.
   * The browser is guaranteed to close via the finally block.
   */
  public async gather(options: GatherOptions): Promise<TestContext> {
    const { baseUrl, paths, storageState, loginMacro } = options;
    let browser: Browser | undefined;

    try {
      browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
      });

      const contextOptions = {
        viewport: { width: 1280, height: 720 } as const,
        ...(storageState ? { storageState } : {})
      };
      const ctx = await browser.newContext(contextOptions);

      // Execute login macro on a fresh page before visiting protected routes
      if (loginMacro) {
        const loginPage = await ctx.newPage();
        try {
          await loginPage.goto(this.resolveUrl(baseUrl, loginMacro.loginPath), { waitUntil: 'domcontentloaded', timeout: 30_000 });
          await loginPage.locator(loginMacro.userSelector).fill(loginMacro.usernameValue);
          await loginPage.locator(loginMacro.passSelector).fill(loginMacro.passwordValue);
          await Promise.all([
            loginPage.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => {}),
            loginPage.locator(loginMacro.submitSelector).click()
          ]);
        } finally {
          await loginPage.close().catch(() => {});
        }
      }

      const pages: PageContext[] = [];

      for (const urlPath of paths) {
        const pageCtx = await this.gatherPage(ctx.newPage(), baseUrl, urlPath);
        pages.push(pageCtx);
      }

      await ctx.close().catch(() => {});

      return {
        version: '1',
        gatheredAt: new Date().toISOString(),
        baseUrl,
        pages
      };

    } finally {
      // Guaranteed cleanup — even if any page throws
      await browser?.close().catch(() => {});
    }
  }

  private async gatherPage(
    pagePromise: Promise<Page>,
    baseUrl: string,
    urlPath: string
  ): Promise<PageContext> {
    const page = await pagePromise;
    const networkCalls: NetworkCall[] = [];
    const requestedUrl = this.resolveUrl(baseUrl, urlPath);

    try {
      // Intercept responses BEFORE navigation so we capture everything on load
      page.on('response', (response) => {
        try {
          const req = response.request();
          const resourceType = req.resourceType();
          if (resourceType !== 'fetch' && resourceType !== 'xhr') return;

          const url = new URL(req.url());
          const isNoise = ANALYTICS_HOST_FRAGMENTS.some(f => url.hostname.includes(f));
          if (isNoise) return;

          networkCalls.push({
            method: req.method(),
            urlPath: url.pathname,
            status: response.status()
          });
        } catch {
          // Malformed URL — silently skip
        }
      });

      await page.goto(requestedUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });

      const resolvedUrl = page.url();
      const title = await page.title();
      const elements = await this.extractElements(page);

      // Deduplicate network calls: same method+path+status only appears once
      const seen = new Set<string>();
      const uniqueNetworkCalls = networkCalls.filter(nc => {
        const key = `${nc.method}:${nc.urlPath}:${nc.status}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      return { requestedUrl, resolvedUrl, title, elements, networkOnLoad: uniqueNetworkCalls };

    } catch (err: unknown) {
      // Never throw from a per-page gather — return partial data with empty elements
      return {
        requestedUrl,
        resolvedUrl: requestedUrl,
        title: `[FAILED TO LOAD: ${err instanceof Error ? err.message : String(err)}]`,
        elements: [],
        networkOnLoad: []
      };
    } finally {
      await page.close().catch(() => {});
    }
  }

  private async extractElements(page: Page): Promise<PageElement[]> {
    try {
      const snapshot = await page.ariaSnapshot();
      if (!snapshot) return [];
      return this.parseAriaSnapshot(snapshot);
    } catch {
      return [];
    }
  }

  private parseAriaSnapshot(snapshot: string): PageElement[] {
    const results: PageElement[] = [];
    for (const line of snapshot.split('\n')) {
      const match = line.match(/^\s*-\s+(\w+)\s+"([^"]+)"/);
      if (!match) continue;
      const role = match[1]!.toLowerCase();
      const name = match[2]!;
      if (!INTERACTIVE_ROLES.has(role) || !name) continue;
      const element: PageElement = { role, name, locator: this.buildLocator(role, name) };
      if (role === 'textbox' || role === 'searchbox') {
        const lowerName = name.toLowerCase();
        if (lowerName.includes('password')) element.inputType = 'password';
        else if (lowerName.includes('email') || lowerName.includes('e-mail')) element.inputType = 'email';
        else if (lowerName.includes('search')) element.inputType = 'search';
        else if (lowerName.includes('phone') || lowerName.includes('mobile')) element.inputType = 'tel';
        else element.inputType = 'text';
      }
      results.push(element);
    }
    return results;
  }

  private buildLocator(role: string, name: string): string {
    // Escape single quotes for safety inside the Playwright API call
    const safeName = name.replace(/'/g, "\\'");
    switch (role) {
      case 'link':     return `page.getByRole('link', { name: '${safeName}' })`;
      case 'textbox':  return `page.getByLabel('${safeName}')`;
      case 'searchbox':return `page.getByRole('searchbox', { name: '${safeName}' })`;
      case 'checkbox': return `page.getByRole('checkbox', { name: '${safeName}' })`;
      case 'radio':    return `page.getByRole('radio', { name: '${safeName}' })`;
      case 'combobox': return `page.getByRole('combobox', { name: '${safeName}' })`;
      case 'menuitem': return `page.getByRole('menuitem', { name: '${safeName}' })`;
      case 'tab':      return `page.getByRole('tab', { name: '${safeName}' })`;
      default:         return `page.getByRole('${role}', { name: '${safeName}' })`;
    }
  }

  private resolveUrl(baseUrl: string, urlPath: string): string {
    if (urlPath.startsWith('http://') || urlPath.startsWith('https://')) {
      return urlPath;
    }
    const base = baseUrl.replace(/\/$/, '');
    const path = urlPath.startsWith('/') ? urlPath : `/${urlPath}`;
    return `${base}${path}`;
  }
}
