/**
 * SmartDomExtractor — TASK-62 / CLAUDE-REC-1 & 2
 *
 * Ports noise-filtering logic from page-agent (packages/page-controller/src/dom/dom_tree/index.ts).
 * Converts a Playwright accessibility-tree JSON snapshot into pruned "Actionable Markdown" or
 * a structured JSON array that is safe to include directly in LLM prompts.
 *
 * Rules (derived from page-agent browser-use port):
 *  1. Only emit nodes with a locator strategy (id, testId, role+name, text).
 *  2. Skip SVG/icon-only containers and purely decorative elements.
 *  3. Deduplicate duplicate aria-label ↔ text values.
 *  4. Cap text at 80 chars.
 *  5. Emit coordinate-based fallback hint when a node has no standard selector.
 *  6. Limit total output to MAX_NODES actionable nodes to stay under token budget.
 *
 * CLAUDE-REC-1: deriveSelector() now returns Playwright API strings (page.getBy…) instead
 * of raw selector syntax. This prevents the "Habit Regression" where LLMs generate
 * CSS/XPath selectors instead of the semantically stable Playwright locator API.
 *
 * CLAUDE-REC-2: extractAsJson() returns a structured flat array for inspect_page_dom JSON mode.
 */

const MAX_NODES = 150;
const MAX_TEXT = 80;

/** Subset of the Playwright accessibility node shape */
interface A11yNode {
  role?: string;
  name?: string;
  value?: string;
  children?: A11yNode[];
  // Playwright-specific extensions available when snapshot is called with full tree
  [key: string]: unknown;
}

/**
 * Structured selector arguments — the semantic data behind a Playwright API call.
 * Custom wrapper adapters (e.g. @myorg/playwright-helpers) can consume selectorArgs
 * directly instead of parsing the playwrightLocator string.
 *
 * Example custom wrapper translation:
 *   selectorArgs { method:'getByRole', role:'button', name:'Submit' }
 *   → BasePage: this.getButton('Submit')  OR  wrapper.clickByRole('button','Submit')
 */
export interface SelectorArgs {
  /** Which Playwright locator method applies */
  method: 'getByTestId' | 'getByLabel' | 'getByPlaceholder' | 'getByRole' | 'getByText';
  /** ARIA role (present for getByRole) */
  role?: string;
  /** Accessible name / text (present for getByRole, getByLabel, getByText) */
  name?: string;
  /** Test ID value (present for getByTestId) */
  testId?: string;
  /** Placeholder text (present for getByPlaceholder) */
  placeholder?: string;
}

/** Flat element suitable for Actionable Markdown rendering */
interface ActionableElement {
  index: number;
  role: string;
  name?: string;
  value?: string;
  /**
   * Ready-to-use Playwright API call string, e.g.
   *   page.getByRole('button', { name: 'Submit', exact: true })
   * Copy directly into standard Page Objects. For custom wrappers, use selectorArgs.
   */
  selector: string;
  /**
   * 'playwrightApi' = a stable AOM-based locator (use selector or selectorArgs).
   * 'coordinate-fallback' = no stable selector found; element needs coordinate-based click.
   */
  selectorStrategy: 'playwrightApi' | 'coordinate-fallback';
  /** Structured selector data — use this with custom wrapper adapters */
  selectorArgs?: SelectorArgs;
  /** Raw AOM node for downstream use */
  raw?: A11yNode;
}

/**
 * Flat JSON element for structured JSON output mode (inspect_page_dom returnFormat:'json').
 *
 * `locator`      — Playwright API string, copy directly into standard Page Objects.
 * `selectorArgs` — Structured data for custom wrapper adapters; see SelectorArgs.
 */
export interface JsonElement {
  id: number;
  role: string;
  text?: string;
  /** Standard Playwright API locator string */
  locator: string;
  /**
   * Structured selector args for custom wrapper translation.
   * Present on all elements except coordinate-fallbacks.
   */
  selectorArgs?: SelectorArgs;
}

// Roles we actively want to expose to the LLM for interaction
const ACTIONABLE_ROLES = new Set([
  'button', 'link', 'textbox', 'searchbox', 'combobox', 'listbox',
  'checkbox', 'radio', 'switch', 'slider', 'spinbutton', 'menuitem',
  'tab', 'option', 'treeitem', 'gridcell', 'columnheader', 'rowheader',
  'menuitemcheckbox', 'menuitemradio',
]);

// Roles we emit as structural headings (not interaction targets)
const SEMANTIC_ROLES = new Set([
  'heading', 'main', 'navigation', 'banner', 'contentinfo', 'region',
  'complementary', 'form', 'search',
]);

// Always-skip roles — SVG decorations, hidden containers
const SKIP_ROLES = new Set([
  'img', 'presentation', 'none', 'separator', 'scrollbar', 'status',
  'alert', 'log', 'timer', 'tooltip',
]);

// Input-like roles that may have a label or placeholder attribute
const INPUT_ROLES = new Set(['textbox', 'searchbox', 'spinbutton', 'combobox']);

function capText(s: string): string {
  return s.length > MAX_TEXT ? s.slice(0, MAX_TEXT) + '…' : s;
}

/**
 * CLAUDE-REC-1: Derives a Playwright API string AND structured SelectorArgs from
 * an accessibility node. Prioritises the most stable strategy available.
 *
 * Priority ladder:
 *   1. data-testid → page.getByTestId()      selectorArgs.method = 'getByTestId'
 *   2. label text  → page.getByLabel()       selectorArgs.method = 'getByLabel'
 *   3. placeholder → page.getByPlaceholder() selectorArgs.method = 'getByPlaceholder'
 *   4. role+name   → page.getByRole()        selectorArgs.method = 'getByRole'
 *   5. visible txt → page.getByText()        selectorArgs.method = 'getByText'
 *
 * Custom wrapper usage:
 *   Standard Playwright → use result.selector directly
 *   Custom wrapper (e.g. @myorg/helpers) → use result.args to call wrapper's own API:
 *     args.method='getByRole', args.role='button', args.name='Submit'
 *     → BasePage.getButton('Submit') or wrapper.clickByRole('button','Submit')
 */
function deriveSelector(node: A11yNode): {
  selector: string;
  strategy: ActionableElement['selectorStrategy'];
  args: SelectorArgs;
} | null {
  const role = (node.role ?? '').toLowerCase();
  const name = node.name?.trim() ?? '';

  // Priority 1: data-testid — most stable explicit testing hook
  const testId = (node as any)['data-testid'] ?? (node as any).testId;
  if (testId) {
    const tid = String(testId);
    return {
      selector: `page.getByTestId(${JSON.stringify(tid)})`,
      strategy: 'playwrightApi',
      args: { method: 'getByTestId', testId: tid },
    };
  }

  // Priority 2: label text — for inputs associated via label or aria-label
  if (name && INPUT_ROLES.has(role)) {
    const label = capText(name);
    return {
      selector: `page.getByLabel(${JSON.stringify(label)})`,
      strategy: 'playwrightApi',
      args: { method: 'getByLabel', name: label },
    };
  }

  // Priority 3: placeholder text — for textbox/searchbox without a visible label
  const placeholder = (node as any).placeholder ?? (node as any)['aria-placeholder'];
  if (placeholder && INPUT_ROLES.has(role)) {
    const ph = capText(String(placeholder));
    return {
      selector: `page.getByPlaceholder(${JSON.stringify(ph)})`,
      strategy: 'playwrightApi',
      args: { method: 'getByPlaceholder', placeholder: ph, role },
    };
  }

  // Priority 4: named role — most common case for buttons, links, checkboxes etc.
  if (role && name && ACTIONABLE_ROLES.has(role)) {
    const escaped = capText(name);
    return {
      selector: `page.getByRole(${JSON.stringify(role)}, { name: ${JSON.stringify(escaped)}, exact: true })`,
      strategy: 'playwrightApi',
      args: { method: 'getByRole', role, name: escaped },
    };
  }

  // Priority 5: link or button with visible text but no aria name
  if ((role === 'link' || role === 'button') && name) {
    const text = capText(name);
    return {
      selector: `page.getByText(${JSON.stringify(text)}, { exact: true })`,
      strategy: 'playwrightApi',
      args: { method: 'getByText', name: text, role },
    };
  }

  return null;
}

function collectNodes(node: A11yNode, results: ActionableElement[], depth: number): void {
  if (results.length >= MAX_NODES) return;
  if (!node || typeof node !== 'object') return;

  const role = (node.role ?? '').toLowerCase();

  if (SKIP_ROLES.has(role)) return;

  if (ACTIONABLE_ROLES.has(role)) {
    const sel = deriveSelector(node);
    if (sel) {
      results.push({
        index: results.length + 1,
        role,
        ...(node.name ? { name: capText(node.name) } : {}),
        ...(node.value ? { value: capText(String(node.value)) } : {}),
        selector: sel.selector,
        selectorStrategy: sel.strategy,
        // selectorArgs carried for custom-wrapper-aware generation
        selectorArgs: sel.args,
        raw: node,
      } as ActionableElement);
    } else {
      // Coordinate-based fallback: emit a hint so the agent knows this element exists
      // but has no stable selector for direct clicking — matches page-agent fallback pattern.
      results.push({
        index: results.length + 1,
        role,
        ...(node.name ? { name: capText(node.name) } : {}),
        selector: '[coordinate-fallback]',
        selectorStrategy: 'coordinate-fallback',
        raw: node,
      } as ActionableElement);
    }
  }

  // Always recurse into children regardless of role (structural containers hold leaves)
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      collectNodes(child, results, depth + 1);
    }
  }
}

function renderActionableMarkdown(elements: ActionableElement[], pageUrl: string): string {
  const lines: string[] = [
    `## Actionable Elements — ${pageUrl}`,
    `> Pruned DOM (${elements.length} actionable node${elements.length !== 1 ? 's' : ''}). Use these Playwright locators exactly — copy them directly into Page Objects.`,
    '',
  ];

  for (const el of elements) {
    const valuePart = el.value ? ` value="${el.value}"` : '';
    const namePart = el.name ? ` "${el.name}"` : '';
    const flag = el.selectorStrategy === 'coordinate-fallback' ? ' ⚠️ no-stable-selector' : '';
    lines.push(`[${el.index}] <${el.role}${namePart}${valuePart}> → \`${el.selector}\`${flag}`);
  }

  if (elements.length === 0) {
    lines.push('_(No actionable elements detected. Page may be empty or JS-heavy — try waitForSelector.)_');
  }

  return lines.join('\n');
}

export class SmartDomExtractor {

  /**
   * CLAUDE-REC-2: Extract accessibility tree as a flat JSON array.
   * Returns Array<{ id, role, text, locator }> where `locator` is a Playwright API string.
   * Use this format when calling inspect_page_dom with returnFormat:'json'.
   *
   * @param rawJson  JSON string from DomInspectorService.inspect()
   * @param pageUrl  URL of the page being inspected (for metadata)
   * @returns        JSON string of JsonElement[]
   */
  static extractAsJson(rawJson: string, _pageUrl: string): string {
    let parsed: { mainFrame?: A11yNode; iframes?: { url: string; snapshot: A11yNode }[] } | null = null;
    try {
      parsed = JSON.parse(rawJson);
    } catch {
      return JSON.stringify([]);
    }
    if (!parsed || typeof parsed !== 'object') return JSON.stringify([]);

    // Handle ariaYaml envelope — convert via markdown path, then parse back to JSON
    if (parsed.mainFrame && (parsed.mainFrame as any).ariaYaml) {
      const markdownResult = SmartDomExtractor.extract(rawJson, _pageUrl);
      return SmartDomExtractor._markdownToJson(markdownResult);
    }

    // Handle fallback shape
    if (parsed.mainFrame && (parsed.mainFrame as any).fallback) {
      const fallbackEls = ((parsed.mainFrame as any).elements ?? []) as Array<{ tag: string; role?: string; name?: string; id?: string; testId?: string }>;
      const result: JsonElement[] = fallbackEls.slice(0, MAX_NODES).map((el, i) => {
        let locator: string;
        let args: SelectorArgs | undefined;
        if (el.testId) {
          locator = `page.getByTestId(${JSON.stringify(el.testId)})`;
          args = { method: 'getByTestId', testId: el.testId };
        } else if (el.id) {
          // id-based selectors have no dedicated Playwright method — use locator()
          locator = `page.locator(${JSON.stringify('#' + el.id)})`;
        } else if (el.name) {
          locator = `page.getByLabel(${JSON.stringify(capText(el.name))})`;
          args = { method: 'getByLabel', name: capText(el.name) };
        } else {
          locator = `page.locator(${JSON.stringify(el.tag)})`;
        }
        return {
          id: i + 1,
          role: el.role ?? el.tag,
          ...(el.name ? { text: el.name } : {}),
          locator,
          ...(args ? { selectorArgs: args } : {}),
        };
      });
      return JSON.stringify(result, null, 2);
    }

    const elements: ActionableElement[] = [];
    if (parsed.mainFrame) collectNodes(parsed.mainFrame, elements, 0);
    if (Array.isArray(parsed.iframes)) {
      for (const frame of parsed.iframes) {
        if (frame.snapshot && typeof frame.snapshot === 'object') {
          collectNodes(frame.snapshot as A11yNode, elements, 0);
        }
      }
    }

    const result: JsonElement[] = elements
      .filter(el => el.selectorStrategy !== 'coordinate-fallback')
      .map(el => ({
        id: el.index,
        role: el.role,
        ...(el.name ? { text: el.name } : {}),
        locator: el.selector,
        // selectorArgs lets custom-wrapper generators avoid parsing the API string
        ...(el.selectorArgs ? { selectorArgs: el.selectorArgs } : {}),
      }));

    return JSON.stringify(result, null, 2);
  }

  /** Convert Actionable Markdown back to minimal JSON (used when only ariaYaml path ran) */
  private static _markdownToJson(markdown: string): string {
    const lineRe = /^\[(\d+)\]\s+<([\w]+)(?:\s+"([^"]*)")?>.*?→\s+`(.+?)`/;
    const elements: JsonElement[] = [];
    for (const line of markdown.split('\n')) {
      const m = lineRe.exec(line.trim());
      if (!m) continue;
      elements.push({
        id: parseInt(m[1]!, 10),
        role: m[2]!,
        ...(m[3] ? { text: m[3] } : {}),
        locator: m[4]!,
      });
    }
    return JSON.stringify(elements, null, 2);
  }

  /**
   * Convert a raw accessibility-tree JSON string (as returned by DomInspectorService)
   * into pruned Actionable Markdown.
   *
   * @param rawJson  JSON string from DomInspectorService.inspect()
   * @param pageUrl  URL of the page being inspected (for header)
   * @returns        Actionable Markdown string
   */
  static extract(rawJson: string, pageUrl: string, screenshotPath?: string): string {
    // Build the screenshot banner for VSCode/Cline users (file:// link they can open directly)
    const screenshotBanner = screenshotPath
      ? `\n> 📸 **Full-page screenshot saved** → \`${screenshotPath}\` (open this file to see the visual layout)\n`
      : '';
    let parsed: { mainFrame?: A11yNode; iframes?: { url: string; snapshot: A11yNode }[]; screenshot?: unknown } | null = null;

    try {
      parsed = JSON.parse(rawJson);
    } catch {
      // If not JSON (e.g. an error string), return as-is
      return rawJson;
    }

    if (!parsed || typeof parsed !== 'object') return rawJson;

    const elements: ActionableElement[] = [];

    // Main frame
    if (parsed.mainFrame) {
      // New ariaYaml envelope: from page.ariaSnapshot() (Playwright v1.44+)
      if ((parsed.mainFrame as any).ariaYaml) {
        return screenshotBanner + SmartDomExtractor.extractFromAriaYaml((parsed.mainFrame as any).ariaYaml as string, pageUrl);
      }
      if ((parsed.mainFrame as any).fallback) {
        // Fallback shape: { fallback: true, elements: [...] }
        return screenshotBanner + SmartDomExtractor.extractFromFallbackElements((parsed.mainFrame as any).elements ?? [], pageUrl);
      }
      collectNodes(parsed.mainFrame, elements, 0);
    }

    // Append iframe elements (prefixed)
    if (Array.isArray(parsed.iframes)) {
      for (const frame of parsed.iframes) {
        if (frame.snapshot && typeof frame.snapshot === 'object') {
          collectNodes(frame.snapshot as A11yNode, elements, 0);
        }
      }
    }

    return screenshotBanner + renderActionableMarkdown(elements, pageUrl);
  }

  /** Handle the DOM fallback shape (non-AOM pages) */
  private static extractFromFallbackElements(
    rawElements: Array<{ tag: string; role?: string; name?: string; id?: string; testId?: string }>,
    pageUrl: string,
  ): string {
    const lines: string[] = [
      `## Actionable Elements — ${pageUrl} [fallback scan]`,
      `> AOM unavailable — extracted from interactive DOM elements. Locators are Playwright API strings.`,
      '',
    ];

    let idx = 1;
    for (const el of rawElements.slice(0, MAX_NODES)) {
      let locator: string;
      if (el.testId) locator = `page.getByTestId(${JSON.stringify(el.testId)})`;
      else if (el.id) locator = `page.locator(${JSON.stringify('#' + el.id)})`;
      else if (el.name) locator = `page.getByLabel(${JSON.stringify(capText(el.name))})`;
      else locator = `page.locator(${JSON.stringify(el.tag)})`;

      lines.push(`[${idx++}] <${el.tag}> → \`${locator}\``);
    }

    if (lines.length === 3) {
      lines.push('_(No actionable elements found in fallback scan.)_');
    }

    return lines.join('\n');
  }

  /**
   * Handle ariaYaml envelope from page.ariaSnapshot() (Playwright v1.44+).
   * The YAML is a human-readable representation of the AOM with indented roles.
   * We parse it line-by-line to extract actionable elements (role + name pairs).
   *
   * CLAUDE-REC-1: All selectors emitted here use Playwright API strings.
   */
  private static extractFromAriaYaml(yaml: string, pageUrl: string): string {
    const lines: string[] = [
      `## Actionable Elements — ${pageUrl} [AOM via ariaSnapshot]`,
      `> Full Playwright Accessibility Tree. Copy locators directly into Page Objects — no transformation needed.`,
      '',
    ];

    // Regex to match lines like:  - button "Submit" or  - textbox "Email address:"
    const roleNameRe = /^\s*-\s+(\w+)\s+(?:"([^"]*)"|'([^']*)')?/;
    let idx = 1;
    const yamlLines = yaml.split('\n');

    for (const line of yamlLines) {
      const m = roleNameRe.exec(line);
      if (!m) continue;
      const role = (m[1] as string).toLowerCase();
      const name = (m[2] ?? m[3] ?? '').trim();

      if (SKIP_ROLES.has(role)) continue;

      // CLAUDE-REC-1: Emit Playwright API strings, not raw selector syntax
      let selector: string;
      if (name && INPUT_ROLES.has(role)) {
        selector = `page.getByLabel(${JSON.stringify(capText(name))})`;
      } else if (name && ACTIONABLE_ROLES.has(role)) {
        selector = `page.getByRole(${JSON.stringify(role)}, { name: ${JSON.stringify(capText(name))}, exact: true })`;
      } else if (name) {
        selector = `page.getByText(${JSON.stringify(capText(name))}, { exact: true })`;
      } else {
        selector = `page.getByRole(${JSON.stringify(role)})`;
      }

      const namePart = name ? ` "${capText(name)}"` : '';
      lines.push(`[${idx++}] <${role}${namePart}> → \`${selector}\``);
      if (idx > MAX_NODES + 1) break;
    }

    return lines.join('\n');
  }
}
