import * as fs from 'fs';
import * as path from 'path';
import { McpConfigService } from '../config/McpConfigService.js';

export interface ScenarioSummary {
  feature: string;
  tags: string[];
  scenarioCount: number;
  scenarios: string[];
}

export interface SuiteReport {
  projectRoot: string;
  totalFeatures: number;
  totalScenarios: number;
  tagBreakdown: Record<string, number>;
  features: ScenarioSummary[];
  plainEnglishSummary: string;
}

/**
 * SuiteSummaryService — Phase 21A
 *
 * Reads all .feature files in the project and produces a plain-English
 * description of the test suite — useful for non-technical stakeholders
 * and for understanding test coverage at a glance.
 */
export class SuiteSummaryService {

  public summarize(projectRoot: string): SuiteReport {
    const configService = new McpConfigService();
    const config = configService.read(projectRoot);
    const featuresDir = path.join(projectRoot, config.dirs.features);
    const features: ScenarioSummary[] = [];
    const tagBreakdown: Record<string, number> = {};
    let totalScenarios = 0;

    if (!fs.existsSync(featuresDir)) {
      return {
        projectRoot,
        totalFeatures: 0,
        totalScenarios: 0,
        tagBreakdown: {},
        features: [],
        plainEnglishSummary: `No ${config.dirs.features}/ directory found. Run setup_project first.`,
      };
    }

    const featureFiles = this.findFeatureFiles(featuresDir);

    for (const filePath of featureFiles) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const relPath = path.relative(projectRoot, filePath).replace(/\\/g, '/');
      const parsed = this.parseFeatureFile(content);

      parsed.tags.forEach(tag => {
        tagBreakdown[tag] = (tagBreakdown[tag] ?? 0) + parsed.scenarioCount;
      });

      totalScenarios += parsed.scenarioCount;
      features.push({ feature: relPath, ...parsed });
    }

    const plainEnglishSummary = this.buildPlainEnglish(projectRoot, features, totalScenarios, tagBreakdown);

    return {
      projectRoot,
      totalFeatures: features.length,
      totalScenarios,
      tagBreakdown,
      features,
      plainEnglishSummary,
    };
  }

  private findFeatureFiles(dir: string): string[] {
    const results: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) results.push(...this.findFeatureFiles(full));
      else if (entry.name.endsWith('.feature')) results.push(full);
    }
    return results;
  }

  private parseFeatureFile(content: string): Omit<ScenarioSummary, 'feature'> {
    const lines = content.split('\n');
    const tags: string[] = [];
    const scenarios: string[] = [];
    let pendingTags: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('@')) {
        // Tag line — can have multiple tags: @smoke @regression
        pendingTags.push(...trimmed.split(/\s+/).filter(t => t.startsWith('@')));
      } else if (trimmed.startsWith('Scenario') || trimmed.startsWith('Example')) {
        const title = trimmed.replace(/^(Scenario Outline:|Scenario:|Examples?):\s*/i, '').trim();
        if (title) scenarios.push(title);
        pendingTags.forEach(t => { if (!tags.includes(t)) tags.push(t); });
        pendingTags = [];
      } else {
        pendingTags = []; // reset if a non-tag, non-scenario line appears
      }
    }

    return { tags, scenarios, scenarioCount: scenarios.length };
  }

  private buildPlainEnglish(
    projectRoot: string,
    features: ScenarioSummary[],
    totalScenarios: number,
    tagBreakdown: Record<string, number>
  ): string {
    if (features.length === 0) {
      return `No test scenarios found in ${projectRoot}. Start by generating a test with generate_gherkin_pom_test_suite.`;
    }

    const lines: string[] = [
      `📋 TEST SUITE SUMMARY for ${path.basename(projectRoot)}`,
      `   ${features.length} feature file(s) · ${totalScenarios} scenario(s)`,
      '',
    ];

    if (Object.keys(tagBreakdown).length > 0) {
      lines.push('🏷️  Tag Coverage:');
      for (const [tag, count] of Object.entries(tagBreakdown)) {
        lines.push(`   ${tag}: ${count} scenario(s)`);
      }
      lines.push('');
    }

    lines.push('📂 Features:');
    for (const f of features) {
      lines.push(`\n   📄 ${f.feature}`);
      lines.push(`      Tags: ${f.tags.join(', ') || 'none'} · ${f.scenarioCount} scenario(s)`);
      for (const s of f.scenarios) {
        lines.push(`        • ${s}`);
      }
    }

    const smokeCount = tagBreakdown['@smoke'] ?? 0;
    const regressionCount = tagBreakdown['@regression'] ?? 0;
    const e2eCount = tagBreakdown['@e2e'] ?? 0;
    lines.push('');
    lines.push('💡 Run subsets:');
    if (smokeCount > 0) lines.push(`   npx playwright test --grep @smoke      (${smokeCount} tests)`);
    if (regressionCount > 0) lines.push(`   npx playwright test --grep @regression (${regressionCount} tests)`);
    if (e2eCount > 0) lines.push(`   npx playwright test --grep @e2e         (${e2eCount} tests)`);

    return lines.join('\n');
  }
}
