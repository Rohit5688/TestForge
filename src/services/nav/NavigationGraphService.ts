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
import { StaticRouteScanner } from '../app-flow/StaticRouteScanner.js';
import { LiveCrawlerSession, type NavGraphMutator } from '../app-flow/LiveCrawlerSession.js';
import { MermaidExporter } from '../../utils/MermaidExporter.js';

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

// ─── Service ──────────────────────────────────────────────────────────────────

export class NavigationGraphService implements NavGraphMutator {
  private graph: NavGraph;
  private readonly mapPath: string;

  constructor(private readonly projectRoot: string) {
    const dir = path.join(projectRoot, MAP_DIR);
    this.mapPath = path.join(dir, MAP_FILENAME);
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

    const urls = StaticRouteScanner.scan(this.projectRoot);

    if (urls.size === 0) {
      // Nothing found → emit a seed graph to guide the LLM
      this.graph = StaticRouteScanner.buildSeedGraph();
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
    maxPages: number = 25,
  ): Promise<NavGraph> {
    this.graph.entryUrl = startUrl;
    
    await LiveCrawlerSession.crawl(startUrl, this, storageState, maxPages);

    this.graph.source = 'live';
    this.graph.lastUpdated = new Date().toISOString();
    await this.save();
    return this.graph;
  }

  /** Export a Mermaid flowchart of the navigation graph, also write to .TestForge/nav-graph.md */
  exportMermaidDiagram(): string {
    return MermaidExporter.exportMermaidDiagram(this.graph, this.mapPath);
  }

  /** Returns compact "Known Navigation Paths" text for injection into analyze_codebase output */
  getKnownPathsText(): string {
    return MermaidExporter.getKnownPathsText(this.graph);
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

  // ── Private Helpers / Mutators ─────────────────────────────────────────────

  public ensureNode(url: string): void {
    const normalized = StaticRouteScanner.normalizeUrl(url);
    if (!this.graph.nodes[normalized]) {
      this.graph.nodes[normalized] = StaticRouteScanner.makeEmptyNode(normalized);
    }
  }

  public incrementVisit(url: string): void {
    const normalized = StaticRouteScanner.normalizeUrl(url);
    if (this.graph.nodes[normalized]) {
      this.graph.nodes[normalized]!.visitCount++;
      this.graph.nodes[normalized]!.lastVisited = new Date().toISOString();
    }
  }

  public addEdge(fromUrl: string, toUrl: string, selector: string, label: string, confidence: number): void {
    const fromNorm = StaticRouteScanner.normalizeUrl(fromUrl);
    const toNorm = toUrl === '?' ? '?' : StaticRouteScanner.normalizeUrl(toUrl);
    
    this.ensureNode(fromNorm);
    const node = this.graph.nodes[fromNorm]!;

    // Deduplicate: bump confidence if same edge already exists
    const existing = node.outgoing.find((e) => e.targetUrl === toNorm && e.triggerSelector === selector);
    if (existing) {
      existing.confidence = Math.min(1, existing.confidence + 0.1);
      return;
    }

    node.outgoing.push({ triggerSelector: selector, targetUrl: toNorm, confidence, label });
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
}
