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
   * Extracts BDD step patterns from file content (Given, When, Then).
   */
  public static extractSteps(fileContent: string): string[] {
    const steps: string[] = [];
    const stepRegex = /(?:Given|When|Then|Step)\s*\(\s*['"`](.*?)['"`]/g;
    let match;
    while ((match = stepRegex.exec(fileContent)) !== null) {
      if (match[1]) steps.push(match[1]);
    }
    return steps;
  }
}
