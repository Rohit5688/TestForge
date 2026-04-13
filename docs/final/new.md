# Implementation Plan: Three Self-Contained Improvements

> These three changes address the only genuine gaps identified in the Repowise/MemPalace/Multica
> analysis — without adding any external dependencies. Each is self-contained, can be done in
> a single session, and applies to both AppForge and TestForge unless noted.

---

## Change 1 — Decision-Tracking Rationale in LearningService

### What the problem actually is

`LearningRule` currently stores `pattern → solution`. There is no field for _why_ the solution
was chosen, what was tried and rejected, or which file/component the rule applies to.

When an agent encounters a healed selector 6 months later and tries to "improve" it, there is
nothing telling it: _"XPath is required here because React Native generates no testIDs for this
container."_ The agent re-breaks what a human previously fixed.

This is the one real gap the Repowise `get_why` analysis identified.

### Scope

**Files changed:**

- `src/services/LearningService.ts` — expand interface, update `learn()`, update injection
- `src/tools/train_on_example.ts` — add optional input fields for new data
- `src/tools/export_team_knowledge.ts` — add rationale column to Markdown export

**Applies to:** Both AppForge and TestForge (identical change, different storage paths)

---

### Exact changes

#### Step 1 — Expand `LearningRule` interface

**AppForge** `src/services/LearningService.ts`  
**TestForge** `src/services/LearningService.ts` (same change, `ILearningRule` → `LearningRule`)

Replace the existing interface:

```ts
// BEFORE
export interface LearningRule {
  id: string;
  pattern: string;
  solution: string;
  tags: string[];
  timestamp: string;
}
```

With:

```ts
// AFTER
export interface LearningRule {
  id: string;
  pattern: string;
  solution: string;
  tags: string[];
  timestamp: string;

  // New optional fields — existing rules without them still load fine
  rationale?: string; // Why this solution was chosen over alternatives
  antiPatterns?: string[]; // What NOT to do (rejected approaches)
  linkedFile?: string; // Relative path of the file/component this rule governs
  scope?: "global" | "screen" | "file"; // How broadly to apply the rule
}
```

> All new fields are optional. Existing `mcp-learning.json` files load without migration.

---

#### Step 2 — Update `learn()` to accept new fields

```ts
// BEFORE signature
public learn(
  projectRoot: string,
  pattern: string,
  solution: string,
  tags: string[] = []
): LearningRule

// AFTER signature
public learn(
  projectRoot: string,
  pattern: string,
  solution: string,
  tags: string[] = [],
  extras?: {
    rationale?: string;
    antiPatterns?: string[];
    linkedFile?: string;
    scope?: 'global' | 'screen' | 'file';
  }
): LearningRule
```

Inside `learn()`, add the new fields when building `newRule`:

```ts
const newRule: LearningRule = {
  id: `rule-${Date.now()}`,
  pattern,
  solution,
  tags,
  timestamp: new Date().toISOString(),
  // Spread extras only if provided — keeps JSON clean for rules without them
  ...(extras?.rationale && { rationale: extras.rationale }),
  ...(extras?.antiPatterns && { antiPatterns: extras.antiPatterns }),
  ...(extras?.linkedFile && { linkedFile: extras.linkedFile }),
  ...(extras?.scope && { scope: extras.scope }),
};
```

---

#### Step 3 — Update `getKnowledgePromptInjection()` to inject rationale and anti-patterns

This is the part that actually makes the change useful. Replace the injection loop:

```ts
// BEFORE — only injects pattern and solution
knowledge.rules.forEach((rule, idx) => {
  prompt += `**Rule ${idx + 1}**: When you encounter: "${rule.pattern}"\n`;
  prompt += `-> **Action/Solution**: ${rule.solution}\n`;
  if (rule.tags.length > 0) prompt += `(Tags: ${rule.tags.join(", ")})\n`;
  prompt += `\n`;
});
```

```ts
// AFTER — also injects rationale, anti-patterns, and file scope
knowledge.rules.forEach((rule, idx) => {
  prompt += `**Rule ${idx + 1}**: When you encounter: "${rule.pattern}"\n`;
  prompt += `-> **Action/Solution**: ${rule.solution}\n`;

  if (rule.rationale) {
    prompt += `-> **Why**: ${rule.rationale}\n`;
  }
  if (rule.antiPatterns && rule.antiPatterns.length > 0) {
    prompt += `-> **Do NOT**: ${rule.antiPatterns.join(" | ")}\n`;
  }
  if (rule.linkedFile) {
    prompt += `-> **Applies to file**: \`${rule.linkedFile}\`\n`;
  }
  if (rule.tags.length > 0) {
    prompt += `(Tags: ${rule.tags.join(", ")})\n`;
  }
  prompt += `\n`;
});
```

---

#### Step 4 — Update `train_on_example` tool to accept new fields

**AppForge** `src/tools/train_on_example.ts`

```ts
// BEFORE inputSchema
inputSchema: z.object({
  projectRoot: z.string(),
  issuePattern: z.string(),
  solution: z.string(),
  tags: z.array(z.string()).optional(),
});

// AFTER inputSchema
inputSchema: z.object({
  projectRoot: z.string(),
  issuePattern: z.string(),
  solution: z.string(),
  tags: z.array(z.string()).optional(),
  rationale: z
    .string()
    .optional()
    .describe(
      'Why this solution was chosen — prevents future agents from "fixing" this back',
    ),
  antiPatterns: z
    .array(z.string())
    .optional()
    .describe(
      'Approaches that were tried and rejected — e.g. ["do not use XPath here"]',
    ),
  linkedFile: z
    .string()
    .optional()
    .describe(
      'Relative path of the file this rule governs, e.g. "pages/LoginPage.ts"',
    ),
  scope: z
    .enum(["global", "screen", "file"])
    .optional()
    .describe(
      "How broadly to apply: global=always, screen=matching screen name, file=only linked file",
    ),
});
```

Update the handler:

```ts
// BEFORE
const rule = learningService.learn(
  args.projectRoot,
  args.issuePattern,
  args.solution,
  args.tags ?? [],
);

// AFTER
const rule = learningService.learn(
  args.projectRoot,
  args.issuePattern,
  args.solution,
  args.tags ?? [],
  {
    rationale: args.rationale,
    antiPatterns: args.antiPatterns,
    linkedFile: args.linkedFile,
    scope: args.scope,
  },
);
```

---

#### Step 5 — Update `exportToMarkdown()` to show new fields

Add rationale and anti-patterns as extra rows below each rule in the table:

```ts
knowledge.rules.forEach((rule, idx) => {
  md += `| ${idx + 1} | ${rule.pattern} | ${rule.solution} | ${rule.tags.join(", ")} | ${rule.timestamp.split("T")[0]} |\n`;

  // Append extra detail rows if present
  if (rule.rationale) {
    md += `| | _Why:_ | ${rule.rationale} | | |\n`;
  }
  if (rule.antiPatterns?.length) {
    md += `| | _Do NOT:_ | ${rule.antiPatterns.join(", ")} | | |\n`;
  }
  if (rule.linkedFile) {
    md += `| | _File:_ | \`${rule.linkedFile}\` | | |\n`;
  }
});
```

---

### Verification

```bash
# After changes, build must pass
npm run build

# Manual test: add a rule with full rationale
# Call train_on_example with:
#   issuePattern: "Login button not found"
#   solution:     "Use ~login_btn accessibility ID"
#   rationale:    "React Native generates no testIDs for this container"
#   antiPatterns: ["do not use XPath //android.widget.Button[1]"]
#   linkedFile:   "pages/LoginPage.ts"

# Then call generate_cucumber_pom — the prompt injection should include the Why and Do NOT lines
# Check the prompt block in the ObservabilityService JSONL log to confirm
```

**Done criteria:**

- [ ] `npm run build` passes in AppForge
- [ ] `npm run build` passes in TestForge
- [ ] `train_on_example` accepts `rationale`, `antiPatterns`, `linkedFile`, `scope`
- [ ] `getKnowledgePromptInjection` outputs Why and Do NOT blocks when present
- [ ] Existing `mcp-learning.json` files load without error (backward compatible)
- [ ] `export_team_knowledge` Markdown shows rationale rows

---

---

## Change 2 — Tag-Filtered Rule Injection

### What the problem actually is

`getKnowledgePromptInjection` injects **all rules every time**, regardless of which tool is
calling it or what screen/context is active. With 10 rules this is fine. With 80+ rules (which
accumulates quickly on a team project), it floods every prompt with rules that are irrelevant
to the current task.

The `tags` field already exists on every `LearningRule`. It is stored but never used for
filtering. That is the only thing to fix.

### Scope

**Files changed:**

- `src/services/LearningService.ts` — add context parameter to `getKnowledgePromptInjection`
- Call sites (2 in AppForge, 3 in TestForge) — pass context at each call

**No schema changes.** Tags already exist. No migration needed.

---

### Exact changes

#### Step 1 — Add context parameter to `getKnowledgePromptInjection`

```ts
// BEFORE signature
public getKnowledgePromptInjection(projectRoot: string): string

// AFTER signature
public getKnowledgePromptInjection(
  projectRoot: string,
  context?: {
    tags?: string[];        // Filter to rules whose tags overlap with these
    screenName?: string;    // Also match rules tagged with this screen name
    toolName?: string;      // Also match rules tagged with this tool name
    maxRules?: number;      // Cap at N rules to prevent prompt bloat (default: 30)
  },
  dynamicDirectives: string[] = []  // TestForge already has this param — keep it
): string
```

#### Step 2 — Replace the injection loop with filtered retrieval

```ts
public getKnowledgePromptInjection(
  projectRoot: string,
  context?: { tags?: string[]; screenName?: string; toolName?: string; maxRules?: number },
  dynamicDirectives: string[] = []
): string {
  const knowledge = this.getKnowledge(projectRoot);
  if (knowledge.rules.length === 0 && dynamicDirectives.length === 0) return '';

  const MAX = context?.maxRules ?? 30;

  // Build the filter tag set from all context signals
  const filterTags = new Set<string>([
    ...(context?.tags ?? []),
    ...(context?.screenName ? [context.screenName.toLowerCase()] : []),
    ...(context?.toolName   ? [context.toolName.toLowerCase()]   : []),
  ]);

  // Select rules: if no filter tags, take all (capped). If filter tags, prefer matches.
  let selected: LearningRule[];

  if (filterTags.size === 0) {
    // No context provided — take most recent N rules (recency bias)
    selected = [...knowledge.rules]
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, MAX);
  } else {
    // Split into matching and non-matching
    const matching    = knowledge.rules.filter(r =>
      r.tags.some(t => filterTags.has(t.toLowerCase()))
    );
    const nonMatching = knowledge.rules.filter(r =>
      !r.tags.some(t => filterTags.has(t.toLowerCase()))
    );

    // Always include matching rules; fill remaining slots with recent non-matching
    const matchSlots    = Math.min(matching.length, MAX);
    const remainingSlots = MAX - matchSlots;

    const topNonMatching = [...nonMatching]
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, remainingSlots);

    selected = [...matching.slice(0, matchSlots), ...topNonMatching];
  }

  if (selected.length === 0 && dynamicDirectives.length === 0) return '';

  const skipped = knowledge.rules.length - selected.length;

  let prompt = `\n### 🧠 CUSTOM TEAM KNOWLEDGE & LEARNED FIXES\n`;
  prompt += `IMPORTANT: You MUST adhere to the following learned rules. These are prior human-in-the-loop corrections that OVERRIDE ordinary behavior.\n`;

  if (skipped > 0) {
    prompt += `(Showing ${selected.length} most relevant of ${knowledge.rules.length} total rules)\n`;
  }
  prompt += `\n`;

  selected.forEach((rule, idx) => {
    prompt += `**Rule ${idx + 1}**: When you encounter: "${rule.pattern}"\n`;
    prompt += `-> **Action/Solution**: ${rule.solution}\n`;
    if (rule.rationale)                  prompt += `-> **Why**: ${rule.rationale}\n`;
    if (rule.antiPatterns?.length)       prompt += `-> **Do NOT**: ${rule.antiPatterns.join(' | ')}\n`;
    if (rule.linkedFile)                 prompt += `-> **Applies to**: \`${rule.linkedFile}\`\n`;
    if (rule.tags.length > 0)            prompt += `(Tags: ${rule.tags.join(', ')})\n`;
    prompt += `\n`;
  });

  // TestForge inline directives
  if (dynamicDirectives.length > 0) {
    prompt += `**Inline Codebase Directives (@mcp-learn)**:\n`;
    dynamicDirectives.forEach(d => { prompt += `- ${d}\n`; });
    prompt += `\n`;
  }

  return prompt;
}
```

---

#### Step 3 — Update call sites to pass context

**AppForge** — `src/tools/generate_cucumber_pom.ts`

```ts
// BEFORE
const learningPrompt = learningService.getKnowledgePromptInjection(
  args.projectRoot,
);

// AFTER — pass testName as screen context, tool name for tool-specific rules
const learningPrompt = learningService.getKnowledgePromptInjection(
  args.projectRoot,
  {
    screenName: args.testName, // e.g. "LoginScreen" — matches rules tagged "loginscreen"
    toolName: "generate_cucumber_pom", // matches rules tagged "generate" or "generation"
  },
);
```

**AppForge** — `src/tools/self_heal_test.ts`

```ts
// BEFORE
const learningPrompt = learningService.getKnowledgePromptInjection(projectRoot);

// AFTER
const learningPrompt = learningService.getKnowledgePromptInjection(
  projectRoot,
  { toolName: "self_heal_test" },
);
```

**TestForge** — `src/index.ts` (3 call sites, lines ~632, ~689, ~987)

```ts
// BEFORE (line ~632 — generate flow)
const memoryPrompt = learningService.getKnowledgePromptInjection(
  projectRoot,
  lastAnalysisResult.mcpLearnDirectives,
);

// AFTER
const memoryPrompt = learningService.getKnowledgePromptInjection(
  projectRoot,
  { screenName: currentScreenName, toolName: "generate_cucumber_pom" },
  lastAnalysisResult.mcpLearnDirectives,
);

// BEFORE (line ~987 — migration flow)
const memoryPrompt = learningService.getKnowledgePromptInjection(
  projectRoot,
  codebaseContext.mcpLearnDirectives,
);

// AFTER
const memoryPrompt = learningService.getKnowledgePromptInjection(
  projectRoot,
  { toolName: "migrate_test" },
  codebaseContext.mcpLearnDirectives,
);
```

---

### Verification

```bash
npm run build  # both repos

# Functional test:
# 1. Add 5 rules tagged ["login", "android"]
# 2. Add 5 rules tagged ["settings", "ios"]
# 3. Call generate_cucumber_pom with testName="LoginScreen"
# 4. Check JSONL log — prompt should contain login-tagged rules, not settings rules
# 5. Add 40 rules total — confirm prompt never exceeds 30 rules injected
```

**Done criteria:**

- [ ] `npm run build` passes in both repos
- [ ] Rules with matching tags appear first in injection
- [ ] Rules are capped at 30 by default
- [ ] `(Showing N of M total rules)` line appears when rules are filtered
- [ ] Passing no context still works (injects most recent 30, unchanged behaviour for callers that don't pass context yet)
- [ ] All 3 TestForge call sites updated, both AppForge call sites updated

---

---

## Change 3 — Local JSONL Log Viewer

### What the problem actually is

`ObservabilityService` already writes structured JSONL to `mcp-logs/YYYY-MM-DD.jsonl`. Every
tool call, duration, success/failure, and error is captured there. But reading it requires
`cat`-ing a file full of JSON blobs in a terminal.

The Multica "dashboard" proposal would give visibility into what the agent is doing. This
single HTML file gives 90% of that value with zero external dependency and zero maintenance.

### Scope

**New file only:** `mcp-logs/viewer.html`  
Generated once. Opens in any browser. Reads the JSONL files from the same directory.
**No changes to any TypeScript source files.**

---

### Exact implementation

Create `mcp-logs/viewer.html` (or add a script to AppForge/TestForge that generates it):

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Forge Session Viewer</title>
    <style>
      * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }
      body {
        font-family: system-ui, sans-serif;
        background: #f5f5f0;
        color: #1a1a1a;
      }
      header {
        background: #1a1a1a;
        color: #fff;
        padding: 1rem 1.5rem;
        display: flex;
        align-items: center;
        gap: 1rem;
      }
      header h1 {
        font-size: 1rem;
        font-weight: 500;
      }
      header span {
        font-size: 0.8rem;
        color: #888;
        margin-left: auto;
      }
      #drop-zone {
        border: 2px dashed #ccc;
        border-radius: 8px;
        padding: 3rem;
        text-align: center;
        margin: 2rem;
        cursor: pointer;
        background: #fff;
        color: #666;
      }
      #drop-zone.over {
        border-color: #378add;
        background: #e6f1fb;
      }
      #stats {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 1rem;
        padding: 0 2rem 1rem;
      }
      .stat {
        background: #fff;
        border-radius: 8px;
        padding: 1rem;
        border: 0.5px solid #ddd;
      }
      .stat-label {
        font-size: 0.75rem;
        color: #888;
        margin-bottom: 0.25rem;
      }
      .stat-value {
        font-size: 1.5rem;
        font-weight: 500;
      }
      .stat-value.ok {
        color: #3b6d11;
      }
      .stat-value.err {
        color: #a32d2d;
      }
      #timeline {
        padding: 0 2rem 2rem;
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
      }
      .event {
        background: #fff;
        border-radius: 6px;
        border: 0.5px solid #e0e0e0;
        padding: 0.6rem 1rem;
        display: grid;
        grid-template-columns: 80px 180px 1fr 70px 80px;
        gap: 0.75rem;
        align-items: center;
        font-size: 0.82rem;
      }
      .event.error {
        border-left: 3px solid #e24b4a;
      }
      .event.success {
        border-left: 3px solid #639922;
      }
      .event.start {
        border-left: 3px solid #378add;
        opacity: 0.6;
      }
      .event.warning {
        border-left: 3px solid #ef9f27;
      }
      .trace {
        font-family: monospace;
        font-size: 0.72rem;
        color: #888;
      }
      .time {
        color: #888;
        font-size: 0.72rem;
      }
      .tool {
        font-weight: 500;
      }
      .dur {
        text-align: right;
        color: #888;
        font-size: 0.72rem;
      }
      .badge {
        font-size: 0.7rem;
        padding: 2px 8px;
        border-radius: 20px;
        font-weight: 500;
        text-align: center;
      }
      .badge.ok {
        background: #eaf3de;
        color: #3b6d11;
      }
      .badge.err {
        background: #fcebeb;
        color: #a32d2d;
      }
      .badge.run {
        background: #e6f1fb;
        color: #185fa5;
      }
      .badge.wrn {
        background: #faeeda;
        color: #854f0b;
      }
      #filter-bar {
        padding: 0.75rem 2rem;
        display: flex;
        gap: 0.75rem;
        align-items: center;
      }
      #filter-bar input {
        flex: 1;
        padding: 0.4rem 0.75rem;
        border: 0.5px solid #ccc;
        border-radius: 6px;
        font-size: 0.85rem;
      }
      #filter-bar select {
        padding: 0.4rem 0.75rem;
        border: 0.5px solid #ccc;
        border-radius: 6px;
        font-size: 0.85rem;
      }
      .empty {
        text-align: center;
        color: #888;
        padding: 3rem;
        font-size: 0.9rem;
      }
      details summary {
        cursor: pointer;
      }
      .detail-row {
        grid-column: 1 / -1;
        background: #f8f8f6;
        border-radius: 4px;
        padding: 0.5rem 0.75rem;
        font-family: monospace;
        font-size: 0.75rem;
        color: #444;
        white-space: pre-wrap;
        word-break: break-all;
      }
    </style>
  </head>
  <body>
    <header>
      <h1>Forge Session Viewer</h1>
      <span id="file-label">No file loaded</span>
    </header>

    <div id="drop-zone" id="dz">
      Drop a <code>mcp-logs/*.jsonl</code> file here, or click to browse
      <br /><br />
      <input
        type="file"
        id="file-input"
        accept=".jsonl,.json"
        style="display:none"
      />
      <button
        onclick="document.getElementById('file-input').click()"
        style="margin-top:0.5rem;padding:0.4rem 1rem;border-radius:6px;
                 border:0.5px solid #ccc;cursor:pointer;background:#fff"
      >
        Browse
      </button>
    </div>

    <div id="stats" style="display:none">
      <div class="stat">
        <div class="stat-label">Total tool calls</div>
        <div class="stat-value" id="s-total">0</div>
      </div>
      <div class="stat">
        <div class="stat-label">Successful</div>
        <div class="stat-value ok" id="s-ok">0</div>
      </div>
      <div class="stat">
        <div class="stat-label">Errors</div>
        <div class="stat-value err" id="s-err">0</div>
      </div>
      <div class="stat">
        <div class="stat-label">Avg duration</div>
        <div class="stat-value" id="s-avg">—</div>
      </div>
    </div>

    <div id="filter-bar" style="display:none">
      <input
        type="text"
        id="search"
        placeholder="Filter by tool name or trace ID…"
      />
      <select id="type-filter">
        <option value="">All events</option>
        <option value="tool_end">Completed calls</option>
        <option value="tool_error">Errors only</option>
        <option value="healing">Healing events</option>
      </select>
    </div>

    <div id="timeline"></div>

    <script>
      let allEvents = [];

      const dz = document.getElementById("drop-zone");
      dz.addEventListener("dragover", (e) => {
        e.preventDefault();
        dz.classList.add("over");
      });
      dz.addEventListener("dragleave", () => dz.classList.remove("over"));
      dz.addEventListener("drop", (e) => {
        e.preventDefault();
        dz.classList.remove("over");
        loadFile(e.dataTransfer.files[0]);
      });
      document.getElementById("file-input").addEventListener("change", (e) => {
        if (e.target.files[0]) loadFile(e.target.files[0]);
      });
      document.getElementById("search").addEventListener("input", render);
      document.getElementById("type-filter").addEventListener("change", render);

      function loadFile(file) {
        document.getElementById("file-label").textContent = file.name;
        const reader = new FileReader();
        reader.onload = (e) => {
          allEvents = e.target.result
            .split("\n")
            .filter((l) => l.trim())
            .map((l) => {
              try {
                return JSON.parse(l);
              } catch {
                return null;
              }
            })
            .filter(Boolean);
          document.getElementById("drop-zone").style.display = "none";
          document.getElementById("stats").style.display = "grid";
          document.getElementById("filter-bar").style.display = "flex";
          updateStats();
          render();
        };
        reader.readAsText(file);
      }

      function updateStats() {
        const ends = allEvents.filter((e) => e.type === "tool_end");
        const errors = allEvents.filter((e) => e.type === "tool_error");
        const ok = ends.filter((e) => e.success);
        const avgMs = ends.length
          ? Math.round(
              ends.reduce((s, e) => s + (e.durationMs || 0), 0) / ends.length,
            )
          : 0;
        document.getElementById("s-total").textContent =
          ends.length + errors.length;
        document.getElementById("s-ok").textContent = ok.length;
        document.getElementById("s-err").textContent = errors.length;
        document.getElementById("s-avg").textContent = avgMs
          ? avgMs + "ms"
          : "—";
      }

      function render() {
        const search = document.getElementById("search").value.toLowerCase();
        const type = document.getElementById("type-filter").value;

        let events = allEvents.filter((e) => {
          if (type === "tool_end" && e.type !== "tool_end") return false;
          if (type === "tool_error" && e.type !== "tool_error") return false;
          if (type === "healing" && !e.type?.includes("heal")) return false;
          if (
            search &&
            !e.tool?.toLowerCase().includes(search) &&
            !e.traceId?.toLowerCase().includes(search)
          )
            return false;
          return true;
        });

        const tl = document.getElementById("timeline");
        if (events.length === 0) {
          tl.innerHTML =
            '<div class="empty">No events match the current filter.</div>';
          return;
        }

        tl.innerHTML = events
          .map((ev) => {
            const time = ev.timestamp
              ? new Date(ev.timestamp).toLocaleTimeString()
              : "—";
            const trace = ev.traceId?.slice(0, 8) ?? "—";
            const tool = ev.tool ?? ev.type ?? "—";
            const dur = ev.durationMs != null ? ev.durationMs + "ms" : "";
            let cls = "event start",
              badge = `<span class="badge run">running</span>`;
            let detail = "";

            if (ev.type === "tool_end") {
              cls = ev.success ? "event success" : "event error";
              badge = ev.success
                ? `<span class="badge ok">ok</span>`
                : `<span class="badge err">failed</span>`;
              if (ev.outputSummary)
                detail = JSON.stringify(ev.outputSummary, null, 2);
            } else if (ev.type === "tool_error") {
              cls = "event error";
              badge = `<span class="badge err">error</span>`;
              detail = ev.errorMessage ?? "";
            } else if (ev.type === "warning") {
              cls = "event warning";
              badge = `<span class="badge wrn">warning</span>`;
              detail = ev.message ?? "";
            }

            const detailHtml = detail
              ? `<details><summary style="font-size:0.72rem;color:#888">details</summary>
           <div class="detail-row">${detail.replace(/</g, "&lt;")}</div>
         </details>`
              : "";

            return `<div class="${cls}">
      <span class="time">${time}</span>
      <span class="trace">${trace}</span>
      <span class="tool">${tool}${detailHtml}</span>
      <span class="dur">${dur}</span>
      ${badge}
    </div>`;
          })
          .join("");
      }
    </script>
  </body>
</html>
```

---

### How to use it

```
1. Open AppForge/mcp-logs/ or TestForge/mcp-logs/ in your file explorer
2. Open viewer.html in any browser (double-click, no server needed)
3. Drag a .jsonl file from the same folder onto the drop zone
4. See all tool calls, durations, errors, and healing events in a timeline
```

The viewer is fully offline. No npm, no server, no build step. Drop the file in `mcp-logs/`
once and it is there for every session.

---

### Optional: auto-generate viewer alongside the log directory

Add to `ObservabilityService` constructor, after `this.ensureLogDirectory()`:

```ts
private ensureViewer(): void {
  const viewerPath = path.join(this.logDir, 'viewer.html');
  if (!fs.existsSync(viewerPath)) {
    // Write the viewer HTML — contents of the file above
    fs.writeFileSync(viewerPath, VIEWER_HTML, 'utf8');
  }
}

// At bottom of file, outside the class:
const VIEWER_HTML = `<!DOCTYPE html>...`; // paste full HTML here
```

This means the viewer is created automatically the first time any tool runs. You never need
to remember to copy it manually.

---

### Verification

```bash
# 1. Run any AppForge or TestForge session (a few tool calls)
# 2. Open mcp-logs/ in file explorer
# 3. Open viewer.html in browser
# 4. Drag today's .jsonl file onto the drop zone
# 5. Confirm timeline shows tool calls with durations and status badges
# 6. Use search box to filter to a specific tool (e.g. "generate_cucumber_pom")
# 7. Click a row's "details" to see the output summary JSON
```

**Done criteria:**

- [ ] `viewer.html` exists in `mcp-logs/` (or auto-generated by ObservabilityService)
- [ ] Drag-and-drop of `.jsonl` file loads and renders events
- [ ] Stats bar shows total calls, successes, errors, average duration
- [ ] Search filters by tool name and trace ID
- [ ] Error events show red left border and error message in details
- [ ] No external scripts, no server, no build step required

---

---

## Summary

| Change                     | Files touched                                                                       | Effort   | Dependency added |
| -------------------------- | ----------------------------------------------------------------------------------- | -------- | ---------------- |
| 1 — Decision tracking      | `LearningService.ts` × 2, `train_on_example.ts` × 2, `export_team_knowledge.ts` × 2 | ~3 hours | None             |
| 2 — Tag-filtered injection | `LearningService.ts` × 2, 5 call sites                                              | ~2 hours | None             |
| 3 — Log viewer             | `mcp-logs/viewer.html` (new file)                                                   | ~1 hour  | None             |

Do them in order. Change 2 builds directly on the `rationale`/`antiPatterns` fields added in
Change 1 (the injection loop is the same function). Change 3 is fully independent.

Total: one focused day. No new dependencies. No external services. Everything stays local.
