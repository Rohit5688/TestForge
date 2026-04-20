export class TestGenerationService {
    async generatePromptInstruction(testDescription, projectRoot, analysisResult, customWrapperPackage, baseUrl) {
        const reusedContext = [
            analysisResult.bddSetup.present ? "Existing playwright-bdd configuration" : "No playwright-bdd found (needs provisioning)",
            "--- Naming Conventions (MUST FOLLOW) ---",
            `Features: ${analysisResult.namingConventions.features}`,
            `Page Objects: ${analysisResult.namingConventions.pages}`,
            "--- Existing Step Patterns to Reuse ---",
            ...(analysisResult.existingStepDefinitions.flatMap(s => s.steps.map(step => `- ${step}`))),
            "--- Page Objects ---",
            ...(analysisResult.existingPageObjects.map(p => `${p.path} -> Methods: ${p.publicMethods.join(', ')}`)),
            ...(analysisResult.customWrapper ? [`Custom Wrapper (${analysisResult.customWrapper.package}): ${analysisResult.customWrapper.detectedMethods.join(', ')}`] : [])
        ];
        let instructContent = `[SYSTEM INSTRUCTION: MCP TEST GENERATION]
You are a highly capable QA automation engineer.
Your task is to generate a Playwright-BDD + POM test suite for the following description:
"${testDescription}"

--- CONTEXT ---
Target Project Root: ${projectRoot}
Base URL (optional): ${baseUrl || 'none'}
Playwright-BDD Present: ${analysisResult.bddSetup.present}

Existing Page Objects and Methods available for reuse:
${reusedContext.join('\n')}

--- MANDATORY REQUIREMENTS (SOLID & BDD PATTERNS) ---
1. You MUST output a structured JSON response EXACTLY matching the formatting requested below. Do NOT wrap the JSON in markdown code blocks, or if you do, ensure the JSON is perfectly valid.
2. Step definitions MUST NEVER contain raw Playwright calls (e.g., page.locator). They must strictly call Page Object Model methods.
3. Reuse existing POM methods from the context above whenever possible. Avoid duplicating existing logic.
4. Semantic Step Matching & Fuzzy Adaptation: If your intent is semantically similar to an "Existing Step Pattern" listed above (e.g. "I press login" vs "I click login button"), you MUST REWRITE your requested step in the \`.feature\` file to exactly match the existing step definition. Do NOT create a duplicate step definition.
5. Environments & URLs: Do NOT hardcode sensitive URLs or credentials in your steps. Assume the project uses a \`.env\` file (e.g., \`process.env.BASE_URL\`). Use Playwright's \`baseURL\` config or \`dotenv\` rather than hardcoding.
6. If a \`Custom Wrapper\` is present in the context above, ensure you import and extend it for any newly generated Page Objects.
7. Asynchronous Auto-Waiting: Page Object methods MUST use Playwright's web-first assertions (e.g. \`await expect(this.btn).toBeVisible()\`) to prevent race conditions during page transitions. Do not assume elements instantly exist.
8. Data-Driven Testing: Default to generating Gherkin \`Scenario Outline:\` with an \`Examples:\` data table when dealing with user inputs, rather than hardcoding static data inside the steps.
9. Strict Assertions: Every \`Then\` step MUST contain at least one valid Playwright \`expect(locator)\` assertion verifying a visible DOM state. URL assertions alone are insufficient.
10. Page Transitions & Navigation: If a Page Object method triggers a page transition (e.g., clicking 'Login' or 'Submit'), the method MUST end by explicitly waiting for the new page to stabilize. You must use \`await this.page.waitForLoadState('domcontentloaded')\` or assert that a unique element on the *following* page is visible before the method completes.
11. Complex Interactions (Mouse/Keyboard): For actions like drag-and-drop, hover, or file uploads, you MUST use Playwright's native APIs (e.g., \`await this.page.dragAndDrop()\`, \`await locator.hover()\`, \`await locator.setInputFiles()\`). NEVER use raw \`page.evaluate()\` to dispatch fake DOM events unless absolutely natively unsupported.

--- PLAYWRIGHT-BDD SPECIFIC RULES ---
- Step definitions MUST be defined using \`playwright-bdd\`, not standard Cucumber:
  \`\`\`typescript
  import { createBdd } from 'playwright-bdd';
  import { test } from '@playwright/test';
  const { Given, When, Then } = createBdd();
  \`\`\`
- Do NOT import from \`@cucumber/cucumber\`.
- In your explanation string, remind the user that they must run \`npx bddgen\` to generate the test files, followed by \`npx playwright test\`.

--- OUTPUT SCHEMA ---
Your entire response must be a single JSON object with this shape:
{
  "files": [
    {
      "path": "features/new-feature.feature",
      "content": "Feature: ...\\n"
    },
    {
      "path": "step-definitions/new-steps.ts",
      "content": "import { createBdd } from 'playwright-bdd';...\\n"
    },
    {
      "path": "pages/NewPage.ts",
      "content": "import { BasePage } from '...';\\n..."
    }
  ],
  "setupRequired": ${!analysisResult.bddSetup.present},
  "reusedComponents": [
    // List string descriptions of what you decided to reuse
  ],
  "explanation": "Brief explanation of the generated structure."
}
`;
        return instructContent;
    }
}
//# sourceMappingURL=TestGenerationService.js.map