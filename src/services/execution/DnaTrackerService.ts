/**
 * DnaTrackerService
 *
 * Persists element "DNA" metadata (tag, id, text, DOM hierarchy, visual hash)
 * to `.TestForge/locator-dna.json`. On a healing request, it tries to find a
 * near-match using HeuristicMatcher (LCS) BEFORE falling back to LLM healing.
 *
 * Schema of locator-dna.json:
 * {
 *   version: "1.0.0",
 *   entries: {
 *     "<selector>": LocatorDnaEntry
 *   }
 * }
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { HeuristicMatcher } from '../../utils/HeuristicMatcher.js';
import type { MatchCandidate } from '../../utils/HeuristicMatcher.js';

export interface LocatorDnaEntry {
  /** Original CSS/XPath/role selector string */
  selector: string;
  /** Tag name e.g. 'button', 'input' */
  tag: string;
  /** element.id attribute */
  id: string;
  /** Visible text content (trimmed, max 120 chars) */
  text: string;
  /** Breadcrumb of ancestor tags, e.g. "div>form>fieldset>label" */
  hierarchy: string;
  /** SHA-1 of tag+id+hierarchy for quick equality checks */
  visualHash: string;
  /** ISO timestamp of last successful use */
  lastSeen: string;
  /** How many times healed successfully */
  healCount: number;
}

export interface DnaStore {
  version: string;
  entries: Record<string, LocatorDnaEntry>;
}

export interface DnaHealResult {
  found: boolean;
  candidates: MatchCandidate[];
  bestCandidate?: LocatorDnaEntry;
  confidence: number;
}

export class DnaTrackerService {

  private static readonly FILE_NAME = 'locator-dna.json';
  private static readonly VERSION = '1.0.0';

  // ─── Storage helpers ────────────────────────────────────────────────────────

  private getStorePath(projectRoot: string): string {
    const dir = path.join(projectRoot, '.TestForge');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return path.join(dir, DnaTrackerService.FILE_NAME);
  }

  private read(projectRoot: string): DnaStore {
    const p = this.getStorePath(projectRoot);
    if (!fs.existsSync(p)) return { version: DnaTrackerService.VERSION, entries: {} };
    try {
      const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (!raw || typeof raw !== 'object') return { version: DnaTrackerService.VERSION, entries: {} };
      if (!raw.entries || typeof raw.entries !== 'object') raw.entries = {};
      return raw as DnaStore;
    } catch {
      return { version: DnaTrackerService.VERSION, entries: {} };
    }
  }

  /** Atomic write via tmp-file swap to prevent corruption on crash. */
  private write(projectRoot: string, store: DnaStore): void {
    const dest = this.getStorePath(projectRoot);
    const tmp = dest + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf8');
    fs.renameSync(tmp, dest);
  }

  // ─── DNA computation ────────────────────────────────────────────────────────

  private computeVisualHash(tag: string, id: string, hierarchy: string): string {
    return crypto
      .createHash('sha1')
      .update(`${tag}|${id}|${hierarchy}`)
      .digest('hex')
      .slice(0, 12);
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Records element metadata after a successful interaction.
   * Safe to call even if the projectRoot is undefined — will be a no-op.
   */
  public track(
    projectRoot: string,
    selector: string,
    tag: string,
    id: string,
    text: string,
    hierarchy: string
  ): void {
    if (!projectRoot) return;
    const store = this.read(projectRoot);
    const existing = store.entries[selector];
    const visualHash = this.computeVisualHash(tag, id, hierarchy);

    store.entries[selector] = {
      selector,
      tag,
      id,
      text: text.slice(0, 120),
      hierarchy,
      visualHash,
      lastSeen: new Date().toISOString(),
      healCount: existing?.healCount ?? 0
    };

    this.write(projectRoot, store);
  }

  /**
   * Attempts to find a near-match for a failed selector using LCS heuristics.
   * Returns the best candidate and confidence score.
   * Caller should use this BEFORE LLM fallback.
   */
  public findNearMatch(projectRoot: string, failedSelector: string): DnaHealResult {
    if (!projectRoot) return { found: false, candidates: [], confidence: 0 };

    const store = this.read(projectRoot);
    const keys = Object.keys(store.entries);
    if (keys.length === 0) return { found: false, candidates: [], confidence: 0 };

    const candidates = HeuristicMatcher.findBestMatches(failedSelector, keys, 0.3, 5);

    if (candidates.length === 0) return { found: false, candidates: [], confidence: 0 };

    const best = candidates[0];
    if (!best) return { found: false, candidates: [], confidence: 0 };
    const bestEntry = store.entries[best.key];

    return {
      found: best.score >= 0.5,
      candidates,
      ...(bestEntry !== undefined ? { bestCandidate: bestEntry } : {}),
      confidence: best.score
    };
  }

  /**
   * Increments the heal count for an entry on successful heal.
   */
  public recordSuccessfulHeal(projectRoot: string, selector: string): void {
    if (!projectRoot) return;
    const store = this.read(projectRoot);
    if (store.entries[selector]) {
      store.entries[selector].healCount += 1;
      store.entries[selector].lastSeen = new Date().toISOString();
      this.write(projectRoot, store);
    }
  }

  /**
   * Returns a summary of the tracked DNA for diagnostic purposes.
   */
  public getSummary(projectRoot: string): { total: number; topHealed: LocatorDnaEntry[] } {
    const store = this.read(projectRoot);
    const entries = Object.values(store.entries);
    const topHealed = entries
      .filter(e => e.healCount > 0)
      .sort((a, b) => b.healCount - a.healCount)
      .slice(0, 10);
    return { total: entries.length, topHealed };
  }
}
