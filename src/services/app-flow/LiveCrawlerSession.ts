/**
 * LiveCrawlerSession — Phase 2 God-Node extraction
 *
 * Launches a headless Playwright instance to spider dynamic web apps
 * and extract valid navigation edges and URLs.
 */
import type { Browser } from 'playwright';
import { StaticRouteScanner } from './StaticRouteScanner.js';
import { importPlaywright } from '../../utils/PlaywrightRuntime.js';

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
      const { chromium } = await importPlaywright();
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
          await page.waitForTimeout(2000);

          mutator.ensureNode(currentUrl);
          mutator.incrementVisit(currentUrl);

          // Gap-5: SPA routing — patch history API to capture pushState/replaceState routes
          // Standard <a href> crawling misses all client-side navigation in React/Angular/Vue apps.
          const spaRoutes = await page.evaluate((orig: string) => {
            const routes: { href: string; text: string }[] = [];
            // (1) Static <a href> links — unchanged baseline
            Array.from(document.querySelectorAll('a[href]'))
              .map((a) => ({ href: (a as HTMLAnchorElement).href, text: (a as HTMLAnchorElement).innerText.trim().slice(0, 40) }))
              .filter((item) => item.href.startsWith(orig))
              .forEach((item) => routes.push(item));
            // (2) data-href / data-url attributes — common in React SPAs
            Array.from(document.querySelectorAll('[data-href],[data-url],[data-route],[data-path]'))
              .forEach((el) => {
                const raw = el.getAttribute('data-href') ?? el.getAttribute('data-url') ?? el.getAttribute('data-route') ?? el.getAttribute('data-path') ?? '';
                if (!raw) return;
                const href = raw.startsWith('http') ? raw : orig + (raw.startsWith('/') ? '' : '/') + raw;
                if (href.startsWith(orig)) routes.push({ href, text: (el as HTMLElement).innerText?.trim().slice(0, 40) ?? '' });
              });
            // (3) Patch history.pushState / replaceState to record SPA navigations.
            //     Works even when called from within React Router / Angular Router.
            (window as any).__spaRoutes__ = routes;
            const patchHistory = (method: 'pushState' | 'replaceState') => {
              const orig_ = history[method].bind(history);
              history[method] = function (state: any, title: string, url?: string | URL | null) {
                if (url) {
                  const abs = new URL(String(url), location.origin).href;
                  (window as any).__spaRoutes__.push({ href: abs, text: '[SPA:' + method + ']' });
                }
                return orig_(state, title, url);
              };
            };
            patchHistory('pushState');
            patchHistory('replaceState');
            return routes;
          }, origin);

          for (const { href, text } of spaRoutes) {
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

          // Gap-5 cont: click interactive elements and capture URL changes (SPA route discovery)
          // Cap at 10 elements to avoid crawl explosion. Only click same-page elements (no forms).
          const clickTargets = await page.evaluate(() =>
            Array.from(document.querySelectorAll('[data-testid],[aria-label],[role="menuitem"],[role="tab"]'))
              .filter((el) => {
                const tag = el.tagName.toLowerCase();
                return tag !== 'input' && tag !== 'textarea' && tag !== 'select' && !(el as HTMLButtonElement).disabled;
              })
              .slice(0, 8)
              .map((el) => ({
                selector: el.id ? `#${el.id}` : el.getAttribute('data-testid') ? `[data-testid="${el.getAttribute('data-testid')}"]` : `[aria-label="${el.getAttribute('aria-label')}"]`,
                label: (el as HTMLElement).innerText?.trim().slice(0, 40) ?? el.getAttribute('aria-label') ?? '',
              }))
          );
          for (const target of clickTargets) {
            if (!target.selector) continue;
            const beforeUrl = page.url();
            try {
              await page.locator(target.selector).first().click({ timeout: 2000 });
              await page.waitForTimeout(500);
              const afterUrl = page.url();
              if (afterUrl !== beforeUrl && afterUrl.startsWith(origin) && !visited.has(afterUrl)) {
                const normalized = StaticRouteScanner.normalizeUrl(afterUrl);
                queue.push(normalized);
                mutator.addEdge(currentUrl, normalized, target.selector, target.label || normalized, 0.8);
              }
            } catch { /* soft fail per element */ }
            // Navigate back to avoid drift
            try { await page.goto(currentUrl, { waitUntil: 'domcontentloaded', timeout: CRAWL_TIMEOUT_MS }); await page.waitForTimeout(500); } catch { break; }
          }

          // Also capture any SPA routes recorded by the history patch during click exploration
          const patchedRoutes = await page.evaluate((orig: string) => {
            const routes = (window as any).__spaRoutes__ ?? [];
            return routes.filter((r: any) => r.href && r.href.startsWith(orig));
          }, origin).catch(() => [] as { href: string; text: string }[]);
          for (const { href, text } of patchedRoutes) {
            const normalized = StaticRouteScanner.normalizeUrl(href);
            if (!visited.has(normalized)) {
              queue.push(normalized);
              mutator.addEdge(currentUrl, normalized, 'history.pushState', text || normalized, 0.85);
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
