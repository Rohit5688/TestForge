# ♿ Automated Accessibility Testing

TestForge integrates native accessibility (a11y) validation into your BDD workflow using `@axe-core/playwright`. This allows you to verify WCAG compliance as part of every functional regression test.

---

## 🚀 1. Configuration & Standards

Define your compliance targets and report paths in `mcp-config.json`:

```json
{
  "a11yStandards": ["wcag2aa", "wcag22aa", "best-practice"],
  "a11yReportPath": "test-results/a11y-report.json"
}
```

### Supported Standards
| Standard | Tag | Target |
| :--- | :--- | :--- |
| **WCAG 2.1 AA** | `wcag21aa` | Commercial & public legal standard. |
| **WCAG 2.2 AA** | `wcag22aa` | Latest industry best practice. |
| **Section 508** | `section508` | US Federal government requirement. |
| **Best Practices** | `best-practice` | Premium UX checks (e.g., skip-links, heading order). |

---

## ✍️ 2. Writing A11y Tests

### In Gherkin
The AI is trained to recognize a11y intent. You can include it in any scenario:
```gherkin
Scenario: Verify checkout accessibility
  Given I am on the checkout page
  Then I check the accessibility of the page
```

### In Page Objects
The `BasePage` includes a native `checkAccessibility()` helper. You can call it manually in any step definition:
```typescript
Then('I check the accessibility of the page', async ({ checkoutPage }) => {
  await checkoutPage.checkAccessibility('Checkout Flow Scan');
});
```

---

## 🛠️ 3. Failure & Diagnosis

When an accessibility violation is detected:
1. **Immediate Failure**: The Playwright test fails to prevent non-compliant code from merging.
2. **Detailed Breakdown**: A full JSON list of violations is printed to the terminal, including the specific element CSS, impact level, and a link to the fix guide.
3. **Artifact Generation**: A summary report is saved to your `a11yReportPath` (e.g., `test-results/a11y-report.json`).

---

## 👁️ 4. Why A11y Matters in TestForge
TestForge uses the **Accessibility Tree** (`inspect_page_dom`) as its primary "vision" system. 
- **Symbiotic Stability**: Writing accessible code (with labels and roles) makes TestForge's autonomous healing system *more* powerful. 
- **Semantic Locators**: By finding elements through their a11y roles (e.g., `getByRole('button', { name: 'Purchase' })`), we ensure the application is usable by everyone while making our automation suite 10x more stable.
