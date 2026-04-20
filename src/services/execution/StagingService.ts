import { McpErrors, McpError, McpErrorCode } from '../../types/ErrorSystem.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type { GeneratedFile } from '../io/FileWriterService.js';

const execFileAsync = promisify(execFile);

/**
 * StagingService
 * 
 * Implements atomic staging (Task-44). Before any AI-generated files are 
 * written to the actual project root, they are written to a temporary directory
 * inside OS tmpdir and validated with tsc. 
 * If validation fails, the project is never touched.
 */
export class StagingService {
  /**
   * Stages files in os.tmpdir and validates them using tsc --noEmit.
   * Returns the path to the staging directory if successful.
   * Throws an error with details if validation fails.
   */
  public async stageAndValidate(projectRoot: string, files: GeneratedFile[]): Promise<string> {
    const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-staging-'));

    try {
      // 1. Write the files to the staging directory
      for (const file of files) {
        const fullPath = path.join(stagingDir, file.path);
        const dir = path.dirname(fullPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(fullPath, file.content, 'utf-8');
      }

      // 2. Validate TypeScript if there are .ts files
      const tsFiles = files.filter(f => f.path.endsWith('.ts'));
      if (tsFiles.length > 0) {
        // TF-CROSS-02 FIX: Generate a portable tsconfig that extends the user's project
        const tsconfigPath = path.join(projectRoot, 'tsconfig.json');
        const hasTsConfig = fs.existsSync(tsconfigPath);

        let targetTsconfigPath = '';

        if (hasTsConfig) {
          const relativeExtends = path.relative(stagingDir, tsconfigPath).replace(/\\/g, '/');
          const relativeRoot = path.relative(stagingDir, projectRoot).replace(/\\/g, '/') || '.';
          const stagingTsconfig = {
            extends: relativeExtends,
            compilerOptions: {
              baseUrl: relativeRoot,
              rootDir: relativeRoot,
              noEmit: true
            },
            include: [
              '**/*.ts',
              `${relativeRoot}/**/*.ts`
            ],
            exclude: [
              `${relativeRoot}/node_modules`,
              `${relativeRoot}/.mcp-staging` // TestForge `.mcp-staging` path exclusion just in case
            ]
          };
          targetTsconfigPath = path.join(stagingDir, 'tsconfig.json');
          fs.writeFileSync(targetTsconfigPath, JSON.stringify(stagingTsconfig, null, 2), 'utf-8');
        }

        const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';

        try {
          if (hasTsConfig) {
            await execFileAsync(npxCmd, ['tsc', '--noEmit', '--project', targetTsconfigPath], {
              cwd: projectRoot, // Execute from project root so node_modules resolve
              shell: process.platform === 'win32'
            });
          } else {
            const filePaths = tsFiles.map(f => path.join(stagingDir, f.path));
            await execFileAsync(npxCmd, [
              'tsc',
              '--noEmit',
              '--strict',
              '--esModuleInterop',
              '--skipLibCheck',
              ...filePaths
            ], {
              cwd: projectRoot,
              shell: process.platform === 'win32'
            });
          }
        } catch (error: any) {
          const rawOutput: string = error.stderr || error.stdout || error.message;
          const formattedError = StagingService.parseTscErrors(rawOutput, stagingDir, files.map(f => f.path));
          throw new McpError(formattedError, McpErrorCode.TS_COMPILE_FAILED);
        }
      }

      return stagingDir;
    } catch (e) {
      // Clean up on failure
      this.cleanup(stagingDir);
      throw e;
    }
  }

  public cleanup(stagingDir: string) {
    if (stagingDir && fs.existsSync(stagingDir)) {
      try {
        fs.rmSync(stagingDir, { recursive: true, force: true });
      } catch (e) { }
    }
  }

  /**
   * Parses raw tsc --noEmit output into a targeted, root-cause-first error message.
   *
   * Problem: tsc emits cascading errors — one missing import causes 30+ downstream
   * errors. LLMs chase the wrong ones. This method:
   *  1. Strips noise (node_modules, .features-gen, staging temp dirs, npm warnings)
   *  2. Groups errors by file the LLM actually wrote (llmFiles)
   *  3. Identifies the ROOT CAUSE — the first error in an LLM-authored file
   *  4. Returns a compact, actionable message: file, line, TS code, message
   */
  public static parseTscErrors(rawOutput: string, stagingDir: string, llmFiles: string[]): string {
    // tsc error format: "<path>(line,col): error TS<code>: <message>"
    const errorLineRe = /^(.+?)\((\d+),(\d+)\):\s*error\s+(TS\d+):\s*(.+)/;

    // Noise paths: staging temp dir, node_modules, bddgen output, playwright snapshots
    const noisePatterns = [
      /[\\/]node_modules[\\/]/,
      /\.features-gen[\\/]/,
      /playwright\.config/,
      /\.mcp-staging/,
      stagingDir ? new RegExp(stagingDir.replace(/[\\]/g, '\\\\').replace(/[/]/g, '\\/')) : /^$/
    ];

    interface TscError {
      file: string;
      line: number;
      col: number;
      code: string;
      message: string;
      isLlmFile: boolean;
    }

    const parsed: TscError[] = [];
    for (const line of rawOutput.split('\n')) {
      const m = errorLineRe.exec(line.trim());
      if (!m) continue;
      const rawFile = m[1];
      const lineStr  = m[2];
      const colStr   = m[3];
      const code     = m[4];
      const message  = m[5];
      if (!rawFile || !lineStr || !colStr || !code || !message) continue;
      // Skip noise files
      if (noisePatterns.some(p => p.test(rawFile))) continue;
      // Normalize path: strip staging prefix to show relative path
      const normalizedFile = rawFile
        .replace(stagingDir + path.sep, '')
        .replace(stagingDir + '/', '')
        .replace(/\\/g, '/');
      const isLlmFile = llmFiles.some(f => f.replace(/\\/g, '/') === normalizedFile ||
        normalizedFile.endsWith(f.replace(/\\/g, '/')));
      parsed.push({
        file: normalizedFile,
        line: parseInt(lineStr, 10),
        col: parseInt(colStr, 10),
        code,
        message: message.trim(),
        isLlmFile
      });
    }

    if (parsed.length === 0) {
      // Fallback: return first 10 non-empty lines of raw output
      const fallback = rawOutput.split('\n')
        .filter(l => l.trim() && !l.includes('npm warn') && !l.includes('npm notice'))
        .slice(0, 10).join('\n');
      return `TypeScript compilation failed in staging:\n${fallback}`;
    }

    // Identify root cause: first error in an LLM-authored file
    // parsed.length > 0 at this point (checked above), so rootCause is always defined.
    const rootCause = (parsed.find(e => e.isLlmFile) ?? parsed[0])!;
    const llmErrors = parsed.filter(e => e.isLlmFile);
    const cascadeCount = parsed.length - llmErrors.length;

    const lines: string[] = [
      `🔴 TypeScript Compilation Failed — ${llmErrors.length} error(s) in generated files` +
        (cascadeCount > 0 ? ` (+${cascadeCount} cascade errors suppressed)` : ''),
      '',
      `🎯 ROOT CAUSE (fix this first):`,
      `   File:    ${rootCause.file}`,
      `   Line:    ${rootCause.line}:${rootCause.col}`,
      `   Error:   ${rootCause.code}: ${rootCause.message}`,
    ];

    if (llmErrors.length > 1) {
      lines.push('');
      lines.push(`📋 All errors in generated files:`);
      for (const e of llmErrors.slice(0, 8)) {
        lines.push(`   ${e.file}:${e.line} — ${e.code}: ${e.message}`);
      }
      if (llmErrors.length > 8) {
        lines.push(`   ... and ${llmErrors.length - 8} more.`);
      }
    }

    lines.push('');
    lines.push('── Fix the ROOT CAUSE above. Cascade errors will self-resolve. ──');
    return lines.join('\n');
  }
}
