import * as fs from "fs/promises";
import * as path from "path";

export interface FlakinessEntry {
  selector: string;
  file: string;
  failureClass: string;
  timestamp: number;
}

const LOG_FILENAME = "flakiness-log.json";

/**
 * FlakinessTracker — persists selector failure counts to .TestForge/flakiness-log.json.
 *
 * Written by: run_playwright_test (via LastResultStore.failedLocators) on every selector failure.
 * Read by: get_flaky_selectors tool.
 *
 * LLM benefit: surfaces selectors that fail repeatedly across sessions so the agent
 * prioritises them for permanent replacement rather than re-healing each run.
 */
export class FlakinessTracker {
  private static logPath(projectRoot: string): string {
    return path.join(projectRoot, ".TestForge", LOG_FILENAME);
  }

  /** Appends failure entries for all failed locators in one write. */
  static async record(
    projectRoot: string,
    failedLocators: string[],
    file: string,
    failureClass: string
  ): Promise<void> {
    if (failedLocators.length === 0) return;

    const logPath = FlakinessTracker.logPath(projectRoot);
    await fs.mkdir(path.dirname(logPath), { recursive: true });

    let existing: FlakinessEntry[] = [];
    try {
      const raw = await fs.readFile(logPath, "utf8");
      existing = JSON.parse(raw);
    } catch { /* first write — start fresh */ }

    const now = Date.now();
    for (const selector of failedLocators) {
      existing.push({ selector, file, failureClass, timestamp: now });
    }

    // Keep last 500 entries max — avoid unbounded growth
    if (existing.length > 500) existing = existing.slice(-500);
    await fs.writeFile(logPath, JSON.stringify(existing, null, 2), "utf8");
  }

  /**
   * Returns selectors ranked by fail count descending.
   * Aggregates across all files — a selector is flaky regardless of which step file uses it.
   */
  static async query(projectRoot: string): Promise<
    Array<{ selector: string; failCount: number; lastClass: string; lastSeen: string }>
  > {
    const logPath = FlakinessTracker.logPath(projectRoot);
    let entries: FlakinessEntry[] = [];
    try {
      const raw = await fs.readFile(logPath, "utf8");
      entries = JSON.parse(raw);
    } catch {
      return [];
    }

    const map = new Map<string, { count: number; lastClass: string; lastTs: number }>();
    for (const e of entries) {
      const cur = map.get(e.selector) ?? { count: 0, lastClass: e.failureClass, lastTs: 0 };
      map.set(e.selector, {
        count: cur.count + 1,
        lastClass: e.failureClass,
        lastTs: Math.max(cur.lastTs, e.timestamp),
      });
    }

    return [...map.entries()]
      .map(([selector, v]) => ({
        selector,
        failCount: v.count,
        lastClass: v.lastClass,
        lastSeen: new Date(v.lastTs).toISOString(),
      }))
      .sort((a, b) => b.failCount - a.failCount);
  }
}
