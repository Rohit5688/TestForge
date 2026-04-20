import * as fs from 'fs';
import * as path from 'path';
import { EnvManagerService } from '../config/EnvManagerService.js';
import { ProjectScaffolder } from '../../utils/ProjectScaffolder.js';
import { ConfigTemplateManager } from '../../utils/ConfigTemplateManager.js';
import { DependencyManager } from '../../utils/DependencyManager.js';
import { DocScaffolder } from '../../utils/DocScaffolder.js';
import type { SetupResult } from './ProjectSetupTypes.js';

/**
 * ProjectSetupService — Phase 20D + Phase 8 Hardening (Refactored Phase 6)
 *
 * Bootstraps a blank directory into a fully configured Playwright-BDD project.
 * This class acts as a Facade, delegating specific scaffolding tasks to specialized utilities.
 */
export class ProjectSetupService {
  private readonly envManager: EnvManagerService;
  private readonly scaffolder = new ProjectScaffolder();
  private readonly configManager = new ConfigTemplateManager();
  private readonly dependencyManager = new DependencyManager();
  private readonly docScaffolder = new DocScaffolder();

  constructor(envManager?: EnvManagerService) {
    this.envManager = envManager || new EnvManagerService();
  }

  /**
   * Main entry point for project setup.
   * Handles Phase 1 (Config Template) and Phase 2 (Full Scaffolding).
   */
  public async setup(projectRoot: string): Promise<string> {
    if (!fs.existsSync(projectRoot)) {
      fs.mkdirSync(projectRoot, { recursive: true });
    }

    const configPath = path.join(projectRoot, 'mcp-config.json');

    // Phase 1: Create configuration template if it doesn't exist
    if (!fs.existsSync(configPath)) {
      this.configManager.generateTemplate(projectRoot);
      this.docScaffolder.scaffoldReference(projectRoot);
      this.docScaffolder.scaffoldPromptCheatbook(projectRoot);

      return JSON.stringify({
        phase: 1,
        status: 'CONFIG_TEMPLATE_CREATED',
        configPath,
        message: [
          '📋 STEP 1 of 2: mcp-config.json has been created.',
          '',
          'Open mcp-config.json and fill in CONFIGURE_ME fields.',
          '📖 Documentation created:',
          '  • docs/MCP_CONFIG_REFERENCE.md - Complete field reference',
          '  • docs/PROMPT_CHEATBOOK.md - AI prompt guide',
          '',
          'When ready, call setup_project again with the same projectRoot to continue.'
        ].join('\n')
      }, null, 2);
    }

    // Phase 2: Full Scaffolding
    const unfilledFields = this.configManager.scanConfigureMe(projectRoot);
    const res = await this._scaffold(projectRoot, false);

    return JSON.stringify({
      phase: 2,
      status: 'SETUP_COMPLETE',
      projectRoot: res.projectRoot,
      installed: res.installed,
      dirsCreated: res.dirsCreated,
      filesCreated: res.filesCreated,
      envScaffolded: res.envScaffolded,
      unfilledFields,
      message: res.message
    }, null, 2);
  }

  /**
   * Safe to run at any time — only generates files that are missing.
   * Never overwrites existing files. Used by repair_project and upgrade_project.
   */
  public async repairProject(projectRoot: string): Promise<string> {
    const result = await this._scaffold(projectRoot, true);
    const lines = [
      `✅ Project repair completed at ${projectRoot}`,
      result.dirsCreated.length > 0
        ? `  Directories created: ${result.dirsCreated.join(', ')}`
        : '  Directories: all present',
      result.filesCreated.length > 0
        ? `  Missing files restored: ${result.filesCreated.join(', ')}`
        : '  Files: all present',
    ];
    return lines.join('\n');
  }

  /**
   * Internal scaffolding orchestration.
   */
  private async _scaffold(projectRoot: string, repairMode: boolean): Promise<SetupResult> {
    const filesCreated: string[] = [];

    // 1. Ensure root exists
    if (!fs.existsSync(projectRoot)) {
      fs.mkdirSync(projectRoot, { recursive: true });
    }

    // 2. Standard BDD directory structure
    const dirsCreated = this.scaffolder.scaffoldDirectories(projectRoot);

    // 3. Baseline files
    if (this.scaffolder.scaffoldPackageJson(projectRoot)) filesCreated.push('package.json');
    if (this.scaffolder.scaffoldPlaywrightConfig(projectRoot)) filesCreated.push('playwright.config.ts');
    if (this.scaffolder.scaffoldTsConfig(projectRoot)) filesCreated.push('tsconfig.json');
    if (this.scaffolder.scaffoldBasePage(projectRoot)) filesCreated.push('pages/BasePage.ts');
    if (this.scaffolder.scaffoldPageSetup(projectRoot)) filesCreated.push('test-setup/page-setup.ts');
    if (this.scaffolder.scaffoldGitIgnore(projectRoot)) filesCreated.push('.gitignore');
    if (this.scaffolder.scaffoldSampleFeature(projectRoot)) filesCreated.push('features/sample.feature');

    // 4. Install dependencies if needed
    let installed = false;
    const nodeModulesPath = path.join(projectRoot, 'node_modules');
    if (!fs.existsSync(nodeModulesPath) && !repairMode) {
      installed = await this.dependencyManager.installDependencies(projectRoot);
    } else {
      installed = true;
    }

    // 5. Scaffold .env files
    const envEnvs = ['local', 'staging', 'prod'];
    const envResults = this.envManager.scaffoldMulti(projectRoot, envEnvs);
    const envScaffolded = envResults.some(r => r.written.length > 0);

    const message = this.generateSummaryMessage(projectRoot, dirsCreated, filesCreated, installed, envScaffolded);

    return { projectRoot, installed, dirsCreated, filesCreated, envScaffolded, message };
  }

  /**
   * Delegates config schema syncing.
   */
  public syncConfigSchema(projectRoot: string): string[] {
    return this.configManager.syncSchema(projectRoot);
  }

  /**
   * Helper to generate the final summary message.
   */
  private generateSummaryMessage(
    projectRoot: string,
    dirsCreated: string[],
    filesCreated: string[],
    installed: boolean,
    envScaffolded: boolean
  ): string {
    return [
      `✅ Project scaffolded at ${projectRoot}`,
      dirsCreated.length > 0 ? `\nDirectories created: ${dirsCreated.join(', ')}` : '',
      filesCreated.length > 0 ? `\nFiles created: ${filesCreated.join(', ')}` : '',
      installed
        ? '\n✅ npm packages installed (Playwright + playwright-bdd + TypeScript + dotenv + faker)'
        : '\n⚠️ Package install skipped (node_modules already present or install failed)',
      envScaffolded ? '\n✅ .env scaffolded' : '\n~ .env already exists',
      '\n\n🚀 NEXT STEPS:',
      '  1. Open .env and replace ***FILL_IN*** values.',
      '  2. Update BASE_URL in .env to your application URL.',
      '  3. Ask me to generate tests, or run: npm test',
    ].filter(Boolean).join('');
  }

  // Delegate-only methods for CLI-level access if needed
  public generateConfigTemplate(projectRoot: string) { return this.configManager.generateTemplate(projectRoot); }
  public scaffoldMcpConfigReference(projectRoot: string) { return this.docScaffolder.scaffoldReference(projectRoot); }
  public scaffoldPromptCheatbook(projectRoot: string) { return this.docScaffolder.scaffoldPromptCheatbook(projectRoot); }
  public scanConfigureMe(projectRoot: string) { return this.configManager.scanConfigureMe(projectRoot); }
}
