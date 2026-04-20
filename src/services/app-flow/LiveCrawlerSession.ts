/**
 * LiveCrawlerSession — Phase 2 God-Node extraction
 *
 * Launches a headless Playwright instance to spider dynamic web apps
 * and extract valid navigation edges and URLs.
 */
import { chromium } from 'playwright';
import type { Browser } from 'playwright';
import { StaticRouteScanner } from './StaticRouteScanner.js';

export interface NavGraphMutator {
  ensureNode(url: string): void;
  incrementVisit(url: string): void;
  addEdge(
    fromUrl: string,
    toUrl: string,
    selector: string,
    label: string,
    confidence: number
  ): void;
}

const MAX_CRAWL_PAGES = 25;
const CRAWL_TIMEOUT_MS = 8000;

export class LiveCrawlerSession {
  /**
   * Crawls the application and fires events back to the NavGraph mutator.
   * Isolates Playwright and browser state.
   */
  public static async crawl(
    startUrl: string,
    mutator: NavGraphMutator,
    storageState?: string,
    maxPages: number = MAX_CRAWL_PAGES
  ): Promise<void> {
    const origin = new URL(startUrl).origin;
    const visited = new Set<string>();
    const queue: string[] = [startUrl];

    let browser: Browser | null = null;
    try {
      browser = await chromium.launch({ headless: true });
      const contextArgs: { storageState?: string } = {};
      if (storageState) contextArgs.storageState = storageState;
      const context = await browser.newContext(contextArgs);

      while (queue.length > 0 && visited.size < maxPages) {
        const currentUrl = queue.shift()!;
        if (visited.has(currentUrl)) continue;
        visited.add(currentUrl);

        const page = await context.newPage();
        try {
          await page.goto(currentUrl, {
            waitUntil: 'domcontentloaded',
            timeout: CRAWL_TIMEOUT_MS,
          });
          await page.waitForLoadState('networkidle').catch(() => {});
          
          mutator.ensureNode(currentUrl);
          mutator.incrementVisit(currentUrl);

          // Collect all same-origin href links
          const hrefs = await page.evaluate((orig: string) => {
            return Array.from(document.querySelectorAll('a[href]'))
              .map((a) => ({
                href: (a as HTMLAnchorElement).href,
                text: (a as HTMLAnchorElement).innerText.trim().slice(0, 40),
              }))
              .filter((item) => item.href.startsWith(orig));
          }, origin);

          for (const { href, text } of hrefs) {
            const normalized = StaticRouteScanner.normalizeUrl(href);
            if (!visited.has(normalized)) {
              queue.push(normalized);
              mutator.addEdge(
                currentUrl,
                normalized,
                'a[href]',
                text || normalized,
                0.9
              );
            }
          }

          // Collect navigable buttons / interactive elements with data-testid
          const buttons = await page.evaluate(() => {
            return Array.from(
              document.querySelectorAll('button, [role="button"], [role="link"]')
            )
              .map((el) => ({
                text: (el as HTMLElement).innerText?.trim().slice(0, 40) ?? '',
                testId: el.getAttribute('data-testid') ?? '',
                ariaLabel: el.getAttribute('aria-label') ?? '',
              }))
              .filter((b) => b.text || b.testId || b.ariaLabel);
          });

          // Record interactive elements as potential edges (confidence 0.5 — unconfirmed)
          for (const btn of buttons.slice(0, 20)) {
            const sel = btn.testId
              ? `[data-testid="${btn.testId}"]`
              : btn.ariaLabel
              ? `[aria-label="${btn.ariaLabel}"]`
              : `text="${btn.text}"`;
            const label = btn.text || btn.testId || btn.ariaLabel;
            // Target URL unknown until actually clicked — store as placeholder
            mutator.addEdge(currentUrl, '?', sel, label, 0.4);
          }
        } catch {
          // Soft fail per page
        } finally {
          await page.close().catch(() => {});
        }
      }

      await context.close();
    } finally {
      if (browser) await browser.close().catch(() => {});
    }
  }
}
