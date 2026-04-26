import { lintPageObject } from './PageObjectLinter.js';

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
      // Ensure Locator type is available for property declarations
      const hasLocatorImport = pom.imports.some(i => i.includes('Locator'));
      if (!hasLocatorImport && pom.locators && pom.locators.length > 0) {
        lines.push("import type { Locator } from '@playwright/test';");
      }
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
    // Detect singleton BasePage pattern: no-arg constructor (uses getPage() internally).
    // When extending such a BasePage, NEVER generate constructor(page) or super(page).
    const isSingletonBase = !!pom.extendsClass;
    if (pom.locators && pom.locators.length > 0) {
      if (isSingletonBase) {
        // Singleton pattern: declare locators as getter-style class fields using this.page
        for (const loc of pom.locators) {
          lines.push(`  get ${loc.name}() { return this.${loc.selector}; }`);
        }
        lines.push('');
      } else {
        // Standard pattern: declare typed properties + constructor
        for (const loc of pom.locators) {
          lines.push(`  readonly ${loc.name}: Locator;`);
        }
        lines.push('');
        if (!hasConstructor) {
          lines.push(`  protected readonly page: Page;`);
          lines.push(`  constructor(page: Page) {`);
          lines.push(`    this.page = page;`);
          for (const loc of pom.locators) {
            lines.push(`    this.${loc.name} = this.${loc.selector};`);
          }
          lines.push(`  }`);
          lines.push('');
        }
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
    let code = lines.join('\n');
    return lintPageObject(code, !!pom.extendsClass);
  }
}
