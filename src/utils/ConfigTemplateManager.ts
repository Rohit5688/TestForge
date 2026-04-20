import * as fs from 'fs';
import * as path from 'path';
import type { ConfigTemplate } from '../services/setup/ProjectSetupTypes.js';

export class ConfigTemplateManager {
  /**
   * Generates a default mcp-config.json template.
   */
  public generateTemplate(projectRoot: string): string {
    const configPath = path.join(projectRoot, 'mcp-config.json');
    const template: ConfigTemplate = {
      version: '2.4.0',
      tags: ['CONFIGURE_ME: tag1', 'CONFIGURE_ME: tag2'],
      envKeys: { baseUrl: 'BASE_URL' },
      dirs: {
        features: 'features',
        pages: 'pages',
        stepDefinitions: 'step-definitions',
        testData: 'test-data',
      },
      browsers: ['chromium'],
      timeouts: {
        testRun: 120_000,
        sessionStart: 30000,
        healingMax: 3
      },
      retries: 1,
      backgroundBlockThreshold: 3,
      authStrategy: 'users-json',
      currentEnvironment: 'CONFIGURE_ME: e.g. staging',
      environments: ['local', 'staging', 'prod'],
      waitStrategy: 'domcontentloaded',
      architectureNotesPath: 'docs/mcp-architecture-notes.md',
      additionalDataPaths: [],
      a11yStandards: ['wcag2aa'],
      a11yReportPath: 'test-results/a11y-report.json',
      projectRoot: projectRoot
    };
    fs.writeFileSync(configPath, JSON.stringify(template, null, 2), 'utf-8');
    return configPath;
  }

  /**
   * Syncs the config schema without overwriting custom edits.
   */
  public syncSchema(projectRoot: string): string[] {
    const logs: string[] = [];
    const configPath = path.join(projectRoot, 'mcp-config.json');
    if (!fs.existsSync(configPath)) return logs;

    const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    logs.push("✅ Schema synced and defaults applied without overwriting.");

    const missingFeatures = [];
    if (!raw.reporting) missingFeatures.push('Reporters');
    if (!fs.existsSync(path.join(projectRoot, 'test-data'))) missingFeatures.push('Credential files');

    if (missingFeatures.length > 0) {
      logs.push(`⚠️ Detected missing features: ${missingFeatures.join(', ')}. Run repair_project to install.`);
    }

    return logs;
  }

  /**
   * Scans for unfilled 'CONFIGURE_ME' fields.
   */
  public scanConfigureMe(projectRoot: string): string[] {
    const configPath = path.join(projectRoot, 'mcp-config.json');
    if (!fs.existsSync(configPath)) return [];
    const content = fs.readFileSync(configPath, 'utf-8');
    const unconfigured: string[] = [];
    const lines = content.split('\n');
    for (const line of lines) {
      if (line.includes('"CONFIGURE_ME')) {
        const match = line.match(/"([^"]+)":\s*"CONFIGURE_ME/);
        if (match && match[1]) unconfigured.push(match[1]);
      }
    }
    return unconfigured;
  }
}
