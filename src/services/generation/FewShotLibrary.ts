import type { CodebaseAnalysisResult } from '../../interfaces/ICodebaseAnalyzer.js';

/**
 * FewShotLibrary — Static building blocks for the Hybrid Prompt Engine.
 *
 *   1. CoT Scaffold: Mandatory 4-step reasoning protocol for every generate_gherkin_pom_test_suite call.
 *   2. Negative Examples: Web/Playwright-BDD anti-patterns that steer the LLM away from common mistakes.
 *
 * Intentionally static for stability and token efficiency.
 * Dynamic, project-specific examples come from HybridPromptEngine.selectChampion().
 */
export class FewShotLibrary {
  /**
   * Returns the mandatory Chain-of-Thought reasoning scaffold.
   * Adapted for Playwright-BDD POM (web), not Appium.
   */
  public static getCoTScaffold(): string {
    return `
## 🧠 MANDATORY REASONING PROTOCOL (Chain-of-Thought)
Before writing ANY code, follow this sequence in order:

**STEP 1 — AUDIT REUSE**: Search the "Existing Step Definitions" and "Existing Page Objects" sections above.
  - If a matching step already exists → REUSE it with EXACT wording. Do not paraphrase.
  - If a Page Object exists for the target screen → use its methods. Do NOT call inspect_page_dom.

**STEP 2 — VERIFY NEW LOCATORS**: Only for screens NOT covered by existing Page Objects:
  - Call \`inspect_page_dom\` (with the target URL) BEFORE writing locators.
  - Never guess \`data-testid\`, \`aria-label\`, or CSS selectors.

**STEP 3 — PLAN FILES**: Before writing, state which files you will CREATE or MODIFY.
  - Confirm your plan matches the detected architecture (BDD + POM).

**STEP 4 — EXECUTE**: Write COMPLETE, production-ready code. Rules:
  - No TODO comments. No empty method bodies. No stub logic.
  - Every file must compile. Every locator must be verified or reused.
`;
  }

  /**
   * Returns Playwright/BDD-specific anti-patterns (negative examples).
   */
  public static getNegativeExample(_analysis: CodebaseAnalysisResult): string {
    return `
## ❌ ANTI-PATTERNS — These cause build or runtime failures. DO NOT generate:

\`\`\`typescript
// ❌ BAD: Positional XPath — breaks on any layout change
await click('//div[1]/button[2]');

// ❌ BAD: Direct Playwright calls inside step definitions — violates POM
When('I click login', async () => { await page.locator('[data-testid="login"]').click(); });

// ❌ BAD: Stub body — REJECTED by Stub Hunter
async clickLogin(): Promise<void> { /* TODO */ }

// ❌ BAD: Hardcoded URL in Page Object
async navigate() { await gotoURL('https://example.com/login'); }
\`\`\`

\`\`\`typescript
// ✅ GOOD: Stable locator from inspect_page_dom using vasu utils
get loginBtn() { return getLocatorByTestId('login-button'); }

// ✅ GOOD: Page Objects are declared ONCE at top level of the step file (not inside each step)
const loginPage = new LoginPage(); // ← top of file, outside any step

When('I click the login button', async () => { 
  await loginPage.clickLogin();   // ← no 'new LoginPage()' inside the step
});

// ✅ GOOD: Full implementation using vasu click()
async clickLogin(): Promise<void> { await click(this.loginBtn); }

\`\`\`typescript
// ❌ BAD: Destructuring the \`page\` fixture is BANNED
// The page is injected via the \`autoSetup\` fixture. Destructuring steals it or creates conflicts.
When('I click the login button', async ({ page, loginPage }) => { /* ... */ });

// ❌ BAD: Injecting page into the constructor is BANNED
const loginPage = new LoginPage(page);
\`\`\`

\`\`\`typescript
// ✅ GOOD: Uses baseURL from config via gotoURL
async navigate() { await gotoURL('/login'); }
\`\`\`

\`\`\`typescript
// ❌ BAD: force:true bypasses actionability — masks real overlay bugs
await click('#checkout-btn', { force: true });

// ❌ BAD: clickByJS bypasses Playwright entirely — hides real UI defects
await clickByJS('#checkout-btn');

// ✅ GOOD: Wait for the overlay to clear, then click normally
await expectElementToBeHidden('.loading-overlay');
await click('#checkout-btn');
\`\`\`

\`\`\`typescript
// ❌ BAD: networkidle / page.title() as SPA state guard — flaky and Selenium-era
await waitForPageLoadState('networkidle');
expect(await getURL()).toContain('Search Results');

// ✅ GOOD: Use domcontentloaded for fast hydration signaling OR structural element assertion
await waitForPageLoadState('domcontentloaded');
await expectElementToBeVisible(getLocator('.product-grid-item').first());
\`\`\`

\`\`\`typescript
// ❌ BAD: Direct URL navigation inside a test step — creates False Positives in E2E
When('I proceed to cart', async () => {
  // UI interaction failed — bypassed with goto. FORBIDDEN.
  await gotoURL('/cart');
});

// ✅ GOOD: Wait for the blocker, then use the real UI element
When('I proceed to cart', async () => {
  await expectElementToBeHidden(cartPage.addedToCartToast);
  await cartPage.clickViewCart();
});
\`\`\`

\`\`\`typescript
// ❌ BAD: .first() suppresses strict-mode — silently targets invisible element
await fill(getLocatorByRole('searchbox').first(), 'Nike Shoes');

// ✅ GOOD: Container-scope OR visibility filter to resolve strict-mode correctly
await fill(getLocator('header').getByRole('searchbox'), 'Nike Shoes');
// OR
await fill(getVisibleLocator(getLocatorByRole('searchbox')), 'Nike Shoes');
\`\`\`
`;
  }

  /**
   * Returns the CLI-to-Library code mapping table from vasu-playwright-utils.
   * This teaches the LLM how to translate native Playwright thoughts into utility calls.
   */
  public static getMappingTable(): string {
    return `
## 🔄 CLI-TO-LIBRARY MAPPING (vasu-playwright-utils)
When translating user intent or Playwright-CLI generated code, use these equivalents:

| Native Playwright Code                         | vasu-playwright-utils Equivalent             |
| ---------------------------------------------- | -------------------------------------------- |
| \`await page.goto(url)\`                         | \`await gotoURL(url)\`                         |
| \`await page.locator(sel).click()\`              | \`await click(sel)\`                           |
| \`await page.locator(sel).click()\` + nav        | \`await clickAndNavigate(sel)\`                |
| \`await page.locator(sel).fill(val)\`            | \`await fill(sel, val)\`                       |
| \`page.getByRole(role, opts)\`                   | \`getLocatorByRole(role, opts)\`               |
| \`page.getByTestId(id)\`                         | \`getLocatorByTestId(id)\`                     |
| \`await expect(loc).toBeVisible()\`              | \`await expectElementToBeVisible(input)\`      |
| \`await expect(loc).toBeHidden()\`               | \`await expectElementToBeHidden(input)\`       |
| \`await expect(page).toHaveURL(url)\`            | \`await expectPageToHaveURL(url)\`             |

**MANDATORY IMPORTS**:
Always import these from \`vasu-playwright-utils\` or its subpaths.
`;
  }
}
