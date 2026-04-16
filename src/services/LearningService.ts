import fs from 'fs';
import path from 'path';

export interface ILearningRule {
  id: string;
  pattern: string;
  solution: string;
  tags: string[];
  timestamp: string;
  // Optional enrichment fields — existing rules without them still load fine
  rationale?: string;       // Why this solution was chosen over alternatives
  antiPatterns?: string[];  // What NOT to do (rejected approaches)
  linkedFile?: string;      // Relative path of the file/component this rule governs
  scope?: 'global' | 'screen' | 'file'; // How broadly to apply the rule
}

export interface ILearningSchema {
  version: string;
  rules: ILearningRule[];
}

export class LearningService {
  /**
   * Defines the storage location for the autonomous learning brain inside the user's project.
   */
  private getStoragePath(projectRoot: string): string {
    const dir = path.join(projectRoot, '.TestForge');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return path.join(dir, 'mcp-learning.json');
  }

  /**
   * Reads existing knowledge from the project.
   */
  public getKnowledge(projectRoot: string): ILearningSchema {
    const storagePath = this.getStoragePath(projectRoot);
    if (!fs.existsSync(storagePath)) {
      return { version: '1.0.0', rules: [] };
    }
    try {
      return JSON.parse(fs.readFileSync(storagePath, 'utf8'));
    } catch {
      return { version: '1.0.0', rules: [] };
    }
  }

  /**
   * Learns a new pattern and persists it to the project's autonomous knowledge base.
   */
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
  ): ILearningRule {
    const knowledge = this.getKnowledge(projectRoot);

    // Prevent exact duplicates
    const existing = knowledge.rules.find(r => r.pattern === pattern && r.solution === solution);
    if (existing) return existing;

    const newRule: ILearningRule = {
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

    knowledge.rules.push(newRule);
    fs.writeFileSync(this.getStoragePath(projectRoot), JSON.stringify(knowledge, null, 2), 'utf8');

    return newRule;
  }

  /**
   * Generates a system instructions block containing the project's learned rules,
   * injected into generation prompts. Supports tag-based filtering and a recency cap
   * to prevent prompt bloat on mature projects with many rules.
   */
  public getKnowledgePromptInjection(
    projectRoot: string,
    context?: {
      tags?: string[];      // Filter to rules whose tags overlap with these
      screenName?: string;  // Also match rules tagged with this screen name
      toolName?: string;    // Also match rules tagged with this tool name
      maxRules?: number;    // Cap at N rules to prevent prompt bloat (default: 30)
    },
    dynamicDirectives: string[] = []
  ): string {
    const knowledge = this.getKnowledge(projectRoot);
    if (knowledge.rules.length === 0 && dynamicDirectives.length === 0) return '';

    const MAX = context?.maxRules ?? 30;

    // Build the filter tag set from all context signals
    const filterTags = new Set<string>([
      ...(context?.tags ?? []),
      ...(context?.screenName ? [context.screenName.toLowerCase()] : []),
      ...(context?.toolName ? [context.toolName.toLowerCase()] : []),
    ]);

    let selected: ILearningRule[];

    if (filterTags.size === 0) {
      // No context provided — take most recent N rules (recency bias)
      selected = [...knowledge.rules]
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
        .slice(0, MAX);
    } else {
      // Split into tag-matching and non-matching
      const matching = knowledge.rules.filter(r =>
        r.tags.some(t => filterTags.has(t.toLowerCase()))
      );
      const nonMatching = knowledge.rules.filter(r =>
        !r.tags.some(t => filterTags.has(t.toLowerCase()))
      );

      // Always include matching rules; fill remaining slots with recent non-matching
      const matchSlots = Math.min(matching.length, MAX);
      const remainingSlots = MAX - matchSlots;

      const topNonMatching = [...nonMatching]
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
        .slice(0, remainingSlots);

      selected = [...matching.slice(0, matchSlots), ...topNonMatching];
    }

    if (selected.length === 0 && dynamicDirectives.length === 0) return '';

    const skipped = knowledge.rules.length - selected.length;

    let prompt = `\n### 🧠 CUSTOM TEAM KNOWLEDGE & LEARNED FIXES\n`;
    prompt += `IMPORTANT: You MUST adhere to the following learned rules. These are prior human-in-the-loop corrections or team structural standards that override ordinary behavior.\n`;

    if (skipped > 0) {
      prompt += `(Showing ${selected.length} most relevant of ${knowledge.rules.length} total rules)\n`;
    }
    prompt += `\n`;

    selected.forEach((rule, idx) => {
      prompt += `**Rule ${idx + 1}**: When you encounter: "${rule.pattern}"\n`;
      prompt += `-> **Action/Solution**: ${rule.solution}\n`;
      if (rule.rationale) prompt += `-> **Why**: ${rule.rationale}\n`;
      if (rule.antiPatterns?.length) prompt += `-> **Do NOT**: ${rule.antiPatterns.join(' | ')}\n`;
      if (rule.linkedFile) prompt += `-> **Applies to**: \`${rule.linkedFile}\`\n`;
      if (rule.tags.length > 0) prompt += `(Tags: ${rule.tags.join(', ')})\n`;
      prompt += `\n`;
    });

    if (dynamicDirectives.length > 0) {
      prompt += `**Inline Codebase Directives (@mcp-learn)**:\n`;
      dynamicDirectives.forEach(d => { prompt += `- ${d}\n`; });
      prompt += `\n`;
    }

    return prompt;
  }

  /** Deletes a specific rule by ID. Returns true if found and removed. */
  public forget(projectRoot: string, ruleId: string): boolean {
    const knowledge = this.getKnowledge(projectRoot);
    const idx = knowledge.rules.findIndex(r => r.id === ruleId);
    if (idx === -1) return false;
    knowledge.rules.splice(idx, 1);
    fs.writeFileSync(this.getStoragePath(projectRoot), JSON.stringify(knowledge, null, 2), 'utf8');
    return true;
  }

  /**
   * Exports the learning brain as a human-readable Markdown document.
   * Called by the export_team_knowledge tool.
   */
  public exportToMarkdown(projectRoot: string): string {
    const knowledge = this.getKnowledge(projectRoot);

    if (knowledge.rules.length === 0) {
      return '# TestForge MCP — Team Knowledge Base\n\n_No rules learned yet. Use `train_on_example` to add patterns._\n';
    }

    let md = `# TestForge MCP — Team Knowledge Base\n\n`;
    md += `**Version**: ${knowledge.version}\n`;
    md += `**Total Rules**: ${knowledge.rules.length}\n\n`;
    md += `| # | Pattern | Solution | Tags | Learned |\n`;
    md += `|---|---------|----------|------|---------|\n`;

    knowledge.rules.forEach((rule, idx) => {
      md += `| ${idx + 1} | ${rule.pattern} | ${rule.solution} | ${rule.tags.join(', ')} | ${rule.timestamp.split('T')[0]} |\n`;
      if (rule.rationale) {
        md += `| | _Why:_ | ${rule.rationale} | | |\n`;
      }
      if (rule.antiPatterns?.length) {
        md += `| | _Do NOT:_ | ${rule.antiPatterns.join(', ')} | | |\n`;
      }
      if (rule.linkedFile) {
        md += `| | _File:_ | \`${rule.linkedFile}\` | | |\n`;
      }
    });

    return md;
  }
}
