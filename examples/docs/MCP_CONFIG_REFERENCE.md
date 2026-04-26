# Master Configuration Reference

`mcp-config.json` is the central source of truth for TestForge. It dictates how the AI agent perceives your project, which browsers it uses, how it handles authentication, and where it writes code.

> [!NOTE]
> TestForge utilizes a **Deep Merge** strategy. Any property omitted in your local config will automatically fallback to the system defaults defined in `DEFAULT_CONFIG`.

## ⚙️ Core Properties

### `version`
The schema version of the configuration.
- **Type**: `string`
- **Current**: `"2.4.0"`

### `tags`
Common Cucumber tags used during generation and execution. These dictate the taxonomy of your test suite.
- **Example**: `["@smoke", "@regression", "@e2e", "@a11y"]`

### `dirs`
Defines the directory layout of your project. This is critical for the AI to find Page Objects and Step Definitions.
- **`features`**: Path to `.feature` files.
- **`pages`**: Path to Page Object Model (POM) files.
- **`stepDefinitions`**: Path to Cucumber step logic.
- **`testData`**: Path to JSON/TS/JS data fixtures.

```json
"dirs": {
  "features": "test/features",
  "pages": "src/pages/e2e",
  "stepDefinitions": "test/steps",
  "testData": "test/data"
}
```

---

## 🔒 Authentication Strategies

TestForge provides three distinct strategies for handling test user credentials.

| Strategy | Description | Recommendation |
| :--- | :--- | :--- |
| `none` | No login steps or credentials provided to the AI. | Use for public marketing sites. |
| `users-json` | Credentials retrieved from `test-data/users.{env}.json`. | **Best Practice** for enterprise teams. |
| `env` | Credentials retrieved from raw `.env` variables. | Use for legacy project migrations. |

### Configuration Example
```json
"credentials": {
  "strategy": "users-json",
  "file": "test-data/users.json",
  "schemaHint": "JSON with 'username', 'password', and 'role' fields"
}
```

---

## ⏯️ Wait & Locator Strategies

Fine-tune how TestForge interacts with the DOM to maximize stability and minimize flakiness.

### `waitStrategy`
Determines when a page interaction is considered "complete".
- **`domcontentloaded`**: Fast. Triggers as soon as the HTML is parsed.
- **`load`**: Standard. Waits for all subresources (images/stylesheets).
- **`networkidle`**: **Recommended** for SPAs. Waits until there are no network connections for at least 500ms.

### `locatorOrder`
(Advanced) Forces the AI to prefer certain locator strategies over others.
- **Priority**: `accessibility_id` > `test_id` > `text` > `placeholder` > `css` > `xpath`.

---

## 🌍 Multi-Environment Setup

TestForge is environment-aware. It uses `currentEnvironment` to swap between data fixtures automatically.

```json
{
  "currentEnvironment": "staging",
  "environments": ["local", "staging", "prod", "qa-canary"]
}
```

> [!TIP]
> Use the command `manage_config({ operation: 'write', patch: { currentEnvironment: 'prod' } })` to switch contexts instantly without manual file editing.

---

## 🧪 Advanced Tuning

### Timeouts
All values are in milliseconds (ms).
- **`testRun`**: Maximum time for a full test suite execution (Default: 120,000ms).
- **`sessionStart`**: Maximum time to wait for a browser to boot and navigate (Default: 30,000ms).
- **`healingMax`**: Number of self-healing retry loops allowed per failure.

### Architecture Nuances
- **`basePageClass`**: If your project uses a custom BasePage wrapper (e.g., `@my-org/ui-wrapper`), define it here. All generated Page Objects will automatically `extend` this class and import it.
- **`executionCommand`**: Override the default `npx playwright test`. Example: `yarn e2e:run`.

---

## 🖼️ Visual Exploration
- **`enableVisualExploration`**: If `true`, TestForge captures high-resolution screenshots during `inspect_page_dom`. These are surfaced to the AI and local developer tools for visual parity.

---

## 📋 Comprehensive Example
A production-ready `mcp-config.json` for a modern React project.

```json
{
  "version": "2.4.0",
  "tags": ["@smoke", "@critical"],
  "envKeys": { "baseUrl": "APP_URL", "apiKey": "STAGING_X_TOKEN" },
  "dirs": {
    "features": "e2e/features",
    "pages": "e2e/pages",
    "stepDefinitions": "e2e/steps",
    "testData": "e2e/data"
  },
  "browsers": ["chromium", "firefox"],
  "timeouts": {
    "testRun": 180000,
    "sessionStart": 45000,
    "healingMax": 5
  },
  "credentials": { "strategy": "users-json" },
  "currentEnvironment": "staging",
  "waitStrategy": "networkidle",
  "basePageClass": "src/support/BasePage",
  "enableVisualExploration": true
}
```