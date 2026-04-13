import * as fs from 'fs';
import * as path from 'path';
import { CodebaseAnalyzerService } from './CodebaseAnalyzerService.js';
import { McpConfigService } from './McpConfigService.js';

/**
 * Playwright API surface map — methods that a well-formed TestForge project should have
 * available either in its own utils OR provided by a custom wrapper package.
 *
 * Each entry defines:
 *  - method: the canonical method name
 *  - aliases: alternative names teams commonly use
 *  - category: logical grouping
 *  - suggestedUtilClass: which helper class it belongs to
 *  - description: what it does
 */
const PLAYWRIGHT_API_SURFACE = [
  // ─── Navigation ─────────────────────────────────────
  { method: 'navigate',       aliases: ['goto', 'navigateTo', 'open', 'gotourl', 'clickandnavigate'],            category: 'Navigation',  suggestedUtilClass: 'NavigationHelper', description: 'Navigate to a URL with optional wait' },
  { method: 'goBack',         aliases: ['back', 'navigateBack'],                   category: 'Navigation',  suggestedUtilClass: 'NavigationHelper', description: 'Click browser back button' },
  { method: 'reload',         aliases: ['refresh', 'refreshPage'],                 category: 'Navigation',  suggestedUtilClass: 'NavigationHelper', description: 'Reload the current page' },
  { method: 'waitForUrl',     aliases: ['waitForNavigation', 'waitForRoute'],      category: 'Navigation',  suggestedUtilClass: 'NavigationHelper', description: 'Wait until URL matches pattern' },

  // ─── Interaction ─────────────────────────────────────
  { method: 'click',          aliases: ['tap', 'press'],                           category: 'Interaction', suggestedUtilClass: 'ActionHelper', description: 'Click an element with retry' },
  { method: 'fill',           aliases: ['type', 'input', 'setValue', 'enterText'], category: 'Interaction', suggestedUtilClass: 'ActionHelper', description: 'Fill an input field' },
  { method: 'clear',          aliases: ['clearInput', 'clearField'],               category: 'Interaction', suggestedUtilClass: 'ActionHelper', description: 'Clear an input field' },
  { method: 'selectOption',   aliases: ['select', 'choose', 'dropdown', 'selectbyvalue', 'selectbyvalues', 'selectbytext', 'selectbyindex'],          category: 'Interaction', suggestedUtilClass: 'ActionHelper', description: 'Select from a dropdown' },
  { method: 'check',          aliases: ['checkBox', 'tick'],                       category: 'Interaction', suggestedUtilClass: 'ActionHelper', description: 'Check a checkbox or radio' },
  { method: 'uncheck',        aliases: ['uncheckBox', 'untick'],                   category: 'Interaction', suggestedUtilClass: 'ActionHelper', description: 'Uncheck a checkbox' },
  { method: 'upload',         aliases: ['uploadFile', 'setInputFiles', 'uploadfiles'],            category: 'Interaction', suggestedUtilClass: 'ActionHelper', description: 'Upload a file via input[type=file]' },
  { method: 'hover',          aliases: ['mouseOver', 'hoverOver'],                 category: 'Interaction', suggestedUtilClass: 'ActionHelper', description: 'Hover over an element' },
  { method: 'dragAndDrop',    aliases: ['drag', 'drop'],                           category: 'Interaction', suggestedUtilClass: 'ActionHelper', description: 'Drag element to a target' },

  // ─── Assertions ───────────────────────────────────────
  { method: 'expectVisible',  aliases: ['assertVisible', 'isVisible', 'toBeVisible', 'expectelementtobevisible', 'waitforelementtobevisible'], category: 'Assertions', suggestedUtilClass: 'AssertHelper', description: 'Assert element is visible' },
  { method: 'expectText',     aliases: ['assertText', 'toHaveText', 'containsText', 'expectelementtohavetext', 'expectelementtocontaintext'],  category: 'Assertions', suggestedUtilClass: 'AssertHelper', description: 'Assert element text content' },
  { method: 'expectUrl',      aliases: ['assertUrl', 'toHaveURL', 'urlContains', 'expectpagetohaveurl', 'expectpagetocontainurl'],     category: 'Assertions', suggestedUtilClass: 'AssertHelper', description: 'Assert current page URL' },
  { method: 'expectTitle',    aliases: ['assertTitle', 'toHaveTitle', 'expectpagetohavetitle'],               category: 'Assertions', suggestedUtilClass: 'AssertHelper', description: 'Assert page title' },
  { method: 'expectCount',    aliases: ['assertCount', 'toHaveCount', 'expectelementtohavecount'],               category: 'Assertions', suggestedUtilClass: 'AssertHelper', description: 'Assert element count' },
  { method: 'expectEnabled',  aliases: ['assertEnabled', 'toBeEnabled', 'expectelementtobeenabled'],             category: 'Assertions', suggestedUtilClass: 'AssertHelper', description: 'Assert element is enabled' },
  { method: 'expectHidden',   aliases: ['assertHidden', 'toBeHidden', 'notVisible', 'expectelementtobehidden', 'waitforelementtobehidden'], category: 'Assertions', suggestedUtilClass: 'AssertHelper', description: 'Assert element is hidden' },

  // ─── Waits ────────────────────────────────────────────
  { method: 'waitForSelector', aliases: ['waitFor', 'waitForElement', 'waitVisible', 'waitforelementtobeattached', 'waitforelementtobehidden', 'waitforelementtobevisible'], category: 'Waits', suggestedUtilClass: 'WaitHelper', description: 'Wait for an element to appear' },
  { method: 'waitForIdle',     aliases: ['waitForNetworkIdle', 'waitForLoad', 'waitforpageloadstate'],        category: 'Waits', suggestedUtilClass: 'WaitHelper', description: 'Wait for network idle state' },
  { method: 'sleep',           aliases: ['wait', 'delay'],                            category: 'Waits', suggestedUtilClass: 'WaitHelper', description: 'Hard sleep (use sparingly)' },

  // ─── Storage / Cookies ────────────────────────────────
  { method: 'saveStorageState', aliases: ['saveSession', 'saveAuth'],     category: 'Auth', suggestedUtilClass: 'AuthHelper', description: 'Save browser storage state for session reuse' },
  { method: 'loadStorageState', aliases: ['loadSession', 'restoreAuth', 'authenticate'],  category: 'Auth', suggestedUtilClass: 'AuthHelper', description: 'Load a previously saved auth state' },

  // ─── Screenshots ─────────────────────────────────────
  { method: 'screenshot',      aliases: ['takeScreenshot', 'capture', 'capturescreenshot', 'capturescreenshotwithmetadata'],   category: 'Debugging', suggestedUtilClass: 'DebugHelper', description: 'Take a screenshot' },
  { method: 'saveTrace',       aliases: ['startTrace', 'stopTrace'],     category: 'Debugging', suggestedUtilClass: 'DebugHelper', description: 'Record Playwright trace' },

  // ─── Accessibility ───────────────────────────────────
  { method: 'checkAccessibility', aliases: ['a11yCheck', 'axeCheck', 'runAxe', 'generatea11yreport', 'quickaccessibilitycheck', 'scanfora11yissues'], category: 'Accessibility', suggestedUtilClass: 'A11yHelper', description: 'Run @axe-core/playwright accessibility scan' },
] as const;

export interface UtilAuditEntry {
  method: string;
  category: string;
  suggestedUtilClass: string;
  description: string;
  source: 'project-utils' | 'custom-wrapper' | 'missing';
}

export interface UtilAuditResult {
  coveragePercent: number;
  present: string[];
  missing: UtilAuditEntry[];
  coveredByWrapper: string[];
  actionableSuggestions: string[];
  customWrapperNote?: string;
}

/**
 * UtilAuditService — Scans a TestForge project's util layer and compares it against
 * the PLAYWRIGHT_API_SURFACE to identify missing helper methods.
 *
 * Custom-wrapper-aware: if a customWrapperPackage is provided (or detected by the
 * CodebaseAnalyzerService), methods already provided by the wrapper are counted as
 * 'present' and not listed as 'missing' \u2014 avoiding false positives.
 */
export class UtilAuditService {
  private analyzerService = new CodebaseAnalyzerService();
  private configService = new McpConfigService();

  public async audit(projectRoot: string, customWrapperPackage?: string): Promise<UtilAuditResult> {
    const config = this.configService.read(projectRoot);

    // Use basePageClass from config if no explicit wrapper provided
    const wrapper = customWrapperPackage || this.configService.getCustomWrapper(config);

    // Run codebase analysis (passing wrapper package for introspection)
    const analysis = await this.analyzerService.analyze(projectRoot, wrapper);

    // Scan conventional utils directories — 'utils', 'helpers', 'support', 'lib'
    // McpConfig.dirs does not define a utils path, so we scan by convention.
    const projectUtilMethods = new Set<string>();
    const candidateUtilDirs = ['utils', 'helpers', 'support', 'lib']
      .map(d => path.join(projectRoot, d))
      .filter(d => fs.existsSync(d));

    for (const utilsDir of candidateUtilDirs) {
      this.scanUtilsDir(utilsDir, projectUtilMethods);
    }

    // Also collect from any detected utils in the analysis
    for (const po of analysis.existingPageObjects) {
      for (const method of po.publicMethods) {
        const name = method.replace('()', '').toLowerCase();
        projectUtilMethods.add(name);
      }
    }

    // Collect methods from the custom wrapper (if detected)
    const wrapperMethods = new Set<string>();
    if (analysis.customWrapper?.detectedMethods) {
      for (const m of analysis.customWrapper.detectedMethods) {
        const name = m.replace('()', '').toLowerCase();
        wrapperMethods.add(name);
      }
    }

    // Evaluate each API surface entry
    const present: string[] = [];
    const coveredByWrapper: string[] = [];
    const missing: UtilAuditEntry[] = [];
    const actionableSuggestions: string[] = [];

    for (const entry of PLAYWRIGHT_API_SURFACE) {
      const allNames = [entry.method, ...entry.aliases].map(n => n.toLowerCase());

      const inProject = allNames.some(n => projectUtilMethods.has(n));
      const inWrapper = allNames.some(n => wrapperMethods.has(n));

      if (inProject) {
        present.push(entry.method);
      } else if (inWrapper) {
        coveredByWrapper.push(entry.method);
        present.push(entry.method); // counts toward coverage %
      } else {
        missing.push({
          method: entry.method,
          category: entry.category,
          suggestedUtilClass: entry.suggestedUtilClass,
          description: entry.description,
          source: 'missing'
        });
        actionableSuggestions.push(
          `[${entry.category}] Add ${entry.suggestedUtilClass}.${entry.method}() — ${entry.description}`
        );
      }
    }

    const total = present.length + missing.length;
    const coveragePercent = Math.round((present.length / (total || 1)) * 100);

    const customWrapperNote = analysis.customWrapper
      ? analysis.customWrapper.isInstalled
        ? `✅ Custom wrapper "${analysis.customWrapper.package}" detected — ${coveredByWrapper.length} method(s) provided by wrapper, counted as present.`
        : `⚠️ Custom wrapper "${analysis.customWrapper.package}" specified but not resolvable in node_modules. Install it to get accurate coverage.`
      : undefined;

    return {
      coveragePercent,
      present,
      missing,
      coveredByWrapper,
      actionableSuggestions,
      ...(customWrapperNote ? { customWrapperNote } : {})
    };
  }

  /**
   * Recursively scans a utils directory, collects all exported function and class method names.
   * Uses simple regex scanning (no full ts-morph parse) for speed.
   */
  private scanUtilsDir(dir: string, methodNames: Set<string>): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        this.scanUtilsDir(fullPath, methodNames);
      } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
        this.extractMethodsFromFile(fullPath, methodNames);
      }
    }
  }

  private extractMethodsFromFile(filePath: string, methodNames: Set<string>): void {
    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch {
      return;
    }

    // async/sync public methods in classes: async navigate(...) { ... }
    const methodMatches = content.matchAll(/(?:public\s+)?(?:async\s+)?(\w+)\s*\([^)]*\)\s*(?::\s*\S+\s*)?\{/g);
    for (const m of methodMatches) {
      if (m[1] && !['if', 'for', 'while', 'switch', 'catch', 'constructor'].includes(m[1])) {
        methodNames.add(m[1].toLowerCase());
      }
    }

    // Exported arrow functions: export const navigate = async (...) => {
    const arrowMatches = content.matchAll(/export\s+const\s+(\w+)\s*=\s*(?:async\s*)?\(/g);
    for (const m of arrowMatches) {
      if (m[1]) methodNames.add(m[1].toLowerCase());
    }

    // Exported named functions: export function navigate(...) {
    const fnMatches = content.matchAll(/export\s+(?:async\s+)?function\s+(\w+)\s*\(/g);
    for (const m of fnMatches) {
      if (m[1]) methodNames.add(m[1].toLowerCase());
    }
  }
}
