import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { createRequire } from 'module';
import { Project, SyntaxKind, Node } from 'ts-morph';
import type { ICodebaseAnalyzer, CodebaseAnalysisResult } from '../../interfaces/ICodebaseAnalyzer.js';
import { McpConfigService, DEFAULT_CONFIG } from '../config/McpConfigService.js';
import { McpErrors } from '../../types/ErrorSystem.js';
import { DependencyService } from '../config/DependencyService.js';
import { ASTScrutinizer } from '../../utils/ASTScrutinizer.js';
import { WrapperIntrospectService } from '../audit/WrapperIntrospectService.js';
import { ExtensionLoader } from '../../utils/ExtensionLoader.js';

export class CodebaseAnalyzerService implements ICodebaseAnalyzer {
  private wrapperCache = new Map<string, NonNullable<CodebaseAnalysisResult['customWrapper']>>();
  
  public async analyze(projectRoot: string, customWrapperPackage?: string): Promise<CodebaseAnalysisResult> {
    const result: CodebaseAnalysisResult = {
      bddSetup: { present: false },
      existingFeatures: [],
      existingStepDefinitions: [],
      existingPageObjects: [],
      namingConventions: {
        features: 'kebab-case.feature',
        pages: 'PascalCase.ts'
      },
      detectedPaths: {
        featuresRoot: 'features',
        stepsRoot: 'step-definitions',
        pagesRoot: 'pages',
        utilsRoot: 'utils'
      },
      recommendation: '',
      warnings: []
    };

    const mcpConfig = new McpConfigService();
    const config = mcpConfig.read(projectRoot);
    
    // Inject config.dirs as starting point for path detection
    result.detectedPaths.featuresRoot = config.dirs.features;
    result.detectedPaths.stepsRoot = config.dirs.stepDefinitions;
    result.detectedPaths.pagesRoot = config.dirs.pages;

    // Introspect custom wrapper if specified (version-based caching)
    const introspector = new WrapperIntrospectService();
    const wrapper = customWrapperPackage || mcpConfig.getCustomWrapper(config);
    if (wrapper) {
      result.customWrapper = await introspector.introspectWrapper(projectRoot, wrapper);
    }

    result.mcpConfig = {
      version: config.version || '0.0.0',
      upgradeNeeded: (config.version || '0.0.0') < DEFAULT_CONFIG.version,
      allowedTags: config.tags
    };

    const depService = new DependencyService();
    const deps = depService.parseDependencies(projectRoot);
    const finalDeps = depService.detectImplicitFrameworks(projectRoot, deps);
    result.dependencies = finalDeps;

    try {
      // 1. Check for Playwright Config (search recursively since it may be in subdirs like src/test/)
      const allTsFiles = await this.readAllFiles(projectRoot, '.ts');
      const configFile = allTsFiles.find(f => f.endsWith('playwright.config.ts'));
      
      if (configFile) {
        const configContent = await fs.readFile(configFile, 'utf8');
        const hasBdd = configContent.includes('playwright-bdd') || configContent.includes('defineBddConfig');
        result.bddSetup.present = hasBdd;
        result.bddSetup.configFile = path.relative(projectRoot, configFile).replace(/\\/g, '/');
      }

      // 2. Discover Features dynamically across the workspace
      const featureFiles = await this.readAllFiles(projectRoot, '.feature');
      result.existingFeatures = featureFiles.map(f => path.relative(projectRoot, f).replace(/\\/g, '/'));
      const firstFeature = featureFiles[0];
      if (firstFeature) {
        result.detectedPaths.featuresRoot = path.dirname(path.relative(projectRoot, firstFeature).replace(/\\/g, '/'));
      }

      // 3 & 4. Discover TypeScript Files (Step Definitions and Page Objects)
      const tsFiles = await this.readAllFiles(projectRoot, '.ts');
      const stepDefs: any[] = [];
      const pageObjs: any[] = [];
      // BUG-04: declare before the block so it's in scope for recommendation update below
      const registries: NonNullable<typeof result.pageRegistries> = [];
      
      if (tsFiles.length > 0) {
        const project = new Project({ compilerOptions: { strict: false }, skipAddingFilesFromTsConfig: true });
        for (const f of tsFiles) {
          if (f.includes('node_modules') || f.includes('playwright.config') || f.includes('mcp-config') || f.endsWith('d.ts')) continue;
          try {
            project.addSourceFileAtPath(f);
          } catch (e) {
            const warning = McpErrors.astParseFailed(f, e as Error).message;
            result.warnings = result.warnings || [];
            result.warnings.push(warning);
            console.warn(`[CodebaseAnalyzerService] ${warning}`);
          }
        }

        for (const sourceFile of project.getSourceFiles()) {
          const filePath = sourceFile.getFilePath();
          const relPath = path.relative(projectRoot, filePath).replace(/\\/g, '/');
          const content = sourceFile.getFullText();

          // Look for step definitions (using Regex for strict BDD steps to match Playwright-BDD structure)
          const steps = ASTScrutinizer.extractSteps(content);
          if (steps.length > 0) {
            stepDefs.push({ file: relPath, steps });
            if (result.detectedPaths.stepsRoot === config.dirs.stepDefinitions) result.detectedPaths.stepsRoot = path.dirname(relPath);
            continue;
          }

          let isPageObject = false;
          let fileMethods: string[] = [];

          // Class-based POMs
          const classes = sourceFile.getClasses();
          for (const cls of classes) {
            const className = cls.getName() || '';
            const isStandardPom = className.toLowerCase().includes('page') || className.toLowerCase().includes('screen');
            const hasClassLocators = ASTScrutinizer.hasClassLocatorsFast(content); 
            if (isStandardPom || hasClassLocators) {
              const publicMethods = cls.getMethods()
                .filter(m => !m.hasModifier(SyntaxKind.PrivateKeyword) && !m.hasModifier(SyntaxKind.ProtectedKeyword))
                .map(m => m.getName() + '()');
              
              fileMethods.push(...publicMethods);
              pageObjs.push({ path: relPath, publicMethods, className: className || 'AnonymousClass' });
              isPageObject = true;
            }
          }

          // Object-literal and Exported arrow function POMs
          const variableDeclarations = sourceFile.getVariableDeclarations();
          for (const varDecl of variableDeclarations) {
            const name = varDecl.getName() || '';
            const isStandardPom = name.toLowerCase().includes('page') || name.toLowerCase().includes('screen');
            
            const publicMethods: string[] = [];
            let hasLocators = false;

            const initializer = varDecl.getInitializer();
            if (initializer && Node.isObjectLiteralExpression(initializer)) {
              const bodyText = initializer.getText();
              hasLocators = ASTScrutinizer.hasClassLocatorsFast(bodyText);

              for (const prop of initializer.getProperties()) {
                if (Node.isMethodDeclaration(prop)) {
                  publicMethods.push(prop.getName() + '()');
                } else if (Node.isPropertyAssignment(prop)) {
                  const propInit = prop.getInitializer();
                  if (propInit && (Node.isArrowFunction(propInit) || Node.isFunctionExpression(propInit))) {
                    publicMethods.push(prop.getName() + '()');
                  }
                }
              }
            } else if (initializer && (Node.isArrowFunction(initializer) || Node.isFunctionExpression(initializer))) {
              // Standalone exported arrow function
              if (varDecl.isExported()) {
                 const bodyText = initializer.getText();
                 hasLocators = ASTScrutinizer.hasClassLocatorsFast(bodyText);
                 if (hasLocators || isStandardPom) {
                   publicMethods.push(name + '()');
                 }
              }
            }

            if (isStandardPom || hasLocators) {
               fileMethods.push(...publicMethods);
               pageObjs.push({ path: relPath, publicMethods, className: name || 'AnonymousObject' });
               isPageObject = true;
            }
          }
          
          if (isPageObject && result.detectedPaths.pagesRoot === config.dirs.pages) {
             result.detectedPaths.pagesRoot = path.dirname(relPath);
          }

          // Check for custom wrapper override
          if (!customWrapperPackage && path.basename(filePath) === 'BasePage.ts' && fileMethods.length > 0) {
            result.customWrapper = {
              package: 'local BasePage',
              detectedMethods: fileMethods
            };
          }
        } // end for (const sourceFile of project.getSourceFiles())

        result.existingStepDefinitions = stepDefs;
        result.existingPageObjects = pageObjs;

        // BUG-04 FIX: Page Registry / AppManager pattern detection.
        // Run as a second pass INSIDE this block where `project` is in scope.
        // Strategy: for each class, count properties that are `new XPage/XScreen/XComponent(...)`.
        // If >= 2 such properties exist, classify the class as a page registry.
        const knownPageClassNames = new Set(
          pageObjs.map((p: any) => p.className as string).filter(Boolean)
        );

        for (const sourceFile of project.getSourceFiles()) {
          const regRelPath = path.relative(projectRoot, sourceFile.getFilePath()).replace(/\\/g, '/');
          for (const cls of sourceFile.getClasses()) {
            const className = cls.getName() || '';
            const pageInsts: { propertyName: string; pageClass: string }[] = [];

            for (const prop of cls.getProperties()) {
              const init = prop.getInitializer();
              if (!init) continue;
              const initText = init.getText();
              const newMatch = initText.match(/^new\s+([A-Z][\w]*)\s*\(/);
              if (newMatch) {
                const instClass = newMatch[1] ?? '';
                const looksLikePage =
                  instClass.toLowerCase().endsWith('page') ||
                  instClass.toLowerCase().endsWith('screen') ||
                  instClass.toLowerCase().endsWith('component') ||
                  knownPageClassNames.has(instClass);
                if (looksLikePage) pageInsts.push({ propertyName: prop.getName(), pageClass: instClass });
              }
            }

            if (pageInsts.length >= 2) {
              const registryVar = className.charAt(0).toLowerCase() + className.slice(1);
              registries.push({ className, path: regRelPath, registryVar, pages: pageInsts });
            }
          }
        }
      } // end if (tsFiles.length > 0)

      if (registries.length > 0) {
        result.pageRegistries = registries;
        const regSummary = registries.map(r =>
          `  ▶ ${r.className} (${r.registryVar}): ` +
          r.pages.map(p => `${r.registryVar}.${p.propertyName}[→${p.pageClass}]`).join(', ')
        ).join('\n');
        result.recommendation +=
          `\n\n❗ PAGE REGISTRY DETECTED — CRITICAL GENERATOR RULE:\n` +
          `Do NOT instantiate page classes directly (e.g. new LoginPage()). ` +
          `Use the existing registry variable instead:\n${regSummary}`;
      }
      result.namingConventions = {
        features: this.detectNamingConvention(featureFiles, '.feature'),
        pages: this.detectNamingConvention(tsFiles.filter(f => f.toLowerCase().includes('page')), '.ts')
      };

      // 5. Explicit Custom Wrapper handling
      if (customWrapperPackage) {
        // IMPORTANT: introspectWrapper (early section) already did a full recursive scan
        // via scanWrapperDir. resolveAndExtractWrapperMethods reads only the package entry
        // point — which is often a barrel file of re-exports and yields zero methods,
        // producing a false isInstalled:false. Reuse the early-path result instead.
        let extractedMethods: string[];
        let isInstalled: boolean;

        if (result.customWrapper && result.customWrapper.package === customWrapperPackage) {
          // Reuse the already-scanned recursive result
          extractedMethods = result.customWrapper.detectedMethods;
          isInstalled = result.customWrapper.isInstalled ?? extractedMethods.length > 0;
        } else {
          // Fallback: full recursive scan (handles edge case where early path didn't run)
          extractedMethods = await introspector.scanWrapper(projectRoot, customWrapperPackage);
          isInstalled = extractedMethods.length > 0;
        }

        result.customWrapper = {
          package: customWrapperPackage,
          detectedMethods: isInstalled ? extractedMethods : [],
          isInstalled
        };
        
        // Item 11: Create Architecture Notes for current/future runs
        if (isInstalled) {
          const archNotesPath = config.architectureNotesPath;
          const fullArchPath = path.resolve(projectRoot, archNotesPath);
          const archContent = `[MCP ARCHITECTURE NOTES - ITEM 11]
Package: ${customWrapperPackage}
Detected Methods:
- ${extractedMethods.join('\n- ')}

RULES FOR AI:
1. Prefer these library functions over native Playwright APIs.
2. Even with this wrapper, ensure every interaction is within a Page Object Method (POM Enforcement).
`;
          try {
            const archDir = path.dirname(fullArchPath);
            if (!await this.directoryExists(archDir)) await fs.mkdir(archDir, { recursive: true });
            await fs.writeFile(fullArchPath, archContent, 'utf-8');
            result.customWrapper.architectureNotesPath = archNotesPath.replace(/\\/g, '/');
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.warn(`Could not write architecture notes: ${msg}`);
          }
        }

        if (!isInstalled) {
          result.customWrapper.resolutionError = `⚠️ WARNING: The custom wrapper package '${customWrapperPackage}' could not be resolved locally. Ensure it is installed in node_modules, otherwise the AI cannot introspect its APIs.`;
        }
      }

      // 6. Discover NPM Scripts
      const pkgPath = path.join(projectRoot, 'package.json');
      if (await this.fileExists(pkgPath)) {
        try {
          const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8'));
          if (pkg.scripts) {
            result.npmScripts = pkg.scripts;
          }
        } catch (e) {
          console.warn('Failed to parse package.json for scripts');
        }
      }

      // 6b. Parse tsconfig.json for Path Aliasing
      const tsconfigPath = path.join(projectRoot, 'tsconfig.json');
      if (await this.fileExists(tsconfigPath)) {
        try {
          const content = await fs.readFile(tsconfigPath, 'utf8');
          // Strip comments before parsing
          const stripped = content.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '');
          const tsconfig = JSON.parse(stripped);
          if (tsconfig.compilerOptions?.paths) {
            result.importAliases = tsconfig.compilerOptions.paths;
          }
        } catch(e) { }
      }

      // 6c. Parse package.json for Execution Scripts
      const packageJsonPath = path.join(projectRoot, 'package.json');
      if (await this.fileExists(packageJsonPath)) {
        try {
           const pkgContent = await fs.readFile(packageJsonPath, 'utf8');
           const pkg = JSON.parse(pkgContent);
           if (pkg.scripts) {
             result.packageScripts = pkg.scripts;
           }
        } catch(e) {}
      }

      // 7. Discover existing Env Files
      let rootFiles: string[] = [];
      try { rootFiles = await fs.readdir(projectRoot); } catch(e) {}
      const envFiles = rootFiles.filter(f => f.startsWith('.env') && !f.endsWith('.example'));
      let hasCustomConfigDir = false;
      try {
         const configStat = await fs.stat(path.join(projectRoot, 'config'));
         if (configStat.isDirectory()) hasCustomConfigDir = true;
      } catch { }

      result.envConfig = {
        present: envFiles.length > 0 || hasCustomConfigDir,
        files: envFiles,
        keys: []
      };

      // 8. Discover Test Data & Fixtures (Broad Recursive Scan)
      const dataDirs = [
        path.join(projectRoot, 'fixtures'),
        path.join(projectRoot, 'test-data'),
        path.join(projectRoot, 'payloads'),
        path.join(projectRoot, 'data'),
        path.join(projectRoot, 'mocks'),
        ...(config.additionalDataPaths || []).map(p => path.isAbsolute(p) ? p : path.join(projectRoot, p))
      ];

      result.existingTestData = { payloads: [], fixtures: [] };
      const uniqueFiles = new Set<string>();

      for (const dir of dataDirs) {
        if (await this.directoryExists(dir)) {
          const files = await this.readAllFiles(dir, ''); // Get all files initially
          for (const f of files) {
            if (uniqueFiles.has(f)) continue;
            const ext = path.extname(f);
            if (!['.json', '.ts', '.js'].includes(ext)) continue;

            const relativePath = path.relative(projectRoot, f).replace(/\\/g, '/');
            const content = await fs.readFile(f, 'utf8');
            const sampledStructure = this.extractSampleStructure(content, ext);
            
            // Heuristic: if it's in a 'fixtures' dir, count as fixture, else payload
            if (f.toLowerCase().includes('fixtures')) {
              result.existingTestData.fixtures.push({ path: relativePath, sampledStructure });
            } else {
              result.existingTestData.payloads.push({ path: relativePath, sampledStructure });
            }
            uniqueFiles.add(f);

            // Phase 46.1: @mcp-learn Comment Scanner
            if (ext === '.ts' || ext === '.js') {
              const mcpLearnRegex = /\/\/\s*@mcp-learn:\s*(.+?)\s*->\s*(.+)/g;
              let learnMatch;
              while ((learnMatch = mcpLearnRegex.exec(content)) !== null) {
                if (learnMatch[1] && learnMatch[2]) {
                  if (!result.mcpLearnDirectives) result.mcpLearnDirectives = [];
                  result.mcpLearnDirectives.push(`Codebase Rule: When "${learnMatch[1].trim()}" -> Action: ${learnMatch[2].trim()}`);
                }
              }
            }
          }
        }
      }

      // --- Phase 37.2: Enhanced Codebase Analysis ---
      // Detect Duplicate Steps
      const stepCounts = new Map<string, string[]>();
      for (const def of result.existingStepDefinitions) {
        for (const step of def.steps) {
          if (!stepCounts.has(step)) stepCounts.set(step, []);
          stepCounts.get(step)!.push(def.file);
        }
      }
      result.duplicateSteps = Array.from(stepCounts.entries())
        .filter(([_, files]) => files.length > 1)
        .map(([step, files]) => ({ step, files: Array.from(new Set(files)) }));

      // Detect Unused POM Methods
      const usedMethods = new Set<string>();
      for (const def of result.existingStepDefinitions) {
        try {
          const content = await fs.readFile(path.join(projectRoot, def.file), 'utf8');
          const methodMatch = content.matchAll(/\.([a-zA-Z0-9_]+)\s*\(/g);
          for (const m of methodMatch) {
             usedMethods.add(m[1] as string);
          }
        } catch {}
      }

      result.unusedPomMethods = [];
      for (const po of result.existingPageObjects) {
        const unused = po.publicMethods.filter(signature => {
          const name = signature.split('(')[0]?.trim();
          return name && !usedMethods.has(name);
        });
        if (unused.length > 0) {
           result.unusedPomMethods.push({ path: po.path, unusedMethods: unused });
        }
      }

      // 9. Provide recommendation
      if (!result.bddSetup.present) {
        result.recommendation = "Playwright-BDD config not found. Standard setup needed.";
        if (result.bddSetup.configFile) {
          result.recommendation += ` (Found existing ${result.bddSetup.configFile} - reuse and modify)`;
        }
      } else {
        result.recommendation = "Playwright-BDD is present. Reuse existing wrapper base pages and extend Page Object Models.";
      }

      // 10. Phase 43: Duplicate Installation Guard
      const warnings = await depService.scanForDuplicatePlaywrightInstallations(projectRoot);
      if (warnings.length > 0) {
        result.duplicateInstallWarnings = warnings;
        result.recommendation += "\nCRITICAL WARNING: Multiple @playwright/test installations detected. This will cause 'describe() unexpectedly called' errors. You MUST uninstall the duplicates.";
      }

      if (result.dependencies?.implicitFrameworkDetected) {
        result.recommendation += `\nIMPLICIT FRAMEWORK DETECTED: The dependency manager didn't declare ${result.dependencies.frameworkDetected}, but structural code fingerprints confirmed it. Playwright-BDD features are fully supported.`;
      }

      result.recommendation += ExtensionLoader.loadExtensionsForPrompt(projectRoot);

    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`Error analyzing codebase: ${msg}`);
    }

    return result;
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      const stat = await fs.stat(filePath);
      return stat.isFile();
    } catch {
      return false;
    }
  }

  private async directoryExists(dirPath: string): Promise<boolean> {
    try {
      const stat = await fs.stat(dirPath);
      return stat.isDirectory();
    } catch {
      return false;
    }
  }

  private async readAllFiles(dir: string, extension: string): Promise<string[]> {
    let results: string[] = [];
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git' || entry.name === 'playwright-report') continue;
        
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          results = results.concat(await this.readAllFiles(fullPath, extension));
        } else if (entry.isFile() && entry.name.endsWith(extension)) {
          results.push(fullPath);
        }
      }
    } catch(e) {}
    return results;
  }

  /**
   * Helper that checks array of files to determine naming conventions (PascalCase, kebab-case, snake_case).
   */
  private detectNamingConvention(files: string[], defaultExt: string): string {
    if (!files || files.length === 0 || !files[0]) return `Default (e.g. example${defaultExt})`;
    const nameStr = path.basename(files[0] as string);
    const extIndex = nameStr.indexOf('.');
    const ext = extIndex !== -1 ? nameStr.substring(extIndex) : defaultExt;
    
    if (nameStr.includes('-')) return `kebab-case${ext}`;
    if (nameStr.includes('_')) return `snake_case${ext}`;
    if (/^[A-Z]/.test(nameStr)) return `PascalCase${ext}`;
    return `camelCase${ext}`;
  }

  /**
   * Naively extracts top-level keys or structures from JSON/TS/JS data files.
   * Returns a string summarizing the shape (e.g. "{ id, name, details: { ... } }")
   */
  private extractSampleStructure(content: string, ext: string): string {
    try {
      if (ext === '.json') {
        const data = JSON.parse(content);
        if (Array.isArray(data)) {
          return data.length > 0 ? `Array of: { ${Object.keys(data[0]).join(', ')} }` : '[]';
        }
        return `{ ${Object.keys(data).join(', ')} }`;
      }
      
      // For TS/JS, look for exported objects or interfaces
      const keysMatch = content.match(/export\s+(?:const|interface|type|let|var)\s+\w+\s*=\s*{([^}]*)}/);
      if (keysMatch && keysMatch[1]) {
        const keys = keysMatch[1].split(',')
          .map(k => (k.split(':')[0] || '').trim())
          .filter(k => k && !k.startsWith('//'));
        return `{ ${keys.join(', ')} }`;
      }

      // Fallback: search for property-like patterns
      const props = Array.from(content.matchAll(/['"]?([a-zA-Z0-9_]+)['"]?\s*:/g)).map(m => m[1]);
      const uniqueProps = Array.from(new Set(props)).slice(0, 10);
      return uniqueProps.length > 0 ? `{ ${uniqueProps.join(', ')}, ... }` : 'unknown structure';
    } catch {
      return 'structure could not be parsed';
    }
  }
}
