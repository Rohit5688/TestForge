import * as fs from 'fs';
import * as path from 'path';
import { McpConfigService } from './McpConfigService.js';

export interface GodNode {
  file: string;
  absolutePath: string;
  connections: number;
  importedBy: string[];
  warning: string;
  severity: 'high' | 'critical';
}

/**
 * StructuralBrainService — scans import graph, identifies god nodes,
 * and emits warnings when high-connectivity files are being modified.
 *
 * Configuration stored at: .TestForge/structural-brain.json
 */
export class StructuralBrainService {
  private static instance: StructuralBrainService;

  private readonly GOD_NODE_THRESHOLD = 5;
  private readonly CRITICAL_THRESHOLD = 15;

  private projectRoot?: string;
  private readonly mcpConfigService = new McpConfigService();

  private get brainFile(): string {
    return path.join(this.projectRoot || process.cwd(), '.TestForge', 'structural-brain.json');
  }

  private godNodes: GodNode[] = [];
  private lastScanTime: number = 0;
  private readonly SCAN_CACHE_TTL_MS = 5 * 60 * 1000;

  public static getInstance(): StructuralBrainService {
    if (!StructuralBrainService.instance) {
      StructuralBrainService.instance = new StructuralBrainService();
    }
    return StructuralBrainService.instance;
  }

  public async scanProject(projectRoot?: string, srcDir?: string): Promise<GodNode[]> {
    this.projectRoot = projectRoot || process.cwd();

    if (this.godNodes.length > 0 && (Date.now() - this.lastScanTime) < this.SCAN_CACHE_TTL_MS) {
      return this.godNodes;
    }

    const cached = this.loadFromDisk();
    if (cached && cached.length > 0) {
      this.godNodes = cached;
      this.lastScanTime = Date.now();
      return this.godNodes;
    }

    const candidateDirs: string[] = [];
    try {
      const cfg = this.mcpConfigService.read(this.projectRoot);
      const dirs = cfg.dirs || {} as any;
      
      const defaultSrc = path.join(this.projectRoot, 'src');
      if (fs.existsSync(defaultSrc)) candidateDirs.push(defaultSrc);
      
      if (dirs.pages) candidateDirs.push(path.join(this.projectRoot, dirs.pages));
      if (dirs.stepDefinitions) candidateDirs.push(path.join(this.projectRoot, dirs.stepDefinitions));
      if (dirs.testData) candidateDirs.push(path.join(this.projectRoot, dirs.testData));
    } catch {
      candidateDirs.push(path.join(this.projectRoot, srcDir || 'src'));
    }

    const tsFilesSet = new Set<string>();
    for (const d of candidateDirs) {
      if (d && fs.existsSync(d)) {
        const found = this.findTypeScriptFiles(d);
        found.forEach(f => tsFilesSet.add(f));
      }
    }

    const tsFiles = Array.from(tsFilesSet);
    const importGraph = this.buildImportGraph(tsFiles, this.projectRoot);

    this.godNodes = this.identifyGodNodes(importGraph, this.projectRoot);
    this.lastScanTime = Date.now();

    this.saveToDisk(this.godNodes);

    return this.godNodes;
  }

  public getWarning(filePath: string): string | null {
    const absolutePath = path.resolve(filePath);
    const godNode = this.godNodes.find(n => n.absolutePath === absolutePath);
    return godNode?.warning ?? null;
  }

  public getGodNodes(): GodNode[] {
    return [...this.godNodes].sort((a, b) => b.connections - a.connections);
  }

  public formatPreFlightWarning(filePath: string): string {
    const warning = this.getWarning(filePath);
    if (!warning) return '';

    return [
      '─'.repeat(60),
      warning,
      'Proceed with extra care. Test after each change.',
      '─'.repeat(60),
    ].join('\n');
  }

  public invalidateCache(): void {
    this.godNodes = [];
    this.lastScanTime = 0;
    try {
      if (fs.existsSync(this.brainFile)) {
        fs.unlinkSync(this.brainFile);
      }
    } catch { } // non-fatal
  }

  private findTypeScriptFiles(dir: string): string[] {
    const files: string[] = [];

    const walk = (current: string) => {
      try {
        const entries = fs.readdirSync(current, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(current, entry.name);
          if (entry.isDirectory()) {
            if (!['node_modules', 'dist', '.git', 'coverage'].includes(entry.name)) {
              walk(fullPath);
            }
          } else if ((entry.name.endsWith('.ts') || entry.name.endsWith('.js')) && !entry.name.endsWith('.d.ts')) {
            files.push(fullPath);
          }
        }
      } catch { } // skip inaccessible dirs
    };

    walk(dir);
    return files;
  }

  private buildImportGraph(
    tsFiles: string[],
    baseDir: string
  ): Map<string, Set<string>> {
    const importedBy = new Map<string, Set<string>>();

    for (const file of tsFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      const importPattern = /from\s+['"]([^'"]+)['"]/g;
      const requirePattern = /require\(['"]([^'"]+)['"]\)/g;
      
      const processMatch = (importPath: string) => {
        if (importPath.startsWith('.')) {
          const resolved = this.resolveImport(importPath, file);
          if (resolved) {
            if (!importedBy.has(resolved)) {
              importedBy.set(resolved, new Set());
            }
            importedBy.get(resolved)!.add(file);
          }
        }
      };

      let match: RegExpExecArray | null;
      while ((match = importPattern.exec(content)) !== null) {
        if (match[1]) processMatch(match[1]);
      }
      while ((match = requirePattern.exec(content)) !== null) {
        if (match[1]) processMatch(match[1]);
      }
    }

    return importedBy;
  }

  private resolveImport(importPath: string, fromFile: string): string | null {
    const fromDir = path.dirname(fromFile);
    const extensions = ['.ts', '.tsx', '.js', '/index.ts', '/index.js'];

    for (const ext of extensions) {
      const candidate = path.resolve(fromDir, importPath + ext);
      if (fs.existsSync(candidate)) return candidate;
    }
    
    const exact = path.resolve(fromDir, importPath);
    if (fs.existsSync(exact) && !fs.statSync(exact).isDirectory()) return exact;

    return null;
  }

  private identifyGodNodes(
    importGraph: Map<string, Set<string>>,
    baseDir: string
  ): GodNode[] {
    const godNodes: GodNode[] = [];

    for (const [filePath, importers] of importGraph.entries()) {
      if (importers.size >= this.GOD_NODE_THRESHOLD) {
        const relPath = path.relative(baseDir, filePath);
        const severity: GodNode['severity'] =
          importers.size >= this.CRITICAL_THRESHOLD ? 'critical' : 'high';

        const icon = severity === 'critical' ? '🔴' : '🟡';
        const warning = [
          `${icon} GOD NODE WARNING: ${relPath}`,
          `This file has ${importers.size} dependents — changes here affect the entire system.`,
          `Top importers: ${[...importers].slice(0, 3).map(f => path.relative(baseDir, f)).join(', ')}${importers.size > 3 ? ` (+${importers.size - 3} more)` : ''}`,
        ].join('\n');

        godNodes.push({
          file: relPath,
          absolutePath: filePath,
          connections: importers.size,
          importedBy: [...importers].map(f => path.relative(baseDir, f)),
          warning,
          severity,
        });
      }
    }

    return godNodes.sort((a, b) => b.connections - a.connections);
  }

  private loadFromDisk(): GodNode[] | null {
    try {
      if (fs.existsSync(this.brainFile)) {
        const data = JSON.parse(fs.readFileSync(this.brainFile, 'utf-8'));
        if (Array.isArray(data?.godNodes)) return data.godNodes;
      }
    } catch { } // ignore
    return null;
  }

  private saveToDisk(godNodes: GodNode[]): void {
      try {
        const dir = path.dirname(this.brainFile);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(this.brainFile, JSON.stringify({ godNodes, scannedAt: new Date().toISOString() }, null, 2), 'utf-8');
      } catch { } // non-fatal
  }
}
