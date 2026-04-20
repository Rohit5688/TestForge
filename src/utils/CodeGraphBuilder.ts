import * as fs from 'fs';
import * as path from 'path';

export class CodeGraphBuilder {
  public static findTypeScriptFiles(dir: string): string[] {
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

  public static buildImportGraph(
    tsFiles: string[],
    baseDir: string
  ): Map<string, Set<string>> {
    const importedBy = new Map<string, Set<string>>();

    for (const file of tsFiles) {
      // Use caching or fallback for reading file
      const content = fs.readFileSync(file, 'utf-8');
      const importPattern = /from\s+['"]([^'"]+)['"]/g;
      const requirePattern = /require\(['"]([^'"]+)['"]\)/g;
      
      const processMatch = (importPath: string) => {
        if (importPath.startsWith('.')) {
          const resolved = CodeGraphBuilder.resolveImport(importPath, file);
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

  public static resolveImport(importPath: string, fromFile: string): string | null {
    const fromDir = path.dirname(fromFile);
    const extensions = ['.ts', '.tsx', '.js', '/index.ts', '/index.js'];

    for (const ext of extensions) {
      const candidate = path.resolve(fromDir, importPath + ext);
      if (fs.existsSync(candidate)) return candidate;
    }
    
    // Check exact path without extension if it's already a js file or directory
    const exact = path.resolve(fromDir, importPath);
    if (fs.existsSync(exact) && !fs.statSync(exact).isDirectory()) return exact;

    return null;
  }
}
