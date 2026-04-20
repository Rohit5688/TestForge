import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { createRequire } from 'module';
import { ASTScrutinizer } from '../../utils/ASTScrutinizer.js';
import type { CodebaseAnalysisResult } from '../../interfaces/ICodebaseAnalyzer.js';

export class WrapperIntrospectService {
  private wrapperCache = new Map<string, NonNullable<CodebaseAnalysisResult['customWrapper']>>();

  /**
   * Introspects a custom wrapper package with version-based caching.
   * Cache key = pkg@version, invalidates automatically when package updates.
   * Uses file-based persistence (.TestForge/wrapper-cache.json) to survive server restarts.
   */
  public async introspectWrapper(
    projectRoot: string,
    pkg: string
  ): Promise<NonNullable<CodebaseAnalysisResult['customWrapper']>> {
    // Get wrapper version for cache key
    const version = await this.getWrapperVersion(projectRoot, pkg);
    const cacheKey = `${pkg}@${version}`;

    // Check in-memory cache first
    if (this.wrapperCache.has(cacheKey)) {
      console.error(`[Wrapper] Memory cache hit: ${cacheKey}`);
      return this.wrapperCache.get(cacheKey)!;
    }

    // Check file-based cache
    const cacheFilePath = path.join(projectRoot, '.TestForge', 'wrapper-cache.json');
    const cachedFromFile = await this.loadWrapperCacheFromFile(cacheFilePath, cacheKey);
    if (cachedFromFile) {
      console.error(`[Wrapper] File cache hit: ${cacheKey}`);
      this.wrapperCache.set(cacheKey, cachedFromFile);
      return cachedFromFile;
    }

    console.error(`[Wrapper] Cache miss - scanning ${cacheKey}...`);

    // Scan wrapper
    const detectedMethods = await this.scanWrapper(projectRoot, pkg);
    const isInstalled = detectedMethods.length > 0;

    const result: NonNullable<CodebaseAnalysisResult['customWrapper']> = {
      package: pkg,
      detectedMethods,
      isInstalled
    };

    // Cache result in memory
    this.wrapperCache.set(cacheKey, result);
    console.error(`[Wrapper] Cached ${detectedMethods.length} methods from ${cacheKey}`);

    // Persist to file
    await this.saveWrapperCacheToFile(cacheFilePath, cacheKey, result);

    return result;
  }

  private async loadWrapperCacheFromFile(
    cacheFilePath: string,
    cacheKey: string
  ): Promise<NonNullable<CodebaseAnalysisResult['customWrapper']> | null> {
    try {
      if (!await this.fileExists(cacheFilePath)) return null;
      const content = await fs.readFile(cacheFilePath, 'utf8');
      const cache = JSON.parse(content);
      return cache[cacheKey] || null;
    } catch {
      return null;
    }
  }

  private async saveWrapperCacheToFile(
    cacheFilePath: string,
    cacheKey: string,
    result: NonNullable<CodebaseAnalysisResult['customWrapper']>
  ): Promise<void> {
    try {
      const cacheDir = path.dirname(cacheFilePath);
      if (!await this.directoryExists(cacheDir)) {
        await fs.mkdir(cacheDir, { recursive: true });
      }

      let cache: Record<string, any> = {};
      if (await this.fileExists(cacheFilePath)) {
        const content = await fs.readFile(cacheFilePath, 'utf8');
        cache = JSON.parse(content);
      }

      cache[cacheKey] = result;
      await fs.writeFile(cacheFilePath, JSON.stringify(cache, null, 2), 'utf8');
    } catch (e) {
      console.error(`[Wrapper] Failed to save cache: ${e}`);
    }
  }

  public resolvePackageRoot(projectRoot: string, packageName: string): string | null {
    // Strategy 1: Node.js require resolution
    try {
      const requireFromProject = createRequire(path.join(projectRoot, '__placeholder__.js'));
      const pkgJsonPath = requireFromProject.resolve(`${packageName}/package.json`);
      return path.dirname(pkgJsonPath);
    } catch { /* package not resolvable via require from projectRoot */ }

    // Strategy 2: Walk UP the directory tree
    let dir = projectRoot;
    while (true) {
      const candidate = path.join(dir, 'node_modules', packageName);
      if (fsSync.existsSync(candidate)) return candidate;
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }

    return null;
  }

  private async getWrapperVersion(projectRoot: string, pkg: string): Promise<string> {
    try {
      const resolvedRoot = this.resolvePackageRoot(projectRoot, pkg);
      const pkgJsonPath = resolvedRoot
        ? path.join(resolvedRoot, 'package.json')
        : path.join(projectRoot, 'node_modules', pkg, 'package.json');
      if (await this.fileExists(pkgJsonPath)) {
        const pkgJson = JSON.parse(await fs.readFile(pkgJsonPath, 'utf8'));
        return pkgJson.version || 'unknown';
      }

      const wrapperPath = path.join(projectRoot, pkg);
      if (await this.fileExists(wrapperPath)) {
        const stats = await fs.stat(wrapperPath);
        return stats.mtime.getTime().toString();
      }

      if (await this.fileExists(wrapperPath + '.ts')) {
        const stats = await fs.stat(wrapperPath + '.ts');
        return stats.mtime.getTime().toString();
      }

      return 'unknown';
    } catch {
      return 'unknown';
    }
  }

  public async scanWrapper(projectRoot: string, pkg: string): Promise<string[]> {
    const resolved = this.resolvePackageRoot(projectRoot, pkg);
    let wrapperRoot = resolved ?? path.join(projectRoot, 'node_modules', pkg);

    if (!resolved && !await this.directoryExists(wrapperRoot)) {
      wrapperRoot = path.join(projectRoot, pkg);
    }

    if (!await this.directoryExists(wrapperRoot) && !await this.fileExists(wrapperRoot)) {
      console.error(`[WrapperScan] Package "${pkg}" not found. Tried: ${resolved ?? 'N/A'}, ${path.join(projectRoot, 'node_modules', pkg)}, ${path.join(projectRoot, pkg)}`);
      return [];
    }

    const methods = new Set<string>();

    if (await this.fileExists(wrapperRoot)) {
      const content = await fs.readFile(wrapperRoot, 'utf8');
      return ASTScrutinizer.extractPublicMethods(content);
    }

    await this.scanWrapperDir(wrapperRoot, methods);
    return Array.from(methods);
  }

  private async scanWrapperDir(dir: string, methodNames: Set<string>, depth = 0): Promise<void> {
    if (depth > 5) return;

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (['test', 'tests', '__tests__', 'docs', 'examples', 'node_modules'].includes(entry.name)) {
          continue;
        }

        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          console.error(`[WrapperScan] Dir depth=${depth}: ${fullPath}`);
          await this.scanWrapperDir(fullPath, methodNames, depth + 1);
        } else if (entry.name.match(/\.(d\.ts|ts|js)$/)) {
          const isDts = entry.name.endsWith('.d.ts');
          const correspondingTs = fullPath.replace(/\.d\.ts$/, '.ts');
          
          if (isDts && await this.fileExists(correspondingTs)) {
            continue;
          }
          
          console.error(`[WrapperScan] File depth=${depth}: ${fullPath}`);
          const content = await fs.readFile(fullPath, 'utf8');
          const methods = ASTScrutinizer.extractPublicMethods(content);
          console.error(`[WrapperScan] Extracted ${methods.length} methods from ${entry.name}`);
          methods.forEach(m => methodNames.add(m));
        }
      }
    } catch (e) {
      console.error(`[WrapperScan] Error at depth=${depth}: ${e}`);
    }
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      const stat = await fs.stat(filePath);
      return stat.isFile();
    } catch {
      return false;
    }
  }

  private async directoryExists(dirPath: string): Promise<boolean> {
    try {
      const stat = await fs.stat(dirPath);
      return stat.isDirectory();
    } catch {
      return false;
    }
  }
}
