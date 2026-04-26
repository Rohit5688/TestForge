# Architectural Decision Record: `setPageRequired` Configuration

## Background
In Playwright-BDD test automation, managing the core `{ page }` object (the browser context) across multiple step definitions and Page Object Models (POMs) is a critical architectural choice. Depending on the test framework wrapper and the team's preference for handling state in parallel execution, two distinct design patterns emerge.

The AI generation service (TestForge) previously struggled to generate correct boilerplate because it could not reliably infer which pattern the user's project followed. This resulted in "prompt-singleton conflicts" where the LLM might generate code assuming a singleton architecture, causing build failures in projects enforcing strict native fixture injection, or vice versa.

## The Solution: `setPageRequired`
To establish a strict architectural contract between the repository and the AI agent, the `setPageRequired` boolean flag was introduced to the `mcp-config.json` schema.

This configuration tells the `TestGenerationService` exactly which of the two design patterns the project adheres to, guaranteeing that generated code aligns perfectly with the project's state-management rules.

---

## Pattern 1: The Native Fixture Pattern (`setPageRequired: true`)

### Concept
In this pattern, global singletons are strictly forbidden. The `{ page }` object is explicitly passed as a fixture from the Playwright runner into every step definition, and then manually passed down into every Page Object instantiation.

### Why Teams Use It
- **Parallel Safety**: It guarantees zero context bleed when running tests in parallel across multiple workers because state is inherently isolated.
- **Explicit Tracing**: Data flow is highly visible, making debugging easier.

### AI Generation Impact
When `setPageRequired: true`, the AI agent will ALWAYS generate code like this:

**Generated Step Definition:**
```typescript
Given('the user navigates to the login page', async ({ page }) => {
    // Explicitly instantiating the POM with the page fixture
    const loginPage = new LoginPage(page);
    await loginPage.navigate();
});
```

**Generated Page Object:**
```typescript
export class LoginPage {
    constructor(private page: Page) {}
    
    async navigate() {
        await this.page.goto('/login');
    }
}
```

---

## Pattern 2: The Singleton Pattern (`setPageRequired: false` or omitted)

### Concept
In this pattern, the `{ page }` context is injected into a global singleton at the start of a test (often via an overarching `setPage(page)` call in a global setup hook or `page-setup.ts`). Page Objects and utilities retrieve the active page internally via a getter method (e.g., `getPage()`). *This is the default approach used by libraries like `vasu-playwright-utils`.*

### Why Teams Use It
- **Concise Syntax**: Removes the need to pass `{ page }` repeatedly through every layer, reducing boilerplate.
- **Centralized Management**: Simplifies utility functions by allowing them to access the page context directly without requiring it as an argument.

### AI Generation Impact
When `setPageRequired: false`, the AI agent will ALWAYS generate code like this:

**Generated Step Definition:**
```typescript
Given('the user navigates to the login page', async () => {
    // Clean instantiation, no page fixture required
    const loginPage = new LoginPage();
    await loginPage.navigate();
});
```

**Generated Page Object:**
```typescript
import { getPage } from 'vasu-playwright-utils';

export class LoginPage {
    // No page object in the constructor
    constructor() {}
    
    async navigate() {
        const page = getPage();
        await page.goto('/login');
    }
}
```

## Conclusion
The `setPageRequired` property shifts the responsibility of choosing the architectural pattern from the AI's guesswork to an explicit developer contract. End-users (automation architects) must define this in their `mcp-config.json` to ensure TestForge generates perfectly compliant code for their specific wrapper strategy.

---

## Appendix: Equivalent Functions in `vasu-playwright-utils`
When updating code to correctly use the wrapper library without hitting TypeScript errors (such as missing "ghost methods"), it's important to use the granular methods actually exposed by the library.

### 1. `selectOption` Replacements
Instead of a single native-like `selectOption` method, `vasu-playwright-utils` breaks this down into four specific, strongly-typed selection methods exported from `action-utils.ts`. This is a more granular way to select options:
- `selectByValue(input: string | Locator, value: string, options?: SelectOptions)`
- `selectByValues(input: string | Locator, value: Array<string>, options?: SelectOptions)` *(for multi-select)*
- `selectByText(input: string | Locator, text: string, options?: SelectOptions)`
- `selectByIndex(input: string | Locator, index: number, options?: SelectOptions)`

### 2. `waitForPageLoadState` Usage
This function does exist, but it is exported from `page-utils.ts` (not `wait-utils.ts` or `action-utils.ts`). Its signature accepts an options object rather than a string:
```typescript
waitForPageLoadState(options?: NavigationOptions): Promise<void>
```
*(This means calling it as `waitForPageLoadState('domcontentloaded')` throws a TypeScript error because it expects an object like `{ waitUntil: 'domcontentloaded' }` or similar depending on the interface).*
