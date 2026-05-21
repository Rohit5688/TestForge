import * as fs from 'fs';
import * as path from 'path';

export class TsConfigManager {
  public static addPathMapping(projectRoot: string, dir: string) {
    const tsconfigPath = path.join(projectRoot, 'tsconfig.json');
    if (!fs.existsSync(tsconfigPath)) return;
    
    try {
      const content = fs.readFileSync(tsconfigPath, 'utf8');
      const tsconfig = JSON.parse(content);
      
      let changed = false;
      if (!tsconfig.compilerOptions) tsconfig.compilerOptions = {};
      if (!tsconfig.compilerOptions.paths) tsconfig.compilerOptions.paths = {};
      if (tsconfig.compilerOptions.baseUrl == null) {
        tsconfig.compilerOptions.baseUrl = '.';
        changed = true;
      }
      
      const parts = dir.split(/[/\\]/);
      const topDir = parts[0];
      const key = `${topDir}/*`;
      
      if (!tsconfig.compilerOptions.paths[key]) {
        tsconfig.compilerOptions.paths[key] = [`${topDir}/*`];
        changed = true;
      }
      
      if (changed) {
        fs.writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2), 'utf8');
      }
    } catch {
       // Ignore parsing errors or format conflicts. Handled gracefully.
    }
  }

  public static ensureParentDirs(filePath: string) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}
