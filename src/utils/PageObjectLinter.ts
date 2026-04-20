export function lintPageObject(code: string, hasBasePage: boolean): string {
  if (!hasBasePage) return code;
  
  // 1. Inline page methods
  code = code.replace(
    /await this\.page\.([^;]+?)\.click\(\)/g,
    'await this.click(this.page.$1)'
  );
  
  code = code.replace(
    /await this\.page\.([^;]+?)\.fill\(([^;]+?)\)(?=;|\n|$)/g,
    'await this.fill(this.page.$1, $2)'
  );

  // 2. Property locators
  code = code.replace(
    /await (this\.(?!page\b)[a-zA-Z0-9_]+(?:\(\))?(?:\.[a-zA-Z0-9_]+(?:\([^)]*\))?)*)\.click\(\)/g,
    'await this.click($1)'
  );

  code = code.replace(
    /await (this\.(?!page\b)[a-zA-Z0-9_]+(?:\(\))?(?:\.[a-zA-Z0-9_]+(?:\([^)]*\))?)*)\.fill\(([^;]+?)\)(?=;|\n|$)/g,
    'await this.fill($1, $2)'
  );
  
  return code;
}
