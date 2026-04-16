---
title: 🛠️ Installation & MCP Setup
description: Complete step-by-step guide to installing TestForge and connecting it to your AI assistant.
---

import { Steps, Tabs, TabItem, FileTree, Card, CardGrid } from '@astrojs/starlight/components';

This guide gets you from zero to a running TestForge MCP connection. Follow every step — skipping prerequisites is the #1 cause of "nothing works" support questions.

---

## ✅ Prerequisites

Before installing TestForge, verify you have the following:

| Requirement | Minimum Version | Verify Command |
| :--- | :--- | :--- |
| **Node.js** | `>= 18.0.0` | `node --version` |
| **npm** | `>= 9.0.0` | `npm --version` |
| **AI Client** | Claude Desktop, Cursor, VS Code + Copilot, Cline | See client-specific setup below |
| **OS** | Windows 10+, macOS 12+, Ubuntu 20.04+ | — |

:::caution[Node.js Version]
TestForge requires Node.js **18 or higher**. If you're on an older version, use [nvm](https://github.com/nvm-sh/nvm) to upgrade: `nvm install 18 && nvm use 18`.
:::

---

## 📦 Step 1: Verify TestForge is Accessible

TestForge is published to npm as **`testforge`**. You do not need to install it globally — `npx` handles it automatically. Verify it resolves:

```bash
npx testforge --version
```

Expected output: `testforge vX.Y.Z` (or a download prompt, then the version).

:::note
If you see `command not found`, ensure your npm registry is set to `https://registry.npmjs.org`.
:::

---

## 🔌 Step 2: Connect to Your AI Client

Choose your AI client below and follow the exact steps.

<Tabs>
  <TabItem label="Claude Desktop">
    **Config file location:**
    - **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
    - **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
    - **Linux**: `~/.config/Claude/claude_desktop_config.json`

    **1. Open the config file** (create it if it doesn't exist).

    **2. Add the TestForge server:**
    ```json
    {
      "mcpServers": {
        "testforge": {
          "command": "npx",
          "args": ["-y", "testforge"]
        }
      }
    }
    ```

    **3. Restart Claude Desktop completely** (quit from the menu bar, then reopen).

    **4. Verify**: In a new Claude conversation, type: `"List available TestForge tools"`. You should see 30+ tools listed.
  </TabItem>
  <TabItem label="Cursor">
    **Config file location**: `.cursor/mcp.json` in your **project root** (or `~/.cursor/mcp.json` for global config).

    **1. Create or open** `.cursor/mcp.json`:
    ```json
    {
      "mcpServers": {
        "testforge": {
          "command": "npx",
          "args": ["-y", "testforge"]
        }
      }
    }
    ```

    **2. Reload the Cursor window**: `Ctrl+Shift+P` → `Developer: Reload Window`.

    **3. Verify**: Open the Cursor AI panel, type: `"Check if TestForge is connected"`. You should see it confirmed.
  </TabItem>
  <TabItem label="VS Code + Copilot">
    **1. Install the MCP extension** for VS Code if not already installed.

    **2. Open settings** (`Ctrl+,`) → search for `MCP Servers`.

    **3. Add to your `settings.json`**:
    ```json
    "github.copilot.mcp.servers": {
      "testforge": {
        "command": "npx",
        "args": ["-y", "testforge"]
      }
    }
    ```

    **4. Reload VS Code**.
  </TabItem>
  <TabItem label="Cline / PearAI">
    Both Cline and PearAI support MCP servers via their settings panel.

    **1. Open MCP Settings** in the extension sidebar.

    **2. Add a new server**:
    - **Name**: `testforge`
    - **Command**: `npx`
    - **Args**: `-y testforge`

    **3. Save and reconnect**.
  </TabItem>
</Tabs>

---

## 🏗️ Step 3: Initialize Your First Project

With TestForge connected, open your AI chat and run:

> *"Initialize a new TestForge project in the current directory. Use chromium as the browser and staging as the environment."*

TestForge will:
1. Create `mcp-config.json` with your settings
2. Scaffold the required directory structure
3. Install any missing npm dependencies

**Expected file tree after init:**

<FileTree>
- features/
  - **example.feature**
- pages/
  - **BasePage.ts**
- step-definitions/
  - **example.steps.ts**
- test-data/
  - **users.staging.json**
- **mcp-config.json**
- **playwright.config.ts**
- **package.json**
- **tsconfig.json**
- mcp-logs/
  - **viewer.html**
</FileTree>

---

## ✔️ Step 4: Confirm Everything Works

Run this exact prompt in your AI chat:

> *"Run the TestForge environment check. Tell me if Playwright, Node.js, and the config are valid."*

The tool `check_playwright_ready` will return a structured health report. A successful result looks like:

```
✅ Node.js: v20.11.0
✅ Playwright: 1.44.0
✅ Browser: chromium installed
✅ mcp-config.json: valid
✅ BASE_URL: reachable (200 OK)
```

If any item shows ❌, proceed to the troubleshooting section below.

---

## 🚧 Troubleshooting

### MCP Connection Issues

| Symptom | Cause | Fix |
| :--- | :--- | :--- |
| No TestForge tools appear in the AI | Config file not saved or wrong path | Verify exact file path; check for JSON syntax errors |
| `command not found: npx` | Node.js not in PATH | Add Node.js to PATH or use the full path: `/usr/local/bin/npx` |
| Tools appear but fail silently | Old TestForge version cached | Run `npm cache clean --force`, then retry |
| `ENOENT` error on startup | Working directory not set | Add `"cwd": "/absolute/path/to/your/project"` to the server config |

### Config File Syntax

The most common reason MCP doesn't connect is a **JSON syntax error** in the config file.

```json
// ❌ WRONG — trailing comma after last item
{
  "mcpServers": {
    "testforge": {
      "command": "npx",
      "args": ["-y", "testforge"],  ← trailing comma
    }
  }
}

// ✅ CORRECT
{
  "mcpServers": {
    "testforge": {
      "command": "npx",
      "args": ["-y", "testforge"]
    }
  }
}
```

Validate your JSON at [jsonlint.com](https://jsonlint.com) if unsure.

### Environment Issues

| Symptom | Cause | Fix |
| :--- | :--- | :--- |
| `baseUrl unreachable` | VPN or firewall blocking localhost | Check `ping` first; try `http://127.0.0.1` instead of `localhost` |
| `tsc: command not found` | TypeScript not installed | Run `npm install --save-dev typescript` in your project |
| `Cannot find module playwright` | Playwright not installed | Run `npx playwright install` |
| `Permission denied` on macOS | File ownership issue | Run `sudo chown -R $(whoami) ~/.npm` |

### Proxy / Corporate Network

If you are behind a corporate proxy:

```json
{
  "mcpServers": {
    "testforge": {
      "command": "npx",
      "args": ["-y", "testforge"],
      "env": {
        "HTTP_PROXY": "http://proxy.company.com:8080",
        "HTTPS_PROXY": "http://proxy.company.com:8080",
        "NO_PROXY": "localhost,127.0.0.1"
      }
    }
  }
}
```

---

## 🧭 Next Steps

<CardGrid>
  <Card title="5-Minute Quickstart" icon="rocket">
    Create and run your first BDD test end-to-end in [5 minutes](/TestForge/repo/user/quickstart/).
  </Card>
  <Card title="Configure Your Project" icon="setting">
    Learn every `mcp-config.json` option in the [Master Config Reference](/TestForge/repo/technical/mcp_config_reference/).
  </Card>
</CardGrid>
