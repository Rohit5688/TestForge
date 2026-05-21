import { Project, Node, SyntaxKind } from 'ts-morph';
import { McpErrors, McpError } from '../types/ErrorSystem.js';

export class ASTScrutinizer {
  /**
   * Scans a TypeScript string for "lazy scaffolding" (e.g., empty methods, TODO comments).
   * @throws {Error} If lazy patterns are found.
   */
  public static scrutinize(fileContent: string, fileName: string): void {
    // Only scrutinize TypeScript and JavaScript files
    if (!fileName.endsWith('.ts') && !fileName.endsWith('.js')) {
      return;
    }

    let project: Project;
    let sourceFile;

    try {
      project = new Project({ compilerOptions: { strict: false }, skipAddingFilesFromTsConfig: true });
      sourceFile = project.createSourceFile('temp.ts', fileContent);
    } catch (e: any) {
      throw McpErrors.astParseFailed(fileName, e);
    }

    // 1. Check for suspicious "TODO" or "FIXME" comments anywhere in the file
    const comments = sourceFile.getStatementsWithComments().map(s => s.getText());
    // Also grab trailing trivia 
    const fullText = sourceFile.getFullText();
    const lazyKeywords = ['TODO', 'FIXME', 'implement later', 'add logic here', 'add implementation here', 'add your logic here'];
    
    for (const keyword of lazyKeywords) {
      if (fullText.toLowerCase().includes(keyword.toLowerCase())) {
        throw McpErrors.projectValidationFailed(
          `File '${fileName}' contains lazy scaffolding. Found mocking placeholder '${keyword}'. You MUST provide the full, working implementation without TODOs.`
        );
      }
    }

    // 2. Check for empty function/method bodies
    const classes = sourceFile.getClasses();
    for (const cls of classes) {
      for (const method of cls.getMethods()) {
        const bodyContent = method.getBodyText()?.trim();
        if (bodyContent === '') {
          throw McpErrors.projectValidationFailed(
             `File '${fileName}' contains an empty method '${method.getName()}'. You MUST write the complete Playwright interaction logic instead of leaving empty scaffolding blocks.`
          );
        }
      }
    }

    const functions = sourceFile.getFunctions();
    for (const fn of functions) {
        const bodyContent = fn.getBodyText()?.trim();
        if (bodyContent === '') {
          throw McpErrors.projectValidationFailed(
             `File '${fileName}' contains an empty function '${fn.getName() || 'anonymous'}'. You MUST write the complete logic instead of leaving empty scaffolding blocks.`
          );
        }
    }

    // 3. Arrow functions containing empty block {}
    const arrowFunctions = sourceFile.getDescendantsOfKind(SyntaxKind.ArrowFunction);
    for (const arrow of arrowFunctions) {
      const body = arrow.getBody();
      if (Node.isBlock(body)) {
        if (body.getStatements().length === 0 && !body.getText().includes('//')) {
             throw McpErrors.projectValidationFailed(
             `File '${fileName}' contains an empty arrow function block. You MUST provide the full, working implementation instead of empty blocks.`
          );
        }
      }
    }
  }

  /**
   * Scans generated code for project-specific compliance violations.
   * Specifically targets native Playwright anti-patterns when vasu-playwright-utils is enforced.
   * @throws {McpError} If non-compliant patterns are found.
   */
  public static scrutinizeCompliance(fileContent: string, fileName: string): void {
    if (!fileName.endsWith('.ts') && !fileName.endsWith('.js')) return;

    // 1. Prohibit Native Playwright Locators/Actions (Enforce vasu-playwright-utils)
    const nativeLocatorPatterns = [
      { pattern: /page\.locator\s*\(/g, replacement: 'getLocator() or click()/fill()' },
      { pattern: /page\.getBy(Role|Text|Label|Placeholder|AltText|Title|TestId)\s*\(/g, replacement: 'getLocatorByRole() or getLocatorByTestId()' },
      { pattern: /page\.(click|fill|check|uncheck|selectOption|setInputFiles|focus|hover|press|type)\s*\(/g, replacement: 'click(), fill(), etc. from vasu-playwright-utils' },
      { pattern: /page\.\$\s*\(/g, replacement: 'getLocator()' },
      { pattern: /page\.\$\$\s*\(/g, replacement: 'getLocator()' },
    ];

    for (const { pattern, replacement } of nativeLocatorPatterns) {
      const matches = fileContent.match(pattern);
      if (matches) {
        throw McpErrors.projectValidationFailed(
          `NON-COMPLIANT CODE in '${fileName}': Found native Playwright call '${matches[0].trim()}'.\n` +
          `   The TestForge infrastructure REQUIRES using 'vasu-playwright-utils' for all interactions.\n` +
          `   Use: ${replacement} instead of native page methods.`
        );
      }
    }

    // 2. Prohibit networkidle (Enforce domcontentloaded / Structural Assertions)
    const networkIdleRe = /waitForLoadState\s*\(\s*['"`]networkidle['"`]\s*\)/g;
    if (networkIdleRe.test(fileContent)) {
      throw McpErrors.projectValidationFailed(
        `NON-COMPLIANT CODE in '${fileName}': Found waitForLoadState('networkidle').\n` +
        `   'networkidle' is strictly PROHIBITED in modern SPA testing as it is flaky and unreliable.\n` +
        `   Use: 'domcontentloaded' or wait for a structural element (expectElementToBeVisible) instead.`
      );
    }

    // 3. Prohibit page.title() / page.url() as primary state guards
    // We allow them for assertions, but not for "waiting" logic that doesn't have an assertion.
    // This is harder to catch via regex, but we can catch common anti-patterns.
    const weakGuardRe = /await\s+page\.(title|url)\(\)/g;
    if (weakGuardRe.test(fileContent) && !fileContent.includes('expect(')) {
      throw McpErrors.projectValidationFailed(
        `NON-COMPLIANT CODE in '${fileName}': Found 'page.title()' or 'page.url()' used without an assertion.\n` +
        `   These are Selenium-era anti-patterns. Use web-first assertions like 'expect(locator).toBeVisible()' to guard state transitions.`
      );
    }
  }

  public static hasClassLocatorsFast(content: string): boolean {
    return content.includes('page.locator') || content.includes('page.getBy') || content.includes('page.$') || content.includes('page.goto');
  }

  /**
   * Enhanced AST-based method extraction for TypeScript classes using ts-morph.
   * For .d.ts files, also uses regex fallback to extract `export declare function` patterns.
   */
  public static extractPublicMethods(content: string): string[] {
    const methods: string[] = [];
    
    // Regex fallback for .d.ts files: extract `export declare function functionName(`
    const declareMatches = content.matchAll(/export\s+declare\s+function\s+(\w+)\s*\(/g);
    for (const match of declareMatches) {
      if (match[1]) methods.push(match[1] + '()');
    }
    
    // If we found methods via regex (common for .d.ts), return them
    if (methods.length > 0) {
      return [...new Set(methods)];
    }
    
    // Otherwise, use ts-morph for source files
    try {
      const project = new Project({ compilerOptions: { strict: false }, skipAddingFilesFromTsConfig: true });
      const sourceFile = project.createSourceFile('temp.ts', content);

      for (const cls of sourceFile.getClasses()) {
        const publicMethods = cls.getMethods()
          .filter(m => !m.hasModifier(SyntaxKind.PrivateKeyword) && !m.hasModifier(SyntaxKind.ProtectedKeyword))
          .map(m => m.getName() + '()');
        methods.push(...publicMethods);
      }
      
      for (const varDecl of sourceFile.getVariableDeclarations()) {
        const initializer = varDecl.getInitializer();
        if (initializer && Node.isObjectLiteralExpression(initializer)) {
          for (const prop of initializer.getProperties()) {
            if (Node.isMethodDeclaration(prop)) {
              methods.push(prop.getName() + '()');
            } else if (Node.isPropertyAssignment(prop)) {
              const propInit = prop.getInitializer();
              if (propInit && (Node.isArrowFunction(propInit) || Node.isFunctionExpression(propInit))) {
                methods.push(prop.getName() + '()');
              }
            }
          }
        }
      }
      
      for (const fn of sourceFile.getFunctions()) {
        if (fn.isExported()) {
          methods.push(fn.getName() + '()');
        }
      }

      return [...new Set(methods)];
    } catch (e) {
      return [...new Set(methods)]; // Return regex matches if ts-morph fails
    }
  }

  /**
   * Lightweight structural guard for LLM-generated Gherkin (.feature) files.
   *
   * Does NOT require a full Gherkin AST parser (@cucumber/gherkin).
   * Only checks the three structural failures that survive generation-time prompt rules:
   *
   *  1. Missing "Feature:" header — caused by LLM truncation or hallucination.
   *     bddgen error: "No feature file found" or cryptic file-not-found.
   *
   *  2. No Scenario/Scenario Outline — empty feature file that generates zero tests.
   *     bddgen silently succeeds but produces nothing, confusing self-healing.
   *
   *  3. Scenario Outline without an Examples: table — bddgen throws:
   *     "ScenarioOutline requires at least one Examples block" which the LLM
   *     misattributes to a step-definition error.
   *
   * @throws {McpError} with an actionable message if any check fails.
   */
  public static scrutinizeGherkin(fileContent: string, fileName: string): void {
    if (!fileName.endsWith('.feature')) return;

    const lines = fileContent.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    // Check 1: Feature: header must exist
    const hasFeatureHeader = lines.some(l => /^Feature\s*:/i.test(l));
    if (!hasFeatureHeader) {
      throw McpErrors.projectValidationFailed(
        `Gherkin validation failed in '${fileName}': Missing "Feature:" header.\n` +
        `Every .feature file MUST start with "Feature: <description>".\n` +
        `This is likely caused by response truncation — regenerate the complete file.`
      );
    }

    // Check 2: At least one Scenario or Scenario Outline
    const hasScenario = lines.some(l => /^Scenario(?:\s+Outline)?\s*:/i.test(l));
    if (!hasScenario) {
      throw McpErrors.projectValidationFailed(
        `Gherkin validation failed in '${fileName}': No "Scenario:" or "Scenario Outline:" found.\n` +
        `A feature file with no scenarios generates zero tests. Add at least one scenario.`
      );
    }

    // Check 3: Every Scenario Outline must have an Examples: block
    // Walk line by line: when we hit a Scenario Outline, set a flag;
    // clear it when we find Examples:; error if the next Scenario/Feature/EOF arrives first.
    let pendingOutline = '';
    for (const line of lines) {
      if (/^Scenario\s+Outline\s*:/i.test(line)) {
        pendingOutline = line;
      } else if (/^Examples\s*:/i.test(line)) {
        pendingOutline = '';  // satisfied
      } else if (pendingOutline && /^(?:Scenario|Feature|Rule)\s*:/i.test(line)) {
        throw McpErrors.projectValidationFailed(
          `Gherkin validation failed in '${fileName}': "${pendingOutline}" has no "Examples:" table.\n` +
          `Every Scenario Outline MUST have an Examples: data table.\n` +
          `Add the Examples: block, or change this to a plain "Scenario:" if no data table is needed.`
        );
      }
    }
    // Check final pending outline (EOF without Examples)
    if (pendingOutline) {
      throw McpErrors.projectValidationFailed(
        `Gherkin validation failed in '${fileName}': "${pendingOutline}" has no "Examples:" table.\n` +
        `Every Scenario Outline MUST have an Examples: data table.`
      );
    }

    // Check 4: Step keywords validation inside Scenario, Scenario Outline, and Background
    let inScenarioOrBackground = false;
    let inDocString = false;
    const linesWithOrig = fileContent.split('\n');
    for (let i = 0; i < linesWithOrig.length; i++) {
      const lineRaw = linesWithOrig[i];
      if (lineRaw === undefined) continue;
      const line = lineRaw.trim();
      if (!line) continue;
      if (line.startsWith('"""')) {
        inDocString = !inDocString;
        continue;
      }
      if (inDocString) continue;

      if (/^(Scenario|Scenario Outline|Background)\s*:/i.test(line)) {
        inScenarioOrBackground = true;
      } else if (/^(Feature|Rule)\s*:/i.test(line)) {
        inScenarioOrBackground = false;
      } else if (inScenarioOrBackground && !line.startsWith('#') && !line.startsWith('@') && !line.startsWith('|') && !/^Examples\s*:/i.test(line)) {
        if (!line.match(/^(Given|When|Then|And|But|\*)/i)) {
          throw McpErrors.projectValidationFailed(
            `Gherkin validation failed in '${fileName}' at line ${i + 1}:\n"${lineRaw}"\n` +
            `Expected a valid Gherkin keyword (Given, When, Then, And, But, *).`
          );
        }
      }
    }
  }

  /**
   * Extracts BDD step patterns from file content (Given, When, Then).
   */
  public static extractSteps(fileContent: string): string[] {
    const steps: string[] = [];
    const stepRegex = /(?:Given|When|Then|Step)\s*\(\s*['"`](.*?)['"`]/g;
    let match: RegExpExecArray | null;
    while ((match = stepRegex.exec(fileContent)) !== null) {
      const pattern = match[1];
      if (!pattern) continue;
      // Filter out false positives: must be a real BDD step pattern (contains a space or
      // starts with ^ indicating a regex, and must be longer than 5 chars).
      // Single/short words like 'No', 'yes', 'ok' are DataTable values, not step patterns.
      const isRealStep = pattern.length > 5 && (pattern.includes(' ') || pattern.startsWith('^') || pattern.includes('{'));
      if (isRealStep) steps.push(pattern);
    }
    return steps;
  }
}
