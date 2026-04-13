---
title: "🐳 Dockerized TestForge Deployment"
---

The TestForge MCP Server is fully dockerized. Using the official Playwright base image ensures that all browser binaries (Chromium, Firefox, WebKit) and OS-level dependencies are perfectly aligned and ready for execution.

---

## 📄 1. Building the Image

Clone the TestForge repository and build the image locally:

```bash
docker build -t testforge-mcp .
```

> [!NOTE]
> The image is ~1.5GB to 2GB in size as it includes the full Playwright browser suite and the Node.js runtime environment.

---

## 🩹 2. Local Desktop Execution (Stdio)

To analyze and generate code for a project on your local machine using the Dockerized server, you must mount your project as a volume.

### ⚙️ MCP Client Configuration
Add this to your `claude_desktop_config.json` or equivalent:

```json
{
  "mcpServers": {
    "testforge": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "-v",
        "C:/Users/NAME/Projects/my-app:/project",
        "testforge-mcp"
      ]
    }
  }
}
```

*   **`-v`**: Mounts your local project folder to `/project` inside the container.
*   **`projectRoot`**: When calling tools, use `/project` as the root path.

---

## 🩹 3. Cloud / Remote Execution (SSE)

For team-wide or CI/CD deployments, run the container in **Server-Sent Events (SSE)** mode over HTTP.

### 📄 Running the SSE Server
```bash
docker run -p 3000:3000 -d testforge-mcp --port 3000 --host 0.0.0.0
```

### ⚙️ Remote Client Configuration
```json
{
  "mcpServers": {
    "remote-testforge": {
      "type": "sse",
      "url": "https://testforge.yourcompany.com/sse"
    }
  }
}
```

---

## 📄 4. Enterprise AWS Deployment (Fargate)

Deploying to AWS Fargate allows your entire organization to leverage autonomous Playwright testing at scale.

### 📄 Infrastructure Requirements
- **Compute**: Minimum **2vCPU** and **4GB RAM** (Playwright browsers are memory intensive).
- **Persistent Storage**: Mount an **Amazon EFS** volume to `/project` to allow the AI to read/write test files across sessions.
- **Network**: Place within a private VPC and secure behind an Application Load Balancer (ALB) with TLS.

---

## 🐳 5. Dockerized Best Practices

1.  **Artifact Retention**: Mount the `test-results/` folder to your host or a persistent volume to view Playwright Traces and Videos after a run.
2.  **Statelessness**: Treat containers as ephemeral. Destroy the container after major task completion to ensure no cached DOM data or credentials persist.
3.  **Environment Secrets**: Pass `BASE_URL` and other sensitive keys via Docker environment variables (`-e KEY=VALUE`) to keep `.env` files out of the image.