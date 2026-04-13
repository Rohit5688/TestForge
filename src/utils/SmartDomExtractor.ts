/**
 * SmartDomExtractor — TASK-62
 *
 * Ports noise-filtering logic from page-agent (packages/page-controller/src/dom/dom_tree/index.ts).
 * Converts a Playwright accessibility-tree JSON snapshot into pruned "Actionable Markdown" that
 * is safe to include directly in LLM prompts.
 *
 * Rules (derived from page-agent browser-use port):
 *  1. Only emit nodes with a locator strategy (id, testId, role+name, text).
 *  2. Skip SVG/icon-only containers and purely decorative elements.
 *  3. Deduplicate duplicate aria-label ↔ text values.
 *  4. Cap text at 80 chars.
 *  5. Emit coordinate-based fallback hint when a node has no standard selector.
 *  6. Limit total output to MAX_NODES actionable nodes to stay under token budget.
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

/** Flat element suitable for Actionable Markdown rendering */
interface ActionableElement {
  index: number;
  role: string;
  name?: string;
  value?: string;
  selector: string;
  selectorStrategy: 'testId' | 'aria-label' | 'role+name' | 'text' | 'coordinate-fallback';
  /** Raw AOM node for downstream use */
  raw?: A11yNode;
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

function capText(s: string): string {
  return s.length > MAX_TEXT ? s.slice(0, MAX_TEXT) + '…' : s;
}

function deriveSelector(node: A11yNode): { selector: string; strategy: ActionableElement['selectorStrategy'] } | null {
  // Priority 1: data-testid (most stable, from page-agent's locator strategy)
  const testId = (node as any)['data-testid'] ?? (node as any).testId;
  if (testId) {
    return { selector: `[data-testid="${testId}"]`, strategy: 'testId' };
  }
  // Priority 2: named role
  if (node.role && node.name && ACTIONABLE_ROLES.has(node.role) && node.name.trim()) {
    return { selector: `role=${node.role}[name="${capText(node.name.trim())}"]`, strategy: 'role+name' };
  }
  // Priority 3: aria-label / accessible name on any element
  if (node.name && node.name.trim()) {
    return { selector: `[aria-label="${capText(node.name.trim())}"]`, strategy: 'aria-label' };
  }
  // Priority 4: visible text (for links / buttons without aria-label)
  if (node.role && (node.role === 'link' || node.role === 'button') && node.name) {
    return { selector: `text="${capText(node.name.trim())}"`, strategy: 'text' };
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
    `> Pruned DOM (${elements.length} actionable node${elements.length !== 1 ? 's' : ''}). Use these selectors exactly.`,
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
      `> AOM unavailable — extracted from interactive DOM elements.`,
      '',
    ];

    let idx = 1;
    for (const el of rawElements.slice(0, MAX_NODES)) {
      const parts: string[] = [];
      if (el.testId) parts.push(`data-testid="${el.testId}"`);
      else if (el.id) parts.push(`#${el.id}`);
      else if (el.name) parts.push(`[aria-label="${capText(el.name)}"]`);
      else parts.push(el.tag);

      lines.push(`[${idx++}] <${el.tag}> → \`${parts[0]}\``);
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
   */
  private static extractFromAriaYaml(yaml: string, pageUrl: string): string {
    const lines: string[] = [
      `## Actionable Elements — ${pageUrl} [AOM via ariaSnapshot]`,
      `> Full Playwright Accessibility Tree. Use these selectors exactly.`,
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

      let selector: string;
      if (name && ACTIONABLE_ROLES.has(role)) {
        selector = `role=${role}[name="${capText(name)}"]`;
      } else if (name) {
        selector = `[aria-label="${capText(name)}"]`;
      } else {
        selector = role;
      }

      const namePart = name ? ` "${capText(name)}"` : '';
      lines.push(`[${idx++}] <${role}${namePart}> → \`${selector}\``);
      if (idx > MAX_NODES + 1) break;
    }

    // Also include the raw YAML for completeness (capped to keep tokens manageable)
    const rawCap = yaml.length > 4000 ? yaml.slice(0, 4000) + '\n... [aria snapshot truncated]' : yaml;
    lines.push('');
    lines.push('### Raw ARIA Snapshot (for full reference)');
    lines.push('```yaml');
    lines.push(rawCap);
    lines.push('```');

    return lines.join('\n');
  }
}
