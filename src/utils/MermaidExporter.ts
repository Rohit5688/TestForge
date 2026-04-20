import * as fs from 'fs';
import * as path from 'path';
import type { NavGraph } from '../services/nav/NavigationGraphService.js';

export class MermaidExporter {
  public static exportMermaidDiagram(graph: NavGraph, mapPath: string): string {
    const nodes = Object.values(graph.nodes);
    const mdPath = path.join(path.dirname(mapPath), 'nav-graph.md');

    if (nodes.length === 0) {
      const fallback = '```mermaid\ngraph TD\n  A["No navigation data yet — run discover_app_flow"]\n```';
      MermaidExporter.writeMd(mdPath, fallback);
      return fallback;
    }

    const sanitize = (s: string) =>
      s.replace(/[^a-zA-Z0-9]/g, '_').replace(/^_+|_+$/g, '').slice(0, 30) || 'unknown';

    const lines: string[] = ['```mermaid', 'graph TD'];
    const emittedNodes = new Set<string>();

    for (const node of nodes) {
      const fromId = sanitize(node.pageName || node.url);
      if (!emittedNodes.has(fromId)) {
        lines.push(`  ${fromId}["${node.pageName}"]`);
        emittedNodes.add(fromId);
      }

      for (const edge of node.outgoing) {
        if (edge.targetUrl === '?') continue; // Unknown targets omitted
        const toNode = graph.nodes[edge.targetUrl];
        const toId = sanitize(toNode?.pageName || edge.targetUrl);
        if (!emittedNodes.has(toId)) {
          lines.push(`  ${toId}["${toNode?.pageName || edge.targetUrl}"]`);
          emittedNodes.add(toId);
        }
        const conf = Math.round(edge.confidence * 100);
        const edgeLabel = edge.label.slice(0, 25).replace(/"/g, "'");
        lines.push(`  ${fromId} -->|"${edgeLabel} (${conf}%)"| ${toId}`);
      }
    }

    lines.push('```');
    const diagram = lines.join('\n');
    MermaidExporter.writeMd(mdPath, diagram);
    return diagram;
  }

  public static getKnownPathsText(graph: NavGraph): string {
    const nodes = Object.values(graph.nodes);
    if (nodes.length === 0) return '';

    const lines: string[] = [
      `--- Known Navigation Paths (${nodes.length} page${nodes.length !== 1 ? 's' : ''}, source: ${graph.source}) ---`,
    ];

    for (const node of nodes) {
      const confirmed = node.outgoing.filter((e) => e.targetUrl !== '?' && e.confidence >= 0.6);
      if (confirmed.length > 0) {
        lines.push(`${node.pageName} (${node.url})`);
        for (const e of confirmed.slice(0, 5)) {
          const target = graph.nodes[e.targetUrl];
          lines.push(`  → ${target?.pageName || e.targetUrl} via \`${e.triggerSelector}\``);
        }
      } else {
        lines.push(`${node.pageName} (${node.url})`);
      }
    }

    return lines.join('\n');
  }

  private static writeMd(mdPath: string, content: string): void {
    try {
      const dir = path.dirname(mdPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(mdPath, content);
    } catch {
      // Non-fatal
    }
  }
}
