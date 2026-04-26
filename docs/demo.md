# Demo Scenarios: TestForge & AppForge

Two separate 5-minute videos. Target: standard e-commerce flow (Login). Show zero-to-one automation + execution.

## Video 1: TestForge (Web Automation)

**Target:** Web browser (e.g., SauceDemo `https://www.saucedemo.com`)
**Capabilities Showcased:** Project scaffold, Web UI inspection, POM/Step generation, Execution.
**Flow (5 mins):**

1. User provides prompt to AI.
2. AI calls `setup_project` (Playwright + Cucumber).
3. AI calls `inspect_page` (or similar UI tool) on URL.
4. AI calls `generate_cucumber_pom` to write `Login.feature`, `LoginPage.ts`, `login.steps.ts`.
5. AI calls `validate_and_write`.
6. AI calls `run_cucumber_test`.
7. Test passes. AI summarizes.

**User Prompt to Start Video 1:**

> "Initialize a new Playwright web automation project in the current directory. Target the site https://www.saucedemo.com. Inspect the login page, generate a Cucumber feature for a successful login using 'standard_user' and 'secret_sauce', write the corresponding Page Object and Step Definitions, validate the code, and run the test suite."

---

## Video 2: AppForge (Mobile Automation)

**Target:** Android Emulator (e.g., SauceLabs My Demo App `.apk`)
**Capabilities Showcased:** Project scaffold, Appium session connect, Mobile XML hierarchy dump, POM/Step generation, Execution.
**Flow (5 mins):**

1. User provides prompt to AI.
2. AI calls `setup_project` (WebdriverIO + Appium).
3. User manually adds App path/caps to `mcp-config.json` (Phase 2 setup trigger).
4. AI calls `start_appium_session` then `inspect_ui_hierarchy` to get mobile elements.
5. AI calls `generate_cucumber_pom` for mobile Login screen.
6. AI calls `validate_and_write`.
7. AI calls `run_cucumber_test`.
8. Test passes on emulator. AI summarizes.

**User Prompt to Start Video 2:**

> "We need to automate the Android login screen for our demo app. First, run the AppForge project setup. I will update the config with the APK path. Once I confirm, connect to the Appium session, inspect the current screen's UI hierarchy, generate a Cucumber feature and Page Object for the login flow, and execute the test."

---

## (Optional) Killer Feature: The "Self-Heal" Demo

If time permits in either video (minutes 4-5):

1. Manually sabotage a selector in the generated Page Object (e.g., change `#login-button` to `#broken-btn`).
2. Run test. It fails.
3. Prompt AI: _"Test failed. Use self-heal tools to fix the broken selector and re-run."_
4. AI detects failure, fuzzy-matches new selector from UI dump, verifies, and auto-learns.
