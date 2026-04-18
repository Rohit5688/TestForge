/**
 * JsonToStepsTranspiler — Completion Token Efficiency Engine
 *
 * Problem: Step definition files are ~60% boilerplate (imports, createBdd(),
 * fixture destructuring, page instantiation). The LLM writes all of this as
 * completion tokens, which are 4-10x more expensive than input tokens.
 *
 * Solution: LLM outputs compact JSON describing ONLY the variable parts.
 * This transpiler generates the boilerplate automatically.
 *
 * Savings: ~70% fewer completion tokens per step file.
 *
 * Schema handled:
 *   {
 *     "path": "step-definitions/login.steps.ts",
 *     "pageImports": ["LoginPage"],          // POM classes to import
 *     "steps": [
 *       {
 *         "type": "Given",                   // Given | When | Then
 *         "pattern": "I navigate to login",  // Gherkin text
 *         "params": ["email: string"],        // optional, for {string} params
 *         "page": "LoginPage",               // page to instantiate
 *         "method": "navigate",              // method to call
 *         "args": ["process.env.BASE_URL!"], // args to pass
 *       },
 *       {
 *         "type": "When",
 *         "pattern": "I enter {string} and {string}",
 *         "params": ["email: string", "password: string"],
 *         "page": "LoginPage",
 *         "method": "login",
 *         "args": ["email", "password"]
 *       },
 *       {
 *         // Complex step: provide raw body lines instead of page+method
 *         "type": "Then",
 *         "pattern": "I should see error {string}",
 *         "params": ["message: string"],
 *         "body": ["await expect(page.getByRole('alert')).toContainText(message);"]
 *       }
 *     ]
 *   }
 */

export interface JsonStep {
  type: 'Given' | 'When' | 'Then';
  pattern: string;
  params?: string[];         // e.g. ["email: string", "password: string"]
  page?: string;             // POM class name, e.g. "LoginPage"
  method?: string;           // method on above POM, e.g. "login"
  args?: string[];           // args to pass, e.g. ["email", "password"]
  body?: string[];           // raw body lines for complex steps (overrides page+method)
}

export interface JsonStepFile {
  path: string;
  pageImports: string[];     // POM class names to import (server derives paths)
  steps: JsonStep[];
}

export class JsonToStepsTranspiler {
  /**
   * Transpiles a compact JSON step descriptor into a full playwright-bdd
   * TypeScript step definition file.
   */
  public static transpile(stepFile: JsonStepFile, pagesDir = 'pages'): string {
    const lines: string[] = [];

    // ── Imports ──────────────────────────────────────────────────────────────
    lines.push("import { createBdd } from 'playwright-bdd';");

    // Derive relative import paths from the step file location
    const stepFileDepth = stepFile.path.split('/').length - 1;
    const relativePrefix = stepFileDepth > 1
      ? '../'.repeat(stepFileDepth - 1)
      : '../';

    for (const pageClass of stepFile.pageImports) {
      lines.push(`import { ${pageClass} } from '${relativePrefix}${pagesDir}/${pageClass}.js';`);
    }
    lines.push('');
    lines.push('const { Given, When, Then } = createBdd();');
    lines.push('');

    // ── Steps ─────────────────────────────────────────────────────────────────
    for (const step of stepFile.steps) {
      const stepFn = step.type; // Given | When | Then

      // Build fixture destructuring: always include 'page' for POM instantiation
      const fixtureParams = step.params && step.params.length > 0
        ? `{ page }, ${step.params.join(', ')}`
        : '{ page }';

      lines.push(`${stepFn}(${JSON.stringify(step.pattern)}, async (${fixtureParams}) => {`);

      if (step.body && step.body.length > 0) {
        // Complex step: raw body provided by LLM
        for (const bodyLine of step.body) {
          lines.push(`  ${bodyLine}`);
        }
      } else if (step.page && step.method) {
        // Simple step: instantiate page object, call method
        const pageName = step.page;
        const varName = pageName.charAt(0).toLowerCase() + pageName.slice(1);
        lines.push(`  const ${varName} = new ${pageName}(page);`);
        const argsStr = step.args && step.args.length > 0 ? step.args.join(', ') : '';
        lines.push(`  await ${varName}.${step.method}(${argsStr});`);
      }

      lines.push('});');
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Validates that a JSON step file descriptor is structurally sound before
   * attempting transpilation. Returns an array of error messages (empty = valid).
   */
  public static validate(stepFile: JsonStepFile): string[] {
    const errors: string[] = [];

    if (!stepFile.path) errors.push('jsonSteps entry missing required field: path');
    if (!stepFile.steps || stepFile.steps.length === 0) {
      errors.push(`jsonSteps entry at "${stepFile.path}" has no steps`);
    }

    for (let i = 0; i < (stepFile.steps ?? []).length; i++) {
      const s = stepFile.steps[i]!;
      if (!['Given', 'When', 'Then'].includes(s.type)) {
        errors.push(`Step[${i}] at "${stepFile.path}" has invalid type: "${s.type as string}"`);
      }
      if (!s.pattern) {
        errors.push(`Step[${i}] at "${stepFile.path}" is missing a pattern`);
      }
      if (!s.body && !s.page) {
        errors.push(`Step[${i}] "${s.pattern}" must have either "page"+"method" or a "body" array`);
      }
      if (s.page && !s.method) {
        errors.push(`Step[${i}] "${s.pattern}" has "page" but is missing "method"`);
      }
    }

    return errors;
  }
}
