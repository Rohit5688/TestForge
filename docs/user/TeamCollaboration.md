# 🤝 Team Collaboration & Continuous Learning

TestForge features a **Persistent Learning Loop** that allows it to evolve alongside your engineering team. It doesn't just "reset" every session; it captures tribal knowledge and architectural preferences to become smarter over time.

---

## 🧠 1. The Autonomous Learning Loop

TestForge uses a localized knowledge base (`.TestForge/mcp-learning.json`) to store project-specific rules. These rules are injected into every test generation prompt.

### Method A: `train_on_example` (Direct Feedback)
If the AI generates code that doesn't follow your team's style, you can correct it and "teach" the fix.
> **Prompt**: *"I fixed the login Page Object you generated. Use `train_on_example` to store this pattern: 'Always use data-test-id for primary buttons' so you don't use raw text again."*

### Method B: `@mcp-learn` (The "Rule Zero" Protocol)
Developers can leave "Rule Zeros" directly in the codebase. These are human-readable instructions that the AI discovers during every `analyze_codebase` run.

**Example Page Object Comment**:
```typescript
// @mcp-learn: For all tables, always use the .loading-overlay check before clicking rows
export class DashboardPage extends BasePage { ... }
```
The AI will automatically extract this and apply it whenever it generates a test interacting with a table.

---

## 📋 2. Knowledge Visibility

### `export_team_knowledge`
As the AI learns, the JSON brain grows. This tool converts that raw data into a human-readable **Rule Registry**.
- **Action**: Run this tool to generate `docs/user/TeamCollaboration.md` (Self-updating section below).
- **Utility**: Use this to onboard new human developers! It shows exactly which patterns the AI is being taught to follow.

---

## 🧠 3. Current Learned Rules (Registry)

This section is auto-populated during `export_team_knowledge` calls.

| Rule ID | Pattern / Trigger | Optimized Solution |
| :--- | :--- | :--- |
| *No rules learned yet.* | *Add rules via @mcp-learn comments or train_on_example.* | *N/A* |

---

## 🛠️ 4. Collaboration Workflow

1. **Review Diffs**: Always use `validate_and_write(dryRun: true)` before committing AI code.
2. **Commit Knowledge**: Commit the `.TestForge/mcp-learning.json` file to your Git repository. This ensures the *entire team's* AI assistants share the same project memory.
3. **Peer Review**: Use the exported knowledge doc during PR reviews to ensure common automation patterns are being enforced.
