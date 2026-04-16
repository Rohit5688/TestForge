---
title: 🛠️ Setup & Infrastructure
description: Deep dive into the mechanics of configuring TestForge for your environment.
---

import { Steps, Tabs, TabItem, FileTree } from '@astrojs/starlight/components';

Before the magic happens, you need a solid foundation. This guide covers the **Infrastructure Boundaries** and **Security Model** of TestForge.

:::note[The Source of Truth]
This document is the definitive reference for installation, configuration, and security. For feature workflows, see the [Workflows Guide](/TestForge/repo/user/workflows/).
:::

---

## 🏗️ Secure V8 Sandbox Model
TestForge is designed for high-privilege environments (local dev and CI/CD). To protect your system, all reasoning and AST-parsing occur within an **Isolated V8 Sandbox**.

![TestForge Sandbox Security](../../../../assets/sandbox_security_2d.png)

### 1. The Isolation Boundary
The Sandbox has **No Access** to your network or local filesystem by default. It only communicates with the Host via a secure bridge for:
- Writing verified code patches.
- Reading the `mcp-config.json`.
- Sending telemetry logs.

### 2. Infrastructure Parity
TestForge ensures that your scripts run identically on your laptop and on an ephemeral CI worker. 
- **Local**: Runs via the MCP server inside your IDE (Cursor/Claude).
- **CI/CD**: Runs via `npx testforge` in a stateless runner.

---

## ⚙️ Configuration Anatomy
The `mcp-config.json` is the structural brain of your project.

> [!TIP]
> For an exhaustive deep-dive into every property, see the [Master Configuration Reference](/TestForge/repo/technical/mcp_config_reference/).

---

## 🔍 Session Observability & Logs
TestForge automatically captures high-fidelity telemetry for every AI session. This is critical for auditing token usage and debugging complex multi-page flows.

### 1. The Forge Session Viewer
When you first run a TestForge tool in your project, an `mcp-logs/` directory is created. Inside, you will find a **Forge Session Viewer** (`viewer.html`).
- **Zero Install**: The viewer is a standalone HTML file dropped into your project.
- **Deep Audit**: Drag and drop any `.jsonl` session log into the viewer to see exactly what locators the AI extracted, which tools were called, and how many tokens were spent.

### 2. Log Anatomy
- **`mcp-logs/*.jsonl`**: Raw JSON formatted logs of tool inputs, outputs, and durations.
- **Auto-Redaction**: Sensitive data like `process.env` keys and passwords are automatically redacted before being written to disk.

---

```json
{
  "baseUrl": "https://staging.myapp.com",
  "browserName": "chromium",
  "locatorOrder": ["role", "testId", "css", "xpath"],
  "dirs": {
    "features": "test/features",
    "pages": "test/pages",
    "steps": "test/steps"
  }
}
```

---

## 🔐 Environment & Credential Security
Use **Environment Contexts** to switch between staging, UAT, and production without changing a single line of test code.

| Strategy | Recommendation | Security Benefit |
| :--- | :--- | :--- |
| **Local Dev** | `users.staging.json` | Keeps real credentials off developer machines. |
| **CI/CD** | Env Variables | Prevents credential leaks in Git history. |
| **Auth** | `set_credentials` tool | Injects keys only during the session. |

---

:::caution[Security Warning]
Never commit your `users.json` files to Git. TestForge automatically honors `.gitignore` patterns during its project initialization phase.
:::
