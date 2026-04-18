export interface JsonPageObject {
  className: string;
  path: string;
  extendsClass?: string;
  imports?: string[];
  locators?: { name: string; selector: string; isArray?: boolean }[];
  methods?: { name: string; isAsync?: boolean; args?: string[]; body: string[] }[];
}

export class JsonToPomTranspiler {
  /**
   * Transpiles a JSON representation of a Page Object into a fully formatted TypeScript string.
   */
  public static transpile(pom: JsonPageObject): string {
    const lines: string[] = [];

    // 1. Imports
    if (pom.imports && pom.imports.length > 0) {
      lines.push(...pom.imports);
      lines.push('');
    } else {
      lines.push("import { expect, type Locator, type Page } from '@playwright/test';");
      lines.push('');
    }

    // 2. Class Declaration
    const extendsClause = pom.extendsClass ? ` extends ${pom.extendsClass}` : '';
    lines.push(`export class ${pom.className}${extendsClause} {`);

    // 3. Properties / Locators
    const hasConstructor = pom.methods?.some(m => m.name === 'constructor');
    if (pom.locators && pom.locators.length > 0) {
      for (const loc of pom.locators) {
        lines.push(`  readonly ${loc.name}: Locator;`);
      }
      lines.push('');

      // If no explicit constructor is provided, auto-generate one
      if (!hasConstructor) {
        if (pom.extendsClass) {
          lines.push(`  constructor(page: Page) {`);
          lines.push(`    super(page);`);
        } else {
          lines.push(`  protected readonly page: Page;`);
          lines.push(`  constructor(page: Page) {`);
          lines.push(`    this.page = page;`);
        }
        for (const loc of pom.locators) {
          // selector is already a fully-formed Playwright API call (page.getByRole, page.getByTestId...)
          // Assign it verbatim. Do NOT wrap in page.locator().
          lines.push(`    this.${loc.name} = this.${loc.selector};`);
        }
        lines.push(`  }`);
        lines.push('');
      }
    }

    // 4. Methods
    if (pom.methods) {
      for (const method of pom.methods) {
        const asyncKeyword = method.isAsync !== false && method.name !== 'constructor' ? 'async ' : '';
        const args = method.args ? method.args.join(', ') : '';
        lines.push(`  ${asyncKeyword}${method.name}(${args}) {`);
        if (method.body) {
          for (const statement of method.body) {
            lines.push(`    ${statement}`);
          }
        }
        lines.push(`  }`);
        lines.push('');
      }
    }

    lines.push(`}`);
    return lines.join('\n');
  }
}
