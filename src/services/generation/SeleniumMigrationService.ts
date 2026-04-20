import { McpConfigService } from '../config/McpConfigService.js';
import type { ICodebaseAnalyzer } from '../../interfaces/ICodebaseAnalyzer.js';

export class SeleniumMigrationService {
  private configService: McpConfigService;

  constructor() {
    this.configService = new McpConfigService();
  }

  /**
   * Generates a strict set of system instructions for the LLM to migrate legacy Selenium code.
   * This handles the "AST/Regex" mapping heuristically via the LLM context capability.
   */
  public generateMigrationPrompt(projectRoot: string, legacyCode: string, sourceDialect: string, codebaseContext: any, memoryPrompt: string = ""): string {
    const runConfig = this.configService.read(projectRoot);
    const wrapperTarget = runConfig.basePageClass || 'Not strictly defined';

    return `
You are an expert Selenium-to-Playwright Migration Engine.
Your task is to translate the provided legacy ${sourceDialect.toUpperCase()} Selenium code into modern, strict TypeScript Playwright-BDD code.

### 🎯 DESTINATION CONTEXT
Target Wrapper Base Page: ${wrapperTarget}
Existing Pages Discovered: ${codebaseContext?.existingPageObjects?.map((p: any) => p.path).join(', ') || 'None'}

### 🛑 CRITICAL TRANSLATION RULES

1. **Wait Strategy Cleanup (Implicit/Explicit Waits)**
   - DESTROY all \`Thread.sleep()\`, \`WebDriverWait\`, and \`ExpectedConditions\` logic.
   - DO NOT port them. Playwright automatically awaits actionability. 
   - Only translate the terminal action (e.g., \`locator.click()\`).
   - If waiting for an element to explicitly disappear, map to \`await locator.waitFor({ state: 'hidden' })\`.

2. **Chronological Control Flow (Windows/Tabs)**
   - Selenium switches state *after* the action: \`click(); driver.getWindowHandles(); driver.switchTo().window(guid);\`.
   - Playwright MUST setup the listener *before* the action using \`Promise.all\`:
     \`\`\`typescript
     const [newPage] = await Promise.all([
       page.context().waitForEvent('page'),
       page.locator('a[target="_blank"]').click()
     ]);
     await newPage.waitForLoadState();
     // Perform actions on newPage
     \`\`\`
   - You MUST restructure the AST chronologically.

3. **IFrame State Verification (Stateless Locators)**
   - Selenium: \`driver.switchTo().frame("my-frame"); driver.findElement(By.id("foo")).click();\`
   - Playwright: \`await page.frameLocator('[name="my-frame"]').locator('#foo').click();\`
   - NEVER return a global "switched" driver state. Chain \`frameLocator\` consistently.

4. **Locator & Command Mapping**
   - \`By.id("foo")\` -> \`page.locator('#foo')\`
   - \`By.cssSelector(".bar")\` -> \`page.locator('.bar')\`
   - \`By.xpath("//div")\` -> \`page.locator('xpath=//div')\`
   - \`sendKeys(val)\` -> \`fill(val)\`
   - \`getText()\` -> \`textContent()\` or \`innerText()\`
   - \`getAttribute("class")\` -> \`getAttribute('class')\`

5. **Legacy Wrapper Omission (Boilerplate Stripping)**
   - If the provided code contains \`BaseTest\`, \`TestBase\`, \`@BeforeMethod\`, \`@AfterClass\`, or Webdriver initialization (e.g., \`new ChromeDriver()\`), OMIT IT COMPLETELY.
   - Playwright configurations and Native Fixtures handle browser teardown internally.

6. **Data Providers**
   - If migrating a Test file with \`@DataProvider\` or \`@pytest.mark.parametrize\`:
   - Map it to a TypeScript loop wrapping a \`test.describe\`:
     \`\`\`typescript
     const testData = [{ user: 'a', pass: 'b' }, { user: 'c', pass: 'd' }];
     for (const data of testData) {
       test(\`Testing with \${data.user}\`, async ({ page }) => { ... });
     }
     \`\`\`

7. **Class Conversions**
   - Convert Java \`@FindBy(id="btn") WebElement btn;\` properties to TypeScript class properties.
   - Initialize them in the constructor: \`this.btn = page.locator('#btn');\`.

8. **API & Database Hooks (Non-UI)**
   - If migrating REST API scripts (e.g. \`RestAssured\`, \`requests\`), map them to Playwright's \`request\` context API (\`await request.get('/api/v1')\`).
   - If migrating SQL Database handlers (e.g. \`JDBC\`, \`pyodbc\`), map them to generic TypeScript \`async\` classes. Instruct the user to place DB credentials in \`.env\`.
   - If migrating Cloud SDKs (AWS S3, Azure Blob), output the snippet as a standalone TypeScript fixture or utility module.

### 🏗️ DEEP STRUCTURAL BRIDGING

9. **Procedural Deconstruction (Fat Scripts)**
   - If the legacy code is a "Standalone/Fat Script" (e.g. containing 20+ \`driver.findElement\` calls with no imported Page Objects):
   - You MUST perform *Procedural Deconstruction*. Output TWO files: A new \`GeneratedMigrationPage.ts\` containing the extracted locators, and the Refactored Test file that imports and uses this new POM.

10. **Singleton & DriverFactory Stripping**
    - Detect any usage of ThreadLocal Singletons (e.g., \`DriverFactory.getInstance()\`, \`DriverManager.getDriver()\`).
    - DESTROY these instantiations. Playwright injects the \`{ page, context }\` fixtures natively. Remap all \`driver.\` calls to the injected \`page.\` object.

11. **Inferred BDD Upgrade (Vanilla JUnit/TestNG)**
    - If the input is a raw \`@Test\` Class WITHOUT Cucumber/Gherkin bindings:
    - Automatically UPGRADE the test to Playwright-BDD.
    - Analyze the test method names (e.g., \`userCanLoginSuccessfully\`) and logic to generate a \`Feature\` file (Given/When/Then), and output the corresponding \`step.ts\` definitions. Do NOT just output a vanilla \`test()\` block. Bridge them into the BDD ecosystem.

12. **Legacy Reporting & Telemetry Bridge**
    - Detect legacy logging statements (e.g., \`Log4j\`, \`Log.info\`, \`System.out.println\`).
    - Detect legacy reporter hooks (e.g., \`ExtentReports.log()\`, \`Allure.step()\`).
    - Map ALL of these to asynchronous Playwright native steps: \`await test.step('legacy log message', async () => { ... })\`.
    - If the scope is inside a Page Object where \`test.step\` is not normally imported, output the log as a standard \`console.log\` or import \`test\` from \`@playwright/test\`.
    - Strip legacy screenshot failure logic (e.g., \`TakesScreenshot\`); Playwright configuration handles this automatically.
    
${memoryPrompt}

### 🚨 INPUT LEGACY CODE
\`\`\`${sourceDialect}
${legacyCode}
\`\`\`

OUTPUT FORMAT INSTRUCTION:
Return ONLY the newly migrated TypeScript file content as a raw code block. No conversational filler or explanations. Add inline comments only if a Selenium concept fundamentally could not be safely mapped.
`;
  }
}
