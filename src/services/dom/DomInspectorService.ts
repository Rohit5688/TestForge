import type { Browser, Frame } from 'playwright';
import type { IDomInspector, ActionStep } from '../../interfaces/IDomInspector.js';
import { ScreenshotStorage } from '../../utils/ScreenshotStorage.js';
import { SmartDomExtractor } from '../../utils/SmartDomExtractor.js';
import { McpConfigService } from '../../services/config/McpConfigService.js';
import { importPlaywright } from '../../utils/PlaywrightRuntime.js';

export type DomReturnFormat = 'markdown' | 'json' | 'yaml';

export class DomInspectorService implements IDomInspector {

  /**
   * Inspect a page's accessibility tree.
   *
   * @param returnFormat  'markdown' (default) — pruned Actionable Markdown for LLM prompts.
   *                      'json' — flat JsonElement[] array (locator + selectorArgs) for
   *                               custom-wrapper-aware POM generators.
   */
  public async inspect(url: string, waitForSelector?: string, storageState?: string, includeIframes?: boolean, actionSequence?: ActionStep[], timeoutMs: number = 60000, enableVisualMode: boolean = false, returnFormat: DomReturnFormat = 'markdown', projectRoot?: string, saveStorageState?: string, activePage?: import('playwright').Page): Promise<string> {
    let browser: Browser | null = null;
    // Use active persistent session page if provided — avoids spawning a new browser
    const usingActiveSession = !!activePage;
    try {
      let page: import('playwright').Page;
      let context: import('playwright').BrowserContext;

      if (activePage) {
        page = activePage;
        context = page.context();
        // If session is on a different URL, navigate to the requested one first.
        // Without this, the snapshot captures whatever the session happens to have open.
        const currentUrl = page.url();
        const targetOrigin = (() => { try { return new URL(url).origin; } catch { return null; } })();
        const currentOrigin = (() => { try { return new URL(currentUrl).origin; } catch { return null; } })();
        const sameOrigin = targetOrigin && targetOrigin === currentOrigin;
        if (currentUrl !== url && !(currentUrl.startsWith(url) || url.startsWith(currentUrl))) {
          // Only navigate if substantially different URL (not just trailing slash / query string variance)
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs }).catch(() => {});
          if (sameOrigin) {
            await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
          }
        }
      } else {
        // Gap-6: headed mode when enableVisualExploration=true in mcp-config.json
        let headless = true;
        if (projectRoot) {
          try { headless = !(new McpConfigService().read(projectRoot).enableVisualExploration); }
          catch { /* soft fail — stay headless */ }
        }
        const { chromium } = await importPlaywright();
        browser = await chromium.launch({ headless });
        const contextArgs: { storageState?: string } = {};
        if (storageState) contextArgs.storageState = storageState;
        context = await browser.newContext(contextArgs);
        page = await context.newPage();
      }
      let shadowText = '';
      // Active frame — starts as page, can be switched to an iframe via switchToFrame action
      let activeFrame: import('playwright').Page | Frame = page;
      // Per-step action log: compact ✅/❌ feedback for each actionSequence step
      const actionLog: string[] = [];

      // Maestro-inspired Action Sequence Execution
      if (actionSequence && actionSequence.length > 0) {
        // Always navigate to the target URL first before executing actions
        // (unless using an active session that may already be on the right page)
        if (!usingActiveSession) {
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
          await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
        }
        for (const step of actionSequence) {
          const stepLabel = `${step.action}${step.selector ? ' ' + step.selector.slice(0, 40) : ''}${step.value ? '="' + String(step.value).slice(0, 20) + '"' : ''}`;
          try {
          switch (step.action) { // eslint-disable-line
            case 'switchToFrame': {
              // Switch active context to an iframe. All subsequent fill/click actions target the frame.
              // frameSelector = CSS selector of <iframe> element, e.g. 'iframe[name="payment"]'
              const frameSel = step.frameSelector ?? step.selector ?? '';
              if (frameSel) {
                try {
                  const frameEl = await page.waitForSelector(frameSel, { timeout: step.timeout || 5000 });
                  const frameObj = await frameEl?.contentFrame();
                  if (frameObj) activeFrame = frameObj;
                } catch { /* soft fail — stays on current frame */ }
              }
              break;
            }
            case 'switchToMainFrame':
              // Return to main page context from an iframe
              activeFrame = page;
              break;
            case 'switchToNewTab': {
              // Wait for a new tab/popup to open (e.g. after clicking a link that opens target="_blank")
              // then switch page context to it. value = optional URL substring to match.
              try {
                const newPage = await context.waitForEvent('page', { timeout: step.timeout || 10000 });
                await newPage.waitForLoadState('domcontentloaded', { timeout: step.timeout || 10000 }).catch(() => {});
                page = newPage;
                activeFrame = newPage;
              } catch { /* soft fail — stays on current page */ }
              break;
            }
            case 'switchToTab': {
              // Switch to an existing tab by index (0-based) or URL substring match.
              // value = index (e.g. '0', '1') OR URL substring (e.g. 'dashboard')
              const pages = context.pages();
              const val = step.value ?? '0';
              const tabIndex = parseInt(val, 10);
              if (!isNaN(tabIndex) && pages[tabIndex]) {
                page = pages[tabIndex]!;
                activeFrame = page;
              } else {
                // Match by URL substring
                const match = pages.find(p => p.url().includes(val));
                if (match) { page = match; activeFrame = match; }
              }
              break;
            }
            case 'closeTab': {
              // Close current tab and switch back to the previous one (index 0 by default).
              // value = index to switch to after close (default '0')
              const pages = context.pages();
              if (pages.length > 1) {
                await page.close().catch(() => {});
                const targetIdx = parseInt(step.value ?? '0', 10);
                const remaining = context.pages();
                const target = remaining[targetIdx] ?? remaining[0];
                if (target) { page = target; activeFrame = target; }
              }
              break;
            }
            case 'goto':
              if (step.url) {
                await page.goto(step.url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
                // Adaptive: wait for network to settle (heavy SPAs need this), capped at 8s
                await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
              }
              break;
            case 'uploadFile':
              // Upload file(s) to an <input type="file"> element.
              // selector = file input selector, value = absolute file path (or comma-separated paths)
              if (step.selector && step.value) {
                const paths = step.value.split(',').map(p => p.trim());
                const filePaths: string[] = paths;
                try {
                  await activeFrame.locator(step.selector).setInputFiles(filePaths.length === 1 ? filePaths[0]! : filePaths, { timeout: step.timeout || 5000 });
                } catch { /* soft fail */ }
              }
              break;
            case 'fill':
              if (step.selector && step.value !== undefined) {
                // Try standard locator first; if element is in shadow DOM and not visible,
                // fall back to evaluate-based fill which pierces shadow roots
                try {
                  await activeFrame.locator(step.selector).fill(step.value, { timeout: 5000 });
                } catch {
                  // Shadow DOM fallback: recursively pierce all shadow roots to find and fill
                  await page.evaluate(({ selector, value }) => {
                    function queryShadow(root: Document | ShadowRoot | Element, sel: string): Element | null {
                      const direct = (root as any).querySelector(sel);
                      if (direct) return direct;
                      const all = (root as any).querySelectorAll('*');
                      for (const el of all) {
                        if (el.shadowRoot) {
                          const found = queryShadow(el.shadowRoot, sel);
                          if (found) return found;
                        }
                      }
                      return null;
                    }
                    const el = queryShadow(document, selector) as HTMLTextAreaElement | HTMLInputElement | null;
                    if (el) {
                      el.focus();
                      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set
                        ?? Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
                      if (nativeInputValueSetter) nativeInputValueSetter.call(el, value);
                      else el.value = value;
                      el.dispatchEvent(new Event('input', { bubbles: true }));
                      el.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                  }, { selector: step.selector, value: step.value });
                }
              }
              break;
            case 'click':
              if (step.selector) {
                try {
                  await activeFrame.locator(step.selector).click({ timeout: 5000 });
                } catch {
                  // Shadow DOM / strict mode fallback: find enabled element recursively and click
                  await page.evaluate((selector) => {
                    function queryShadowAll(root: Document | ShadowRoot | Element, sel: string): Element[] {
                      const results: Element[] = [];
                      const direct = (root as any).querySelectorAll(sel);
                      for (const el of direct) results.push(el);
                      const all = (root as any).querySelectorAll('*');
                      for (const el of all) {
                        if (el.shadowRoot) {
                          results.push(...queryShadowAll(el.shadowRoot, sel));
                        }
                      }
                      return results;
                    }
                    const matches = queryShadowAll(document, selector);
                    // Prefer enabled/non-disabled elements
                    const target = matches.find(el => !(el as HTMLButtonElement).disabled) ?? matches[0];
                    if (target) (target as HTMLElement).click();
                  }, step.selector);
                }
                // Adaptive: wait for navigation or DOM settle after click, capped at 5s
                await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {});
              }
              break;
            case 'wait':
              // Explicit wait — honour as-is (user knows what they need)
              await page.waitForTimeout(step.timeout || 2000);
              break;
            case 'clickText': {
              // Finds and clicks element by visible text content, piercing all shadow roots
              const text = step.selector ?? step.value ?? '';
              try {
                await page.getByRole('button', { name: text, exact: true }).click({ timeout: 3000 });
              } catch {
                await page.evaluate((searchText) => {
                  function findByText(root: Document | ShadowRoot | Element, txt: string): Element | null {
                    const all = (root as any).querySelectorAll('button, [role="button"], a, [role="link"]');
                    for (const el of all) {
                      if (el.textContent?.trim() === txt) return el;
                    }
                    const allEls = (root as any).querySelectorAll('*');
                    for (const el of allEls) {
                      if (el.shadowRoot) {
                        const found = findByText(el.shadowRoot, txt);
                        if (found) return found;
                      }
                    }
                    return null;
                  }
                  const target = findByText(document, searchText);
                  if (target) (target as HTMLElement).click();
                }, text);
              }
              await page.waitForLoadState('domcontentloaded', { timeout: 3000 }).catch(() => {});
              break;
            }
            case 'hover':
              // Hover over element (triggers tooltips, dropdowns)
              if (step.selector) {
                try {
                  await activeFrame.locator(step.selector).hover({ timeout: 5000 });
                } catch { /* soft fail */ }
              }
              break;
            case 'select':
              // Select option in <select> element. Supports multi-select via comma-separated values.
              if (step.selector && step.value !== undefined) {
                try {
                  const values = step.value.includes(',') ? step.value.split(',').map(v => v.trim()) : step.value;
                  await activeFrame.locator(step.selector).selectOption(values, { timeout: 5000 });
                } catch { /* soft fail */ }
              }
              break;
            case 'press':
              // Press keyboard key, e.g. 'Enter', 'Tab', 'Escape'
              // selector = element to focus (optional), value = key to press
              if (step.value) {
                if (step.selector) {
                  try { await activeFrame.locator(step.selector).press(step.value, { timeout: 3000 }); }
                  catch { await page.keyboard.press(step.value); }
                } else {
                  await page.keyboard.press(step.value);
                }
              }
              break;
            case 'clearAndFill':
              // Clear existing value then fill — useful for pre-populated inputs
              if (step.selector && step.value !== undefined) {
                try {
                  await activeFrame.locator(step.selector).clear({ timeout: 3000 });
                  await activeFrame.locator(step.selector).fill(step.value, { timeout: 5000 });
                } catch {
                  await page.evaluate(({ selector, value }) => {
                    function queryShadow(root: Document | ShadowRoot | Element, sel: string): Element | null {
                      const el = (root as any).querySelector(sel);
                      if (el) return el;
                      for (const child of (root as any).querySelectorAll('*')) {
                        if (child.shadowRoot) { const f = queryShadow(child.shadowRoot, sel); if (f) return f; }
                      }
                      return null;
                    }
                    const el = queryShadow(document, selector) as HTMLInputElement | HTMLTextAreaElement | null;
                    if (el) { el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })); el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }
                  }, { selector: step.selector, value: step.value });
                }
              }
              break;
            case 'waitForSelector': {
              // Wait until selector is present — with shadow DOM fallback polling
              if (step.selector) {
                const sel = step.selector;
                const timeoutMs2 = step.timeout || 10000;
                try {
                  // Native Playwright — supports >> combinator for shadow DOM
                  await page.waitForSelector(sel, { timeout: timeoutMs2 });
                } catch {
                  // Shadow DOM fallback: poll via evaluate piercing all shadow roots
                  const deadline = Date.now() + timeoutMs2;
                  let found = false;
                  while (Date.now() < deadline) {
                    found = await page.evaluate((selector) => {
                      function queryShadowExists(root: Document | ShadowRoot | Element, sel: string): boolean {
                        if ((root as any).querySelector(sel)) return true;
                        for (const el of (root as any).querySelectorAll('*')) {
                          if (el.shadowRoot && queryShadowExists(el.shadowRoot, sel)) return true;
                        }
                        return false;
                      }
                      return queryShadowExists(document, selector);
                    }, sel).catch(() => false);
                    if (found) break;
                    await page.waitForTimeout(300);
                  }
                }
              }
              break;
            }
            case 'evaluate':
              // Execute arbitrary JS in browser context. Use value field for the script string.
              if (step.value) {
                try { await page.evaluate(step.value as any); } catch { /* soft fail */ }
              }
              break;
            case 'waitForResponse': {
              // Wait for a network response matching a URL substring or glob pattern.
              // value = URL pattern to match (e.g. '/api/eva/chat', '**graphql**')
              // timeout = ms to wait (default 15000)
              // Use BEFORE the action that triggers the XHR, or set up as a promise first.
              // Example: { action: 'waitForResponse', value: '**/eva/**', timeout: 15000 }
              if (step.value) {
                const pattern = step.value;
                const waitMs = step.timeout || 15000;
                try {
                  await page.waitForResponse(
                    (resp) => resp.url().includes(pattern) || new RegExp(pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*')).test(resp.url()),
                    { timeout: waitMs }
                  );
                } catch { /* timeout — soft fail, continue */ }
              }
              break;
            }
          }
            actionLog.push(`✅ ${stepLabel}`);
          } catch (stepErr) {
            const errMsg = stepErr instanceof Error ? stepErr.message.slice(0, 80) : String(stepErr).slice(0, 80);
            actionLog.push(`❌ ${stepLabel} → ${errMsg}`);
          }
        }
        // Extract Shadow DOM text content and append to output context
        shadowText = await page.evaluate(() => {
        function extractShadowText(root: Document | ShadowRoot | Element): string {
          const texts: string[] = [];
          if ('textContent' in root && (root as Element).textContent?.trim()) {
            // Only collect from leaf-ish elements to avoid duplication
          }
          const children = (root as any).querySelectorAll ? Array.from((root as any).querySelectorAll('*')) : [];
          for (const el of children as Element[]) {
            if (el.shadowRoot) {
              const shadowContent = extractShadowText(el.shadowRoot);
              if (shadowContent) texts.push(shadowContent);
            }
          }
          // Also get direct text from this shadow root
          if (root instanceof ShadowRoot) {
            const direct = Array.from(root.childNodes)
              .filter(n => n.nodeType === Node.TEXT_NODE || (n as Element).tagName)
              .map(n => n.textContent?.trim())
              .filter(Boolean)
              .join(' ');
            if (direct) texts.unshift(direct);
            // Get all text from shadow root elements
            const allText = root.textContent?.trim();
            if (allText) texts.unshift(allText);
          }
          return [...new Set(texts)].join('\n');
        }
        return extractShadowText(document);
      }).catch(() => '');

      // Adaptive final settle: best-effort network idle, capped at 3s
        // (intentionally short — chatbots/SPAs may keep polling indefinitely)
        // Gap-3 fix: URL-change polling instead of magic-number networkidle wait.
        // Poll until URL no longer contains a login path — up to 30s.
        // Falls back to 15s networkidle if URL never changes (MFA/captcha flow).
        const preActionUrl = page.url();
        const loginPatterns = ['/login', '/signin', '/sign-in', '/auth', '/sso'];
        const isLoginUrl = (u: string) => loginPatterns.some(p => u.includes(p));
        if (isLoginUrl(preActionUrl)) {
          // Wait for navigation away from login page
          const deadline = Date.now() + 30000;
          while (Date.now() < deadline) {
            await page.waitForTimeout(300);
            if (!isLoginUrl(page.url())) break;
          }
          // Final settle after redirect
          await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
        } else {
          // Not a login page — standard networkidle settle
          await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
        }
        // Save session cookies/storage so subsequent calls can skip login
        // Works for both persistent session and standalone browser contexts
        if (saveStorageState) {
          await context.storageState({ path: saveStorageState });
        }
      } else if (!usingActiveSession) {
        // No action sequence and no active session — navigate directly to the target URL
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
        // Adaptive: wait for network idle (SPA hydration), capped at 10s
        await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      }
      // If using active session with no actionSequence, just snapshot current page state

      if (waitForSelector) {
        await page.waitForSelector(waitForSelector, { timeout: 5000 }).catch(() => { });
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

      // Gap-2 fix: Deep shadow DOM pierce — runs ALWAYS (not just as fallback).
      // ariaSnapshot() only sees light DOM. Custom web components (<ecs-*>, <app-*> etc.)
      // live in shadow roots and are invisible to ariaSnapshot. We pierce all shadow roots
      // and merge found elements into a shadowElements array on the snapshot.
      const shadowElements = await page.evaluate(() => {
        interface ShadowEl { tag: string; dataQa?: string; testId?: string; ariaLabel?: string; placeholder?: string; text?: string; role?: string; selector: string; }
        function pierceAll(root: Document | ShadowRoot | Element, depth = 0): ShadowEl[] {
          if (depth > 8) return [];
          const results: ShadowEl[] = [];
          const interactive = (root as any).querySelectorAll?.('button, input, select, textarea, a, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [data-qa], [data-testid]') ?? [];
          for (const el of Array.from(interactive) as Element[]) {
            const dataQa = el.getAttribute('data-qa') ?? undefined;
            const testId = el.getAttribute('data-testid') ?? el.getAttribute('data-test') ?? undefined;
            const ariaLabel = el.getAttribute('aria-label') ?? undefined;
            const placeholder = (el as HTMLInputElement).placeholder || undefined;
            const text = el.textContent?.trim().slice(0, 60) || undefined;
            const role = el.getAttribute('role') ?? el.tagName.toLowerCase();
            // Build best selector: prefer data-qa > data-testid > aria-label > text
            let selector = '';
            if (dataQa) selector = `[data-qa="${dataQa}"]`;
            else if (testId) selector = `[data-testid="${testId}"]`;
            else if (ariaLabel) selector = `[aria-label="${ariaLabel}"]`;
            else if (el.id) selector = `#${el.id}`;
            else selector = '';
            if (selector || dataQa || testId || ariaLabel || placeholder) {
              const entry: ShadowEl = { tag: el.tagName.toLowerCase(), role, selector };
              if (dataQa) entry.dataQa = dataQa;
              if (testId) entry.testId = testId;
              if (ariaLabel) entry.ariaLabel = ariaLabel;
              if (placeholder) entry.placeholder = placeholder;
              if (text) entry.text = text;
              results.push(entry);
            }
          }
          // Recurse into shadow roots
          for (const el of Array.from((root as any).querySelectorAll?.('*') ?? [])) {
            if ((el as any).shadowRoot) {
              results.push(...pierceAll((el as any).shadowRoot, depth + 1));
            }
          }
          return results;
        }
        return pierceAll(document);
      }).catch(() => [] as any[]);

      // Merge shadow elements into snapshot — only if they add new info
      if (shadowElements.length > 0 && mainSnapshot) {
        (mainSnapshot as any).shadowElements = shadowElements.slice(0, 80);
      } else if (shadowElements.length > 0) {
        mainSnapshot = { shadowOnly: true, shadowElements: shadowElements.slice(0, 80) };
      }

      // Fallback: extract a compact semantic structure by querying interactive elements directly
      // Fix 6: Enhanced fallback with positional context for elements with no aria-label/text
      if (!mainSnapshot) {
        mainSnapshot = await page.evaluate(() => {
          const sel = 'a, button, input, select, textarea, [role], h1, h2, h3, label';
          const allEls = Array.from(document.querySelectorAll(sel)).slice(0, 150);
          return {
            fallback: true,
            elements: allEls.map((el, idx) => {
              const tag = el.tagName.toLowerCase();
              const ariaLabel = el.getAttribute('aria-label');
              const ariaDescribedBy = el.getAttribute('aria-describedby');
              const textContent = el.textContent?.trim().slice(0, 80);
              const name = (ariaLabel ?? el.getAttribute('name') ?? textContent) || undefined;
              // Positional fallback: find nearest ancestor with id/data-testid, or use nth-of-type
              const parent = el.closest('[id], [data-testid], [data-test], section, article, nav, main, aside, header, footer');
              const parentId = parent?.id ? parent.id : (parent?.getAttribute('data-testid') ? parent.getAttribute('data-testid') : parent?.tagName?.toLowerCase());
              // Generate a positional CSS selector as fallback for unlabeled elements
              const nthIdx = allEls.filter((e, i) => i < idx && e.tagName === el.tagName).length + 1;
              const positionalSelector = parentId
                ? `${parentId ? `[id="${parent?.id}"] ` : ''}${tag}:nth-of-type(${nthIdx})`
                : `${tag}:nth-of-type(${nthIdx})`;
              return {
                tag,
                role: el.getAttribute('role') ?? undefined,
                name: name || undefined,
                id: el.id || undefined,
                testId: el.getAttribute('data-testid') || el.getAttribute('data-test') || undefined,
                ariaLabel: ariaLabel || undefined,
                ariaDescribedBy: ariaDescribedBy || undefined,
                placeholder: (el as HTMLInputElement).placeholder || undefined,
                type: (el as HTMLInputElement).type || undefined,
                // Positional selector for unlabeled elements (⚠️ brittle — use only as last resort)
                positionalSelector: !name ? positionalSelector : undefined,
                parentContext: parentId || undefined,
              };
            })
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
          const stored = ScreenshotStorage.storeBase64(projectRoot || process.cwd(), 'dom-inspect', buffer.toString('base64'));
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
          const frameUrl = frame.url();
          try {
            // CSS/evaluate fallback: extract interactive elements when ariaSnapshot is blocked
            // by cross-origin policy. Uses document.querySelectorAll inside the frame context.
            const elements = await frame.evaluate(() => {
              const selectors = [
                'button', 'input', 'select', 'textarea', 'a[href]',
                '[role="button"]', '[role="textbox"]', '[role="combobox"]',
                '[data-testid]', '[data-qa]', '[aria-label]'
              ];
              const seen = new Set<string>();
              return selectors.flatMap(sel => {
                return Array.from(document.querySelectorAll(sel)).map((el: Element) => ({
                  tag: el.tagName.toLowerCase(),
                  role: el.getAttribute('role') ?? undefined,
                  type: (el as HTMLInputElement).type ?? undefined,
                  name: el.getAttribute('name') ?? undefined,
                  ariaLabel: el.getAttribute('aria-label') ?? undefined,
                  testId: el.getAttribute('data-testid') ?? el.getAttribute('data-qa') ?? undefined,
                  text: (el.textContent ?? '').trim().slice(0, 60) || undefined,
                  placeholder: (el as HTMLInputElement).placeholder ?? undefined
                }));
              }).filter(e => {
                // Composite dedup key — prevents false-dedup of elements sharing tag+name
                // but differing in testId/ariaLabel/placeholder (e.g. two different inputs).
                const key = `${e.tag}|${e.testId ?? ''}|${e.ariaLabel ?? ''}|${e.name ?? ''}|${e.placeholder ?? ''}|${e.text?.slice(0, 20) ?? ''}`;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
              }).slice(0, 80); // cap at 80 — covers complex iframes without token bloat
            });
            result.iframes.push({ url: frameUrl, snapshot: elements });
          } catch (e: any) {
            // True cross-origin block — evaluate() throws SecurityError
            result.iframes.push({
              url: frameUrl,
              snapshot: `[CROSS-ORIGIN BLOCKED] Cannot inspect frame at "${frameUrl}". ` +
                `ariaSnapshot and evaluate() both restricted by browser same-origin policy. ` +
                `To inspect, load the frame URL directly via inspect_page_dom({ url: "${frameUrl}" }).`
            });
          }
        }
      }

      let safeResult;
      try {
        const v8 = require('v8');
        safeResult = v8.deserialize(v8.serialize(result));
      } catch (e) {
        safeResult = result;
      }

      const rawJson = JSON.stringify(safeResult, (key, value) => {
        if (value instanceof Error) return { message: value.message, name: value.name };
        return value;
      }, 2);
      // Branch on returnFormat:
      //   'json'     → flat JsonElement[] (custom-wrapper friendly, auto-cached)
      //   'yaml'     → compact YAML-like locator list (~60% fewer tokens than markdown)
      //   'markdown' → pruned Actionable Markdown (default)
      const actionLogHeader = actionLog.length > 0
        ? `# [ACTION LOG]\n${actionLog.join('\n')}\n`
        : '';

      if (returnFormat === 'json') {
        const jsonOut = SmartDomExtractor.extractAsJson(rawJson, url);
        return actionLogHeader ? `${actionLogHeader}\n${jsonOut}` : jsonOut;
      }
      if (returnFormat === 'yaml') {
        const yamlOut = SmartDomExtractor.extractAsYaml(rawJson, url, screenshotPath);
        return actionLogHeader ? `${actionLogHeader}\n${yamlOut}` : yamlOut;
      }
      // TASK-62: transform raw AOM JSON → pruned Actionable Markdown
      let markdown = SmartDomExtractor.extract(rawJson, url, screenshotPath);
      if (actionLogHeader) markdown = actionLogHeader + '\n' + markdown;
      // Append Shadow DOM text if captured (e.g. Eva chatbot responses in web components)
      if (shadowText && shadowText.trim().length > 10) {
        markdown += `\n\n---\n## Shadow DOM Content\n\`\`\`\n${shadowText.trim().slice(0, 3000)}\n\`\`\``;
      }
      const estimatedTokens = Math.ceil(markdown.length / 4);
      if (estimatedTokens > 3000) {
        markdown = `⚠️ **Token Budget Warning**: This page output is extremely large (~${estimatedTokens} tokens). Consider using returnFormat:'json' for more compact output, or add a selector filter to inspect only a specific region.\n\n` + markdown;
      }
      return markdown;

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
        return `[ERROR] Page at "${url}" took too long to load. Details: ${msg}`;
      }
      return `[ERROR] Failed to inspect DOM at ${url}:\n${msg}`;
    } finally {
      // Only close browser if WE launched it — never close the persistent session browser
      if (browser && !usingActiveSession) await browser.close().catch(() => { });
    }
  }
}
