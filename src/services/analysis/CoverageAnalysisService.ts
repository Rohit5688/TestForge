import * as fs from 'fs';
import * as path from 'path';

export interface CoverageReport {
  scenariosCount: number;
  screensCovered: string[];
  coverageGaps: string[];
  missingScenarios: string[];
  heatmap: Record<string, number>;
}

/**
 * Parses feature files to determine coverage metrics and identify gaps.
 */
export class CoverageAnalysisService {
  /**
   * Analyzes test coverage for a given web project and provides suggestions.
   */
  public analyzeCoverage(projectRoot: string, featureFilesPaths: string[]): CoverageReport {
    let scenariosCount = 0;
    const heatmap: Record<string, number> = {};
    const screenNames = new Set<string>();
    let hasExceptions = false;

    for (const file of featureFilesPaths) {
      const fullPath = path.resolve(projectRoot, file);
      if (!fs.existsSync(fullPath)) continue;
      const content = fs.readFileSync(fullPath, 'utf8');

      // Count scenarios
      const scenarioMatches = content.match(/^\s*Scenario(?: Outline)?:\s*(.*)$/gm);
      if (scenarioMatches) {
        scenariosCount += scenarioMatches.length;
      }

      // Analyze screen usage (assuming Given/When/Then "I am on the 'X' page/screen" pattern)
      const lines = content.split('\n');
      for (const line of lines) {
        const match = line.match(/(?:(?:on|at|see) the ['"]([^'"]+)['"] (?:screen|page|route))/i);
        if (match && match[1]) {
          const screen = match[1].toLowerCase();
          screenNames.add(screen);
          heatmap[screen] = (heatmap[screen] || 0) + 1;
        }

        if (line.toLowerCase().includes('error') || line.toLowerCase().includes('invalid') || line.toLowerCase().includes('fail')) {
          hasExceptions = true;
        }
      }
    }

    const screensCovered = Array.from(screenNames);
    
    // Suggest simple gaps based on standard web apps
    const standardScreens = ['login', 'home', 'dashboard', 'settings', 'profile'];
    const coverageGaps = standardScreens.filter(s => !screensCovered.includes(s));
    
    const missingScenarios: string[] = [];
    if (!screensCovered.includes('login')) {
      missingScenarios.push('User cannot login with invalid credentials (Negative Test)');
      missingScenarios.push('User can successfully logout');
    }
    if (!screensCovered.includes('settings')) {
      missingScenarios.push('User can navigate to settings from dashboard');
    }
    if (!hasExceptions && scenariosCount > 0) {
      missingScenarios.push('Missing negative tests / error handling validation (Negative Test)');
    }
    
    // Accessibility test ideas
    if (scenariosCount > 0) {
      missingScenarios.push('Verify page has no critical Axe accessibility violations (A11y Test)');
    }

    return {
      scenariosCount,
      screensCovered,
      coverageGaps,
      missingScenarios,
      heatmap
    };
  }

  /**
   * Converts the coverage report into an LLM-friendly context prompt.
   */
  public getCoveragePrompt(report: CoverageReport): string {
    return [
      `### Coverage Analysis Context`,
      `- Current Scenarios: ${report.scenariosCount}`,
      `- Routes/Pages Covered: ${report.screensCovered.join(', ')}`,
      `- Missing Standard Flows: ${report.coverageGaps.join(', ')}`,
      `- Suggested Missing Scenarios (Including Negative & A11y):`,
      ...report.missingScenarios.map(s => `  * ${s}`),
      ``,
      `When generating new tests, consider these missing scenarios to improve coverage.`
    ].join('\n');
  }
}
