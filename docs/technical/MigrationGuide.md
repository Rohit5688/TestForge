# 🚛 Selenium to Playwright-BDD Migration Guide

Porting legacy Selenium WebDriver tests to modern Playwright-BDD requires a shift from **synchronous, stateful** operations to **asynchronous, stateless** locators. TestForge provides a specialized `migrated_test` engine to automate this architectural translation.

---

## 🚀 How to Start a Migration

You do not need to manually rewrite code. Provide the AI with your legacy source and a destination path.

### 1. Recommended Migration Prompts
> **Prompt**: *"I want to migrate this Java Selenium Page Object: [paste code]. Use the `migrate_test` tool to rewrite it as a TypeScript Playwright POM that extends my `BasePage`."*

> **Prompt**: *"Here is a large Python Selenium test script: [paste code]. Deconstruct it into a BDD `.feature` file, a supporting `PageObject.ts`, and the required step definitions."*

---

## 🧠 The Architectural Translation Engine

When you use the `migrate_test` tool, TestForge applies these deterministic mapping rules:

### A. Implicit/Explicit Waits → Auto-Awaiting
Selenium requires manual waits for actionability. Playwright-BDD eliminates them entirely.

- **Legacy Java**:
  ```java
  wait.until(ExpectedConditions.visibilityOfElementLocated(By.id("btn"))).click();
  ```
- **Playwright Translation**:
  ```typescript
  await page.locator('#btn').click(); // Auto-waits for visibility and clicking
  ```

### B. Frame Shifts → Stateless Frame Locators
Selenium uses a persistent global state shift (`driver.switchTo().frame()`). Playwright-BDD uses scoped, stateless locators.

- **Legacy Java**:
  ```java
  driver.switchTo().frame("sidebar");
  driver.findElement(By.id("link")).click();
  driver.switchTo().defaultContent();
  ```
- **Playwright Translation**:
  ```typescript
  await page.frameLocator('#sidebar').locator('#link').click(); // No state tracking needed
  ```

### C. Tab/Window Handling → Chronological Promises
Selenium switches state *after* the click. Playwright-BDD sets up a promise *before* the action to eliminate race conditions.

- **Legacy Python**:
  ```python
  driver.find_element(By.ID, "new-tab").click()
  driver.switch_to.window(driver.window_handles[1])
  ```
- **Playwright Translation**:
  ```typescript
  const [newPage] = await Promise.all([
    page.context().waitForEvent('page'),
    page.locator('#new-tab').click()
  ]);
  ```

---

## 🤖 Paradigm Mapping Table

| Selenium Paradigm | Playwright-BDD Translation |
| :--- | :--- |
| `By.id("foo")` | `page.locator('#foo')` |
| `By.xpath("//div")` | `page.locator('xpath=//div')` |
| `element.sendKeys("val")` | `locator.fill('val')` |
| `element.getText()` | `locator.textContent()` |
| `Thread.sleep(5000)` | ❌ (Removed in favor of auto-awaiting) |
| `Select(el).selectByValue("x")` | `locator.selectOption('x')` |

---

## 📑 Migration Best Practices
1. **Extend BasePage**: Ensure the AI injects `extends BasePage` into all migrated files to leverage your project's custom wrapper methods.
2. **ARIA-First**: Instruct the AI to upgrade legacy CSS/XPath selectors to Playwright's native ARIA roles (e.g., `getByRole('button')`) during migration for better stability.
3. **Atomic Scaffolding**: Use `validate_and_write` after migration to verify that the newly generated TypeScript code compiles against your project's current dependencies.
