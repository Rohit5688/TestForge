import type { CodebaseAnalysisResult } from '../../interfaces/ICodebaseAnalyzer.js';
import { FewShotLibrary } from './FewShotLibrary.js';

/**
 * ChampionCandidate — the highest-scoring Page Object from the existing codebase.
 * Used as the "Gold Standard" few-shot example in the hybrid prompt block.
 */
export interface ChampionCandidate {
  path: string;
  className: string;
  score: number;
  /** Compact TypeScript snippet showing the Page Object's structure. */
  snippet: string;
}

/**
 * HybridPromptEngine — Phase 2.5 (TF-NEW-05)
 *
 * Orchestrates the 3-layer hybrid block injected into every test generation prompt:
 *   Layer 1 — CoT Scaffold (mandatory reasoning protocol)
 *   Layer 2 — Champion Snippet (real code from the user's codebase, or generic fallback)
 *   Layer 3 — Anti-Patterns (web/Playwright-specific negative examples)
 *
 * Design Goals:
 *   - Compact (~200-300 tokens) to avoid crowding the context window.
 *   - Prefer real project code over generic examples whenever a mature Page Object exists.
 *   - Degrade gracefully: if no champion exists, use generic fallback text.
 *   - Zero breaking changes: injected as an additive block at the end of the existing prompt.
 */
export class HybridPromptEngine {

  /**
   * Scores all Page Objects in the analysis result and returns the most mature one.
   *
   * Quality-Weighted Scoring:
   *   sizeScore     (25%) — Rewards 6-15 method files; penalises bloat (30+).
   *   qualityScore  (50%) — Rewards having real locators; penalises scrutinizer warnings.
   *   locatorScore  (25%) — Rewards 4-12 locators; penalises zero-locator files.
   *
   * Excludes: Anonymous classes, Base/abstract/utility classes.
   */
  public selectChampion(analysis: CodebaseAnalysisResult): ChampionCandidate | null {
    if (!analysis.existingPageObjects?.length) return null;

    const EXCLUDED_NAMES = ['base', 'abstract', 'mixin'];
    const EXCLUDED_PATHS = ['util', 'helper', 'support', 'common', 'shared'];

    let best: ChampionCandidate | null = null;
    let topScore = -Infinity;

    for (const po of analysis.existingPageObjects) {
      if (!po.className || po.className.startsWith('Anonymous')) continue;

      const nameLower = po.className.toLowerCase();
      const pathLower = po.path.toLowerCase();
      if (EXCLUDED_NAMES.some(n => nameLower.includes(n))) continue;
      if (EXCLUDED_PATHS.some(p => pathLower.includes(p))) continue;

      const methodCount = po.publicMethods?.length ?? 0;
      // TestForge interface doesn't expose locators — estimate from method heuristics
      const locatorCount = Math.floor(methodCount * 0.6); // proxy estimate
      const hasAstWarning = (analysis.warnings ?? []).some(w => w.includes(po.path));

      // sizeScore (25%): sweet spot is 6-15 methods
      const sizeScore = methodCount === 0
        ? 0
        : Math.max(0, 1 - Math.abs(methodCount - 10) / 20);

      // qualityScore (50%): rewards real code, penalises stubs
      let qualityScore = 0.6;
      if (methodCount > 0) qualityScore += 0.2;
      if (locatorCount > 0) qualityScore += 0.1;
      if (hasAstWarning) qualityScore -= 0.5;
      qualityScore = Math.min(1.0, Math.max(0, qualityScore));

      // locatorScore (25%): sweet spot is 4-12 locators
      const locatorScore = locatorCount === 0
        ? 0
        : Math.max(0, 1 - Math.abs(locatorCount - 8) / 16);

      const score = sizeScore * 0.25 + qualityScore * 0.50 + locatorScore * 0.25;

      if (score > topScore) {
        topScore = score;
        best = {
          path: po.path,
          className: po.className ?? 'UnknownPage',
          score: Math.round(score * 100) / 100,
          snippet: this.buildSnippet(po.className ?? 'UnknownPage', po.publicMethods),
        };
      }
    }

    return best;
  }

  /**
   * Builds the complete 3-layer hybrid block.
   * Called once per generate_gherkin_pom_test_suite invocation.
   */
  public buildHybridBlock(analysis: CodebaseAnalysisResult): string {
    const cot = FewShotLibrary.getCoTScaffold();
    const antiPattern = FewShotLibrary.getNegativeExample(analysis);
    const champion = this.selectChampion(analysis);

    const championBlock = champion
      ? this.formatChampionBlock(champion)
      : `\n## 🏆 GOLD STANDARD\nNo mature Page Objects found yet. You are creating the first one — follow the architecture rules strictly and produce a complete, exemplary implementation that future tests will reuse.\n`;

    return [cot, championBlock, antiPattern].join('\n');
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  private formatChampionBlock(champion: ChampionCandidate): string {
    return `
## 🏆 GOLD STANDARD — Mimic this project's existing coding style exactly:
File: \`${champion.path}\`

\`\`\`typescript
${champion.snippet}
\`\`\`

Your generated code MUST follow the same:
- Class naming convention
- Locator strategy (getByTestId, getByRole, CSS, etc.)
- Method signature style
- Import structure
`;
  }

  /**
   * Builds a compact, representative TypeScript snippet from a Page Object.
   * Shows up to 3 locators and 3 method stubs as style reference.
   */
  private buildSnippet(className: string, publicMethods: string[]): string {
    const methodLines = (publicMethods ?? []).slice(0, 3)
      .map(m => `  async ${m}(): Promise<void> { /* ... */ }`)
      .join('\n');

    return [
      `class ${className} extends BasePage {`,
      methodLines || '  // (no public methods detected)',
      '}'
    ].join('\n');
  }
}
