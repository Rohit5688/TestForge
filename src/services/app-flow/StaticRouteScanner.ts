/**
 * StaticRouteScanner — Phase 2 God-Node extraction
 *
 * Scans feature files and step definitions for hard-coded navigation URLs,
 * then populates a NavGraph with discovered pages.
 *
 * Extracted from NavigationGraphService to keep it single-responsibility.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { NavGraph, NavNode } from '../nav/NavigationGraphService.js';

export class StaticRouteScanner {
  /**
   * Walks standard test directories to find all URL references.
   * Returns the set of normalized URL strings discovered.
   */
  public static scan(projectRoot: string): Set<string> {
    const urls = new Set<string>();

    // Regex patterns to extract URLs from feature/step files
    const gotoRe =
      /(?:page\.goto|navigate to|I am on|visit url)\s*[('"`]+(https?:\/\/[^\s'"`]+|\/[^\s'"`]*)[)'"`]+/gi;
    const featureNavRe =
      /(?:Given|When|And)\s+I (?:navigate to|am on|visit|open)\s+"([^"]+)"/gi;

    const scanDirs = ['features', 'step-definitions', 'steps', 'pages', 'e2e', 'tests'];
    for (const dir of scanDirs) {
      const absDir = path.join(projectRoot, dir);
      if (!fs.existsSync(absDir)) continue;
      const files = StaticRouteScanner.walkFiles(absDir, ['.feature', '.ts', '.js']);
      for (const f of files) {
        const content = fs.readFileSync(f, 'utf8');

        gotoRe.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = gotoRe.exec(content)) !== null) {
          urls.add(StaticRouteScanner.normalizeUrl(m[1] ?? ''));
        }

        featureNavRe.lastIndex = 0;
        while ((m = featureNavRe.exec(content)) !== null) {
          urls.add(StaticRouteScanner.normalizeUrl(m[1] ?? ''));
        }
      }
    }

    return urls;
  }

  /** Build a seed graph for projects with no discovered routes. */
  public static buildSeedGraph(): NavGraph {
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
        pageName: StaticRouteScanner.derivePageName(p),
        outgoing: [],
        visitCount: 0,
        lastVisited: new Date().toISOString(),
      };
    }
    seed.nodes['/']!.outgoing.push({
      triggerSelector: 'role=link[name="Login"]',
      targetUrl: '/login',
      confidence: 0.3,
      label: 'Login',
    });
    seed.nodes['/login']!.outgoing.push({
      triggerSelector: 'role=button[name="Submit"]',
      targetUrl: '/dashboard',
      confidence: 0.3,
      label: 'Submit',
    });
    return seed;
  }

  public static normalizeUrl(raw: string): string {
    if (!raw) return '/';
    try {
      const u = new URL(raw);
      return (u.origin + u.pathname).replace(/\/$/, '') || '/';
    } catch {
      return raw.replace(/\/$/, '') || '/';
    }
  }

  public static derivePageName(url: string): string {
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

  public static makeEmptyNode(url: string): NavNode {
    return {
      url,
      pageName: StaticRouteScanner.derivePageName(url),
      outgoing: [],
      visitCount: 0,
      lastVisited: new Date().toISOString(),
    };
  }

  private static walkFiles(dir: string, exts: string[]): string[] {
    const results: string[] = [];
    if (!fs.existsSync(dir)) return results;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...StaticRouteScanner.walkFiles(full, exts));
      } else if (exts.some((e) => entry.name.endsWith(e))) {
        results.push(full);
      }
    }
    return results;
  }
}
