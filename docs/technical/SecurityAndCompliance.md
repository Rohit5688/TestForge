# 🛡️ TestForge Security & Compliance Architecture

TestForge implements a multi-layered security model to protect your source code, credentials, and infrastructure. As a local-first MCP server, it ensures high-sovereignty data handling while providing enterprise-grade regulatory compliance.

---

## 🏗️ 1. Security Architecture Layers

### A. Sandbox & Path Protection
- **Path Traversal Guard**: Every file operation is validated via `path.resolve`. Any attempt to escape the `projectRoot` (e.g., `../../etc/password`) is blocked.
- **V8 Sandbox Execution**: The `execute_sandbox_code` (Turbo Mode) tool runs JavaScript in a strictly isolated, zero-trust context. It blocks `require`, `eval`, and network access, enforcing a 10s execution timeout.

### B. Credential Safety
- **Secret Redaction**: Terminal outputs and log streams pass through a redaction filter that strips JWTs, Bearer tokens, and standard `KEY=VALUE` patterns before they reach the LLM.
- **Source Audit**: Before writing to disk, TestForge scans the suggested code for hardcoded literals. If a password is found, it refuses to write and instructs the AI to use `process.env` instead.
- **The .env Bridge**: The `manage_env` tool allows the AI to *know* which variables exist without ever reading their *values*.

---

## ⚖️ 2. Regulatory Compliance (GDPR, HIPAA, SOC 2)

| Framework | Status | Deployment Model |
| :--- | :--- | :--- |
| **GDPR** | Compliant | No data collection or telemetry exists. Data stays on your local disk. |
| **HIPAA** | Compliant | PHI remains local. Organizations must ensure an Enterprise BAA is in place with their LLM provider. |
| **SOC 2** | Conforming | Operates within your organization's existing internal security boundaries. |
| **PCI-DSS** | Safe | Can be used in segmented CDE environments as no cardholder data is transmitted externally. |

---

## 🤖 3. Shared Responsibility Model

As a developer using TestForge, security is a shared commitment between the tool and your organization.

### TestForge's Responsibility
- Maintaining the **V8 Sandbox** boundary.
- Enforcing **Path Allow-lists** for file writes.
- Sanitizing console outputs for the LLM context.

### Your Organization's Responsibility
- **LLM Privacy**: Using an enterprise-tier LLM API that guarantees **Zero-Data Retention** and **No Model Training** on your data.
- **Credential Storage**: Using secure secret managers (AWS Secrets Manager, HashiCorp Vault) for CI/CD environments instead of raw `.env` files.
- **SCA Monitoring**: Regularly scanning TestForge dependencies via Snyk or Dependabot.

---

## ✅ 4. Enterprise Security Checklist

- [x] **Local Execution**: Tools run behind your organization's firewall.
- [x] **No Telemetry**: Absolutely zero "phone-home" or usage tracking features.
- [x] **Synthetic Data**: Use `generate_test_data_factory` to create mock PII for testing, avoiding the use of real production data.
- [x] **Audit Logs**: All tool calls are logged locally for internal security audits.
