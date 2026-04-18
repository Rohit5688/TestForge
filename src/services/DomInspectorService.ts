import { chromium } from 'playwright';
import type { Browser } from 'playwright';
import type { IDomInspector, LoginMacro } from '../interfaces/IDomInspector.js';
import { ScreenshotStorage } from '../utils/ScreenshotStorage.js';
import { SmartDomExtractor } from '../utils/SmartDomExtractor.js';

export type DomReturnFormat = 'markdown' | 'json';

export class DomInspectorService implements IDomInspector {

  /**
   * Inspect a page's accessibility tree.
   *
   * @param returnFormat  'markdown' (default) — pruned Actionable Markdown for LLM prompts.
   *                      'json' — flat JsonElement[] array (locator + selectorArgs) for
   *                               custom-wrapper-aware POM generators.
   */
  public async inspect(url: string, waitForSelector?: string, storageState?: string, includeIframes?: boolean, loginMacro?: LoginMacro, timeoutMs: number = 30000, enableVisualMode: boolean = false, returnFormat: DomReturnFormat = 'markdown'): Promise<string> {
    let browser: Browser | null = null;
    try {
      browser = await chromium.launch({ headless: true });
      
      const contextArgs: { storageState?: string } = {};
      if (storageState) {
        contextArgs.storageState = storageState;
      }
      const context = await browser.newContext(contextArgs);
      const page = await context.newPage();

      // Dynamic Macro Login sequence
      if (loginMacro) {
        await page.goto(loginMacro.loginUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
        await page.fill(loginMacro.userSelector, loginMacro.usernameValue);
        await page.fill(loginMacro.passSelector, loginMacro.passwordValue);
        await page.click(loginMacro.submitSelector);
        await page.waitForLoadState('networkidle').catch(() => {});
      }

      // Navigate to ultimate destination
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
      await page.waitForLoadState('networkidle').catch(() => {});
      
      if (waitForSelector) {
        await page.waitForSelector(waitForSelector, { timeout: 5000 }).catch(() => {});
      }

      // --- AOM FIX: page.accessibility was removed in Playwright v1.52.
      // ariaSnapshot() was added in v1.44 but types may lag in the 'playwright' package.
      // We cast to 'any' to call it safely; it falls back to DOM scraping if unavailable.
      let mainSnapshot: unknown = null;
      try {
        const yamlSnapshot: string | undefined = await (page as any).ariaSnapshot?.();
        if (yamlSnapshot) {
          mainSnapshot = { ariaYaml: yamlSnapshot };
        }
      } catch {
        mainSnapshot = null;
      }

      // Fallback: extract a compact semantic structure by querying interactive elements directly
      if (!mainSnapshot) {
        mainSnapshot = await page.evaluate(() => {
          const sel = 'a, button, input, select, textarea, [role], h1, h2, h3, label';
          return {
            fallback: true,
            elements: Array.from(document.querySelectorAll(sel))
              .slice(0, 100)
              .map(el => ({
                tag: el.tagName.toLowerCase(),
                role: el.getAttribute('role') ?? undefined,
                name: (el.getAttribute('aria-label') ?? el.getAttribute('name') ?? el.textContent?.trim().slice(0, 60)) || undefined,
                id: el.id || undefined,
                testId: el.getAttribute('data-testid') || undefined,
              }))
          };
        });
      }
      
      const result: { mainFrame: unknown; iframes?: { url: string; snapshot: unknown }[]; screenshot?: unknown } = { mainFrame: mainSnapshot };

      // Capture full-page screenshot — surfaced in output so VSCode/Cline users can open it
      // for the same visual context that an integrated browser provides in tools like Antigravity.
      let screenshotPath: string | undefined;
      if (enableVisualMode) {
        try {
          const buffer = await page.screenshot({ type: 'png', fullPage: true });
          const stored = ScreenshotStorage.storeBase64(process.cwd(), 'dom-inspect', buffer.toString('base64'));
          screenshotPath = stored.filePath;
          result.screenshot = stored;
        } catch (e) {
          // Soft fail screenshot capture
        }
      }

      // Optional recursive pass for inner frames (like Stripe fields or generic embedded sites)
      if (includeIframes) {
        result.iframes = [];
        for (const frame of page.frames()) {
          if (frame === page.mainFrame() || frame.isDetached()) continue;
          try {
            // ariaSnapshot is only available on Page, not Frame — scrape frame URL instead
            result.iframes.push({ url: frame.url(), snapshot: 'Frame detected (ariaSnapshot not available on cross-origin frames).' });
          } catch (e) {
            result.iframes.push({ url: frame.url(), snapshot: 'Cross-origin or isolated frame restricted.' });
          }
        }
      }

      const rawJson = JSON.stringify(result, null, 2);
      // Branch on returnFormat: 'json' → flat JsonElement[] (custom-wrapper friendly)
      //                          'markdown' (default) → pruned Actionable Markdown
      if (returnFormat === 'json') {
        return SmartDomExtractor.extractAsJson(rawJson, url);
      }
      // TASK-62: transform raw AOM JSON → pruned Actionable Markdown
      return SmartDomExtractor.extract(rawJson, url, screenshotPath);

    } catch (error) {
      // --- 18A FIX: Friendly, actionable error messages ---
      const msg: string = error instanceof Error ? error.message : String(error);
      if (msg.includes('ECONNREFUSED') || msg.includes('ERR_CONNECTION_REFUSED')) {
        return `[ERROR] Could not reach "${url}". Is the server running and accessible from this machine?`;
      }
      if (msg.includes('ERR_CERT') || msg.includes('SSL') || msg.includes('certificate')) {
        return `[ERROR] The page at "${url}" uses an untrusted SSL certificate. Add "ignoreHTTPSErrors: true" to your Playwright config.`;
      }
      if (msg.toLowerCase().includes('timeout')) {
        return `[ERROR] Page at "${url}" took too long to load. Try passing a "waitForSelector" to wait for a specific element, or verify the URL is publicly accessible.`;
      }
      return `[ERROR] Failed to inspect DOM at ${url}:\n${msg}`;
    } finally {
      if (browser) await browser.close().catch(() => {});
    }
  }
}
