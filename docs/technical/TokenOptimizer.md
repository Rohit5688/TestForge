# 🚀 Token Optimizer: Code Mode Execution

The Token Optimizer (`execute_sandbox_code`) allows the AI to run JavaScript snippets inside a secure V8 sandbox on the MCP server. This results in **up to 98% reduction in token usage** by processing massive data locally instead of sending it all to the LLM.

---

## ⚡ The Code Mode Advantage

In "Classic Mode," tools return raw data (e.g., full DOM or 100+ files) to the LLM. In "Code Mode," the AI writes a script to filter that data first.

| Operation | Classic Mode (LLM reads all) | Code Mode (Sandbox filters) |
| :--- | :--- | :--- |
| **Locator Search** | 10k tokens of DOM | ~200 tokens (ID only) |
| **Codebase Audit** | 20k tokens of source | ~150 tokens (Gaps only) |
| **Config Check** | 2k tokens of JSON | ~50 tokens (Value only) |

---

## 🛠️ How it Works

The AI assistant sends a small script to the `execute_sandbox_code` tool. The script uses the `forge.api` to interact with your project services locally.

**Example: Finding a specific button**
```javascript
// The AI writes this script:
const dom = await forge.api.inspectDom('https://my-web-app.com');
return dom.split('\n')
  .filter(line => line.includes('role="button"') && line.includes('Login'))
  .map(line => line.trim());
```

---

## 📚 Technical API Reference

Scripts have access to the following server-side capabilities via the `forge` global:

| Method | Description |
| :--- | :--- |
| `forge.api.inspectDom(url)` | Fetches the Playwright Accessibility Tree. |
| `forge.api.analyzeCodebase(root)` | Performs a full AST scan for steps and POMs. |
| `forge.api.runTests(root, tags)` | Executes the Playwright-BDD suite. |
| `forge.api.readFile(path)` | Reads a file from the local filesystem. |
| `forge.api.searchFiles(query)` | Performs a fast `grep` search across the project. |
| `forge.api.parseAST(path)` | Returns a structured object model of a TS file. |

---

## 🛡️ Security & Isolation

The sandbox is a fortified "Zero-Trust" environment:
- **No Network Access**: The script cannot make external `fetch` calls.
- **No Persistent State**: Every execution starts with a fresh, empty memory context.
- **Resource Limits**: 10-second hard execution timeout to prevent infinite loops.
- **Redacted Scopes**: Access to high-level globals like `process` or `globalThis` is blocked.
