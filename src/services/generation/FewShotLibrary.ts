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
await page.locator('//div[1]/button[2]').click();

// ❌ BAD: Direct Playwright calls inside step definitions — violates POM
When('I click login', async () => { await page.locator('[data-testid="login"]').click(); });

// ❌ BAD: Stub body — REJECTED by Stub Hunter
async clickLogin(): Promise<void> { /* TODO */ }

// ❌ BAD: Hardcoded URL in Page Object
async navigate() { await this.page.goto('https://example.com/login'); }
\`\`\`

\`\`\`typescript
// ✅ GOOD: Stable locator from inspect_page_dom
get loginBtn() { return this.page.getByTestId('login-button'); }

// ✅ GOOD: Step uses page object WITHOUT constructor args (singleton injected by setup)
When('I click the login button', async () => { 
  const loginPage = new LoginPage(); 
  await loginPage.clickLogin(); 
});

// ✅ GOOD: Full implementation
async clickLogin(): Promise<void> { await this.loginBtn.click(); }

\`\`\`typescript
// ❌ BAD: Destructuring the \`page\` fixture is BANNED
// The page is injected via the \`autoSetup\` fixture. Destructuring steals it or creates conflicts.
When('I click the login button', async ({ page, loginPage }) => { /* ... */ });

// ❌ BAD: Injecting page into the constructor is BANNED
const loginPage = new LoginPage(page);
\`\`\`

\`\`\`typescript
// ✅ GOOD: Uses baseURL from config
async navigate() { await this.page.goto('/login'); }
\`\`\`

\`\`\`typescript
// ❌ BAD: force:true bypasses actionability — masks real overlay bugs
await this.page.locator('#checkout-btn').click({ force: true });

// ❌ BAD: evaluate-click bypasses Playwright entirely — hides real UI defects
await this.page.locator('#checkout-btn').evaluate((el) => (el as HTMLElement).click());

// ✅ GOOD: Wait for the overlay to clear, then click normally
await expect(this.page.locator('.loading-overlay')).toBeHidden();
await this.page.locator('#checkout-btn').click();
\`\`\`

\`\`\`typescript
// ❌ BAD: networkidle / page.title() as SPA state guard — flaky and Selenium-era
await page.waitForLoadState('networkidle');
expect(await page.title()).toBe('Search Results');

// ✅ GOOD: Assert a structural element that only appears when the screen is hydrated
await expect(page.locator('.product-grid-item').first()).toBeVisible();
\`\`\`

\`\`\`typescript
// ❌ BAD: Direct URL goto() inside a test step — creates False Positives in E2E
When('I proceed to cart', async () => {
  // UI interaction failed — bypassed with goto. FORBIDDEN.
  await page.goto('/cart');
});

// ✅ GOOD: Wait for the blocker, then use the real UI element
When('I proceed to cart', async () => {
  await expect(cartPage.addedToCartToast).toBeHidden();
  await cartPage.clickViewCart();
});
\`\`\`

\`\`\`typescript
// ❌ BAD: .first() suppresses strict-mode — silently targets invisible element
await page.getByRole('searchbox').first().fill('Nike Shoes');

// ✅ GOOD: Container-scope OR visibility filter to resolve strict-mode correctly
await page.locator('header').getByRole('searchbox').fill('Nike Shoes');
// OR
await page.getByRole('searchbox').filter({ visible: true }).fill('Nike Shoes');
\`\`\`
`;
  }
}
