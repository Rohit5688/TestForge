# Prompt Cheatbook

This cheatbook is designed for both human developers and AI agents (Cursor, Claude, PearAI). Use these prompts to ensure zero-hand-holding automation.

> [!TIP]
> **Pro Tip**: When using these prompts, always include the phrase "Follow the AppForge Protocol" to trigger established Pom-first patterns.

## 🚀 1. Project Onboarding & Repair
*Use these prompts during the first 5 minutes of a new project.*

<Steps>
1.  **Project Initialization**: 
    > "Initialize a new Playwright-BDD project using TestForge. Setup mcp-config.json with a dark-mode theme and chromium browser."
2.  **Legacy Code Audit**: 
    > "Analyze the existing e2e folder. Identify all non-POM tests and suggest a migration path to TestForge standard."
3.  **Environment Sync**: 
    > "Check if the local environment is ready for Appium. If drivers are missing, provide the exact install commands."
4.  **Config Hardening**: 
    > "Audit mcp-config.json. Ensure timeouts are optimized for a slow staging environment and set waitStrategy to networkidle."
5.  **Project Repair**: 
    > "Missing baseline files in the test directory. Regenerate only the missing hooks and base classes without overwriting my custom logic."
</Steps>

---

## 🛠️ 2. Generation (Basic to Complex)
*Prompt templates for creating robust, maintainable tests.*

### Standard Features
6.  **Login Flow**: 
    > "Create a login test. Use credentials from users.staging.json. Generate a LoginPage object and a corresponding .feature file."
7.  **Contact Form**: 
    > "Generate a test for the 'Contact Us' form. Include validation for email format and required fields."
8.  **Navigation Smoke**: 
    > "Create a smoke test that verifies the top 5 navigation links in the header are functional and return 200 OK."

### Advanced UI Logic
9.  **Table Data Extraction**: 
    > "Generate a test that navigates to the 'Admin Users' table, finds the user 'John Doe', and verifies their 'Role' cell text is 'Admin'."
10. **Iframe Interaction**: 
    > "Interact with the Stripe payment element inside the iframe. Fill in dummy card details and verify success message."
11. **Shadow DOM Elements**: 
    > "Target the 'Settings' toggle inside the custom web component shadow root. Ensure the state persists after page reload."
12. **File Upload/Download**: 
    > "Automate the resume upload process on the 'Careers' page. Verify the filename appears in the 'Uploaded Files' list."
13. **Multi-Tab Orchestration**: 
    > "Click the 'Help' link which opens in a new tab. Verify the Help Center content and then switch back to the main tab."
14. **Dynamic Search Results**: 
    > "Search for 'iPhone' in the search bar. Wait for the result list to populate and click the first item that contains 'Pro Max'."
15. **Visual Regression Check**: 
    > "Capture a screenshot of the Header and Footer. Compare against baseline and fail if visual diff is > 5%."

---

## 🩹 3. Autonomous Healing & Hardening
*Fixing flakiness and broken selectors without manual intervention.*

16. **Selector Discovery**: 
    > "The 'Submit' button selector is failing. Use TestForge to find the current accessibility_id or test_id and update the Page Object."
17. **Retrying Flaky Steps**: 
    > "The 'Wait for Loader' step is intermittent. Wrap it in a custom retry logic that polls for 10 seconds with a 500ms interval."
18. **A11y Audit & Fix**: 
    > "Run an accessibility scan on the 'Checkout' page. Automatically generate locators using ARIA roles for any elements missing IDs."
19. **Performance Optimization**: 
    > "The current test takes 45 seconds. Analyze the trace and suggest where we can use networkidle or specific element waits to speed it up."
20. **Self-Healing Verification**: 
    > "I updated the CSS class of the 'Login' button. Run the healer to verify the Page Object is still valid and update if necessary."

---

## 🧹 4. Maintenance & Refactoring
*Keeping the codebase clean as the project grows.*

21. **Duplicate Step Cleanup**: 
    > "Scan all step-definitions. Identify duplicate logic and consolidate them into a single reusable utility function."
22. **Unused Code Purge**: 
    > "Find all methods in the 'CartPage' object that are not called by any .feature file. Delete the unused code."
23. **Utility Extraction**: 
    > "I have repeated 'formatCurrency' logic in 3 pages. Extract this into a shared 'FormattingUtils.ts' file."
24. **Locator Standardization**: 
    > "Convert all XPaths in the 'Inventory' folder to Playwright-recommended locators (getByRole, getByText)."
25. **POM Structure Audit**: 
    > "Ensure all Page Objects extend the BasePage class. Automatically add the missing inheritance where needed."

---

## 🧪 5. Data & User Management
*Managing test data with high fidelity.*

26. **Faker Data Factory**: 
    > "Create a UserDataFactory using Faker.js. Generate a schema for a 'PremiumSubscriber' with random name, email, and expiry date."
27. **Mocking External APIs**: 
    > "Mock the '/api/v1/inventory' call. Return a custom JSON response with 5 items and verify the UI renders them correctly."
28. **State Injection via Cookies**: 
    > "Inject a session cookie to bypass login for the 'Profile' test. Use the cookie data from the previous successful run."
29. **User Store Expansion**: 
    > "Add a 'SuperAdmin' role to users.prod.json. Generate a secure random password and save it."
30. **Cleanup Script**: 
    > "Create a 'AfterAll' hook that deletes any test users created during the run via the Admin API."

---

## 🚀 6. CI/CD & Migration
*Moving tests to the cloud and from legacy frameworks.*

31. **GitHub Action Generation**: 
    > "Generate a CI pipeline for GitHub Actions. Include steps for installing dependencies, running @smoke tests, and uploading HTML reports."
32. **Environment Switching Logic**: 
    > "Update the Playwright config to support 'QA-STAGE' and 'PROD' environments via the --project flag."
33. **Selenium to Playwright Migration**: 
    > "Convert this Selenium Java test class (attached) into a TestForge Page Object and Cucumber Feature."
34. **Detox to Playwright-BDD**: 
    > "Migrate the mobile web login test from Detox to Playwright. Preserve the existing navigation flow and assertions."
35. **Parallelization Tuning**: 
    > "Enable sharding for the CI run. Split the 100 features into 4 parallel jobs to reduce execution time to under 10 minutes."