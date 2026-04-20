/**
 * NavigationGraphService — TASK-64 (TestForge web adaptation of AppForge mobile original)
 *
 * Stores a URL-based navigation graph (nodes = pages, edges = click transitions).
 * Persists to .TestForge/navigation-map.json.
 * Exports a Mermaid diagram consumable by TestGenerationService (TASK-34).
 * Supports two discovery modes:
 *   1. Static  — parse .feature files for `I navigate to` / `page.goto` patterns
 *   2. Live    — Playwright headless crawl via discoverAppFlow()
 */

import * as fs from 'fs';
import * as path from 'path';
import { chromium } from 'playwright';
import type { Browser } from 'playwright';

// ─── Data Shapes ─────────────────────────────────────────────────────────────

export interface NavEdge {
  /** CSS selector or text of the element clicked to reach targetUrl */
  triggerSelector: string;
  targetUrl: string;
  /** Increases each time the same transition is confirmed */
  confidence: number;
  /** Human-readable description inferred from link text or aria-label */
  label: string;
}

export interface NavNode {
  url: string;
  /** Short page name derived from pathname, e.g. "/login" → "Login" */
  pageName: string;
  outgoing: NavEdge[];
  visitCount: number;
  lastVisited: string; // ISO date string
}

export interface NavGraph {
  /** key = normalized URL */
  nodes: Record<string, NavNode>;
  entryUrl: string;
  lastUpdated: string;
  source: 'static' | 'live' | 'seed';
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MAP_FILENAME = 'navigation-map.json';
const MAP_DIR = '.TestForge';
const NAV_GRAPH_MD = 'nav-graph.md';
/** Max pages the live crawler will visit in one discover_app_flow call */
const MAX_CRAWL_PAGES = 25;
/** Only follow same-origin links during live crawl */
const CRAWL_TIMEOUT_MS = 8000;

// ─── Service ──────────────────────────────────────────────────────────────────

export class NavigationGraphService {
  private graph: NavGraph;
  private readonly mapPath: string;
  private readonly mdPath: string;

  constructor(private readonly projectRoot: string) {
    const dir = path.join(projectRoot, MAP_DIR);
    this.mapPath = path.join(dir, MAP_FILENAME);
    this.mdPath = path.join(dir, NAV_GRAPH_MD);
    this.graph = this.load();
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Static analysis: scan feature files for navigation patterns.
   * Looks for: `page.goto(...)`, `I navigate to`, `Given I am on`, Playwright `goto` calls.
   * Non-destructive — enriches any existing graph.
   */
  async buildFromStaticAnalysis(forceRebuild = false): Promise<NavGraph> {
    if (!forceRebuild && this.graph.source !== 'seed' && Object.keys(this.graph.nodes).length > 0) {
      // Already have real data; skip static re-scan unless forced
      return this.graph;
    }

    const urls = new Set<string>();
    const transitions: Array<{ from: string; to: string; label: string }> = [];

    // Regex patterns to extract URLs from feature/step files
    const gotoRe = /(?:page\.goto|navigate to|I am on|visit url)\s*[('"`]+(https?:\/\/[^\s'"`]+|\/[^\s'"`]*)[)'"`]+/gi;
    const featureNavRe = /(?:Given|When|And)\s+I (?:navigate to|am on|visit|open)\s+"([^"]+)"/gi;

    const scanDirs = ['features', 'step-definitions', 'steps', 'pages', 'e2e', 'tests'];
    for (const dir of scanDirs) {
      const absDir = path.join(this.projectRoot, dir);
      if (!fs.existsSync(absDir)) continue;
      const files = this.walkFiles(absDir, ['.feature', '.ts', '.js']);
      for (const f of files) {
        const content = fs.readFileSync(f, 'utf8');
        let m: RegExpExecArray | null;
        gotoRe.lastIndex = 0;
        while ((m = gotoRe.exec(content)) !== null) {
          urls.add(this.normalizeUrl(m[1] ?? ''));
        }
        featureNavRe.lastIndex = 0;
        while ((m = featureNavRe.exec(content)) !== null) {
          urls.add(this.normalizeUrl(m[1] ?? ''));
        }
      }
    }

    if (urls.size === 0) {
      // Nothing found → emit a seed graph to guide the LLM
      this.graph = this.buildSeedGraph();
    } else {
      // Add discovered pages as nodes (no edges known statically)
      for (const url of urls) {
        this.ensureNode(url);
      }
      this.graph.source = 'static';
      this.graph.lastUpdated = new Date().toISOString();
    }

    await this.save();
    return this.graph;
  }

  /**
   * Live crawl: launch headless Chromium, spider the app from startUrl,
   * record all link/button clicks that cause navigation.
   *
   * TASK-45 implementation — called by `discover_app_flow` tool.
   */
  async discoverAppFlow(
    startUrl: string,
    storageState?: string,
    maxPages: number = MAX_CRAWL_PAGES,
  ): Promise<NavGraph> {
    this.graph.entryUrl = startUrl;
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
          await page.goto(currentUrl, { waitUntil: 'domcontentloaded', timeout: CRAWL_TIMEOUT_MS });
          await page.waitForLoadState('networkidle').catch(() => {});
          this.ensureNode(currentUrl);
          this.graph.nodes[currentUrl]!.visitCount++;
          this.graph.nodes[currentUrl]!.lastVisited = new Date().toISOString();

          // Collect all same-origin href links
          const hrefs = await page.evaluate((orig: string) => {
            return Array.from(document.querySelectorAll('a[href]'))
              .map((a) => ({ href: (a as HTMLAnchorElement).href, text: (a as HTMLAnchorElement).innerText.trim().slice(0, 40) }))
              .filter((item) => item.href.startsWith(orig));
          }, origin);

          for (const { href, text } of hrefs) {
            const normalized = this.normalizeUrl(href);
            if (!visited.has(normalized)) {
              queue.push(normalized);
              this.addEdge(currentUrl, normalized, 'a[href]', text || normalized, 0.9);
            }
          }

          // Collect navigable buttons / interactive elements with data-testid
          const buttons = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('button, [role="button"], [role="link"]'))
              .map((el) => ({
                text: (el as HTMLElement).innerText?.trim().slice(0, 40) ?? '',
                testId: el.getAttribute('data-testid') ?? '',
                ariaLabel: el.getAttribute('aria-label') ?? '',
              }))
              .filter((b) => b.text || b.testId || b.ariaLabel);
          });

          // We record interactive elements as potential edges (confidence 0.5 — unconfirmed)
          for (const btn of buttons.slice(0, 20)) {
            const sel = btn.testId ? `[data-testid="${btn.testId}"]`
              : btn.ariaLabel ? `[aria-label="${btn.ariaLabel}"]`
              : `text="${btn.text}"`;
            const label = btn.text || btn.testId || btn.ariaLabel;
            // Target URL unknown until actually clicked — store as placeholder
            this.addEdge(currentUrl, '?', sel, label, 0.4);
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

    this.graph.source = 'live';
    this.graph.lastUpdated = new Date().toISOString();
    await this.save();
    return this.graph;
  }

  /** Export a Mermaid flowchart of the navigation graph, also write to .TestForge/nav-graph.md */
  exportMermaidDiagram(): string {
    const nodes = Object.values(this.graph.nodes);

    if (nodes.length === 0) {
      const fallback = '```mermaid\ngraph TD\n  A["No navigation data yet — run discover_app_flow"]\n```';
      this.writeMd(fallback);
      return fallback;
    }

    const sanitize = (s: string) =>
      s.replace(/[^a-zA-Z0-9]/g, '_').replace(/^_+|_+$/g, '').slice(0, 30) || 'unknown';

    const lines: string[] = ['```mermaid', 'graph TD'];
    const emittedNodes = new Set<string>();

    for (const node of nodes) {
      const fromId = sanitize(node.pageName || node.url);
      if (!emittedNodes.has(fromId)) {
        lines.push(`  ${fromId}["${node.pageName}"]`);
        emittedNodes.add(fromId);
      }

      for (const edge of node.outgoing) {
        if (edge.targetUrl === '?') continue; // Unknown targets omitted
        const toNode = this.graph.nodes[edge.targetUrl];
        const toId = sanitize(toNode?.pageName || edge.targetUrl);
        if (!emittedNodes.has(toId)) {
          lines.push(`  ${toId}["${toNode?.pageName || edge.targetUrl}"]`);
          emittedNodes.add(toId);
        }
        const conf = Math.round(edge.confidence * 100);
        const edgeLabel = edge.label.slice(0, 25).replace(/"/g, "'");
        lines.push(`  ${fromId} -->|"${edgeLabel} (${conf}%)"| ${toId}`);
      }
    }

    lines.push('```');
    const diagram = lines.join('\n');
    this.writeMd(diagram);
    return diagram;
  }

  /** Returns compact "Known Navigation Paths" text for injection into analyze_codebase output */
  getKnownPathsText(): string {
    const nodes = Object.values(this.graph.nodes);
    if (nodes.length === 0) return '';

    const lines: string[] = [
      `--- Known Navigation Paths (${nodes.length} page${nodes.length !== 1 ? 's' : ''}, source: ${this.graph.source}) ---`,
    ];

    for (const node of nodes) {
      const confirmed = node.outgoing.filter((e) => e.targetUrl !== '?' && e.confidence >= 0.6);
      if (confirmed.length > 0) {
        lines.push(`${node.pageName} (${node.url})`);
        for (const e of confirmed.slice(0, 5)) {
          const target = this.graph.nodes[e.targetUrl];
          lines.push(`  → ${target?.pageName || e.targetUrl} via \`${e.triggerSelector}\``);
        }
      } else {
        lines.push(`${node.pageName} (${node.url})`);
      }
    }

    return lines.join('\n');
  }

  getKnownScreens(): string[] {
    return Object.values(this.graph.nodes).map((n) => `${n.pageName} — ${n.url}`);
  }

  getMapSource(): 'static' | 'live' | 'seed' {
    return this.graph.source;
  }

  getGraph(): NavGraph {
    return this.graph;
  }

  // ── Private Helpers ─────────────────────────────────────────────────────────

  private ensureNode(url: string): NavNode {
    const normalized = this.normalizeUrl(url);
    if (!this.graph.nodes[normalized]) {
      this.graph.nodes[normalized] = {
        url: normalized,
        pageName: this.derivePageName(normalized),
        outgoing: [],
        visitCount: 0,
        lastVisited: new Date().toISOString(),
      };
    }
    return this.graph.nodes[normalized]!;
  }

  private addEdge(fromUrl: string, toUrl: string, selector: string, label: string, confidence: number): void {
    const fromNorm = this.normalizeUrl(fromUrl);
    const toNorm = toUrl === '?' ? '?' : this.normalizeUrl(toUrl);
    const node = this.ensureNode(fromNorm);

    // Deduplicate: bump confidence if same edge already exists
    const existing = node.outgoing.find((e) => e.targetUrl === toNorm && e.triggerSelector === selector);
    if (existing) {
      existing.confidence = Math.min(1, existing.confidence + 0.1);
      return;
    }

    node.outgoing.push({ triggerSelector: selector, targetUrl: toNorm, confidence, label });
  }

  private buildSeedGraph(): NavGraph {
    const seed: NavGraph = {
      nodes: {},
      entryUrl: '',
      lastUpdated: new Date().toISOString(),
      source: 'seed',
    };
    const seedPages = ['/', '/login', '/dashboard', '/settings'];
    for (const p of seedPages) {
      seed.nodes[p] = {
        url: p,
        pageName: this.derivePageName(p),
        outgoing: [],
        visitCount: 0,
        lastVisited: new Date().toISOString(),
      };
    }
    seed.nodes['/']!.outgoing.push({ triggerSelector: 'role=link[name="Login"]', targetUrl: '/login', confidence: 0.3, label: 'Login' });
    seed.nodes['/login']!.outgoing.push({ triggerSelector: 'role=button[name="Submit"]', targetUrl: '/dashboard', confidence: 0.3, label: 'Submit' });
    return seed;
  }

  private normalizeUrl(raw: string): string {
    // Relative paths stay as-is; absolute URLs remove trailing slash
    if (!raw) return '/';
    try {
      const u = new URL(raw);
      return (u.origin + u.pathname).replace(/\/$/, '') || '/';
    } catch {
      return raw.replace(/\/$/, '') || '/';
    }
  }

  private derivePageName(url: string): string {
    try {
      const pathname = new URL(url).pathname;
      const parts = pathname.split('/').filter(Boolean);
      if (parts.length === 0) return 'Home';
      return parts[parts.length - 1]!
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
    } catch {
      const parts = url.split('/').filter(Boolean);
      if (parts.length === 0) return 'Home';
      return parts[parts.length - 1]!
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
    }
  }

  private walkFiles(dir: string, exts: string[]): string[] {
    const results: string[] = [];
    if (!fs.existsSync(dir)) return results;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...this.walkFiles(full, exts));
      } else if (exts.some((e) => entry.name.endsWith(e))) {
        results.push(full);
      }
    }
    return results;
  }

  private load(): NavGraph {
    if (fs.existsSync(this.mapPath)) {
      try {
        const raw = fs.readFileSync(this.mapPath, 'utf8');
        const parsed: NavGraph = JSON.parse(raw);
        // Ensure nodes object is present
        if (!parsed.nodes) parsed.nodes = {};
        return parsed;
      } catch {
        // Fallback if corrupt
      }
    }
    return { nodes: {}, entryUrl: '', lastUpdated: new Date().toISOString(), source: 'seed' };
  }

  private async save(): Promise<void> {
    try {
      const dir = path.dirname(this.mapPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.mapPath, JSON.stringify(this.graph, null, 2));
    } catch (err) {
      console.error('[NavigationGraph] Failed to save graph:', err);
    }
  }

  private writeMd(content: string): void {
    try {
      const dir = path.dirname(this.mdPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.mdPath, content);
    } catch {
      // Non-fatal
    }
  }
}
