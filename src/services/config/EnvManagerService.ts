import * as fs from 'fs';
import * as path from 'path';

export interface EnvEntry {
  key: string;
  value: string;
}

export interface EnvReadResult {
  keys: string[];
  values: Record<string, string>;
  envFilePath: string;
  exists: boolean;
}

export interface EnvWriteResult {
  written: string[];
  skipped: string[];    // keys skipped because value starts with *** (secret placeholder)
  envFilePath: string;
}

/**
 * EnvManagerService — Phase 19
 *
 * Reads, writes, and scaffolds .env files for test projects.
 * Design principles:
 *   - Never overwrite a value that already exists (unless explicitly told to)
 *   - Never log or expose secret placeholder values (***) in write output
 *   - Creates .env.example alongside .env so teams can track required keys safely
 *   - Adds .env to .gitignore automatically to prevent accidental credential commits
 */
export class EnvManagerService {
  private readonly ENV_FILE = '.env';
  private readonly ENV_EXAMPLE_FILE = '.env.example';
  private readonly GITIGNORE_FILE = '.gitignore';
  private readonly SECRET_PLACEHOLDER = '***FILL_IN***';

  /** Reads a specific .env file and returns all key/value pairs. Default is '.env' */
  public read(projectRoot: string, envName?: string): EnvReadResult {
    const fileName = envName ? `.env.${envName}` : this.ENV_FILE;
    const envFilePath = path.join(projectRoot, fileName);
    if (!fs.existsSync(envFilePath)) {
      return { keys: [], values: {}, envFilePath, exists: false };
    }

    const content = fs.readFileSync(envFilePath, 'utf-8');
    const values: Record<string, string> = {};

    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      values[key] = value;
    }

    return { keys: Object.keys(values), values, envFilePath, exists: true };
  }

  /**
   * Upserts keys into a specific .env file.
   * - Skips keys whose value starts with *** (they are secrets, human must fill in)
   * - Skips keys already present in .env unless the current value is a placeholder
   * - Updates .env.example with all keys (values redacted to their type for transparency)
   */
  public write(projectRoot: string, entries: EnvEntry[], envName?: string, overwrite = false): EnvWriteResult {
    const fileName = envName ? `.env.${envName}` : this.ENV_FILE;
    const envFilePath = path.join(projectRoot, fileName);
    const existing = this.read(projectRoot, envName);
    const currentValues = existing.values;

    const written: string[] = [];
    const skipped: string[] = [];

    for (const entry of entries) {
      // Don't write secret placeholders — humans fill those in
      if (entry.value.startsWith('***')) {
        // But DO write them to .env if they're not already there (so the dev knows to fill them)
        if (currentValues[entry.key] == null) {
          currentValues[entry.key] = this.SECRET_PLACEHOLDER;
          written.push(`${entry.key}=${this.SECRET_PLACEHOLDER}`);
        } else {
          skipped.push(entry.key);
        }
        continue;
      }

      // Don't overwrite existing non-placeholder values unless explicitly requested
      const existingVal = currentValues[entry.key];
      if (existingVal != null && !existingVal.startsWith('***') && !overwrite) {
        skipped.push(entry.key);
        continue;
      }

      currentValues[entry.key] = entry.value;
      written.push(`${entry.key}=${entry.value}`);
    }

    this.persistEnvFile(envFilePath, currentValues);
    this.updateEnvExample(projectRoot, Object.keys(currentValues));
    this.ensureGitignore(projectRoot, fileName);

    return { written, skipped, envFilePath };
  }

  /**
   * Scaffolds environment-specific .env files (e.g. .env.staging).
   * Safe and additive.
   */
  public scaffoldMulti(projectRoot: string, envs: string[]): EnvWriteResult[] {
    const results: EnvWriteResult[] = [];
    for (const envName of envs) {
      const defaults: EnvEntry[] = [
        { key: 'BASE_URL', value: `https://${envName}-your-app-url.com` },
        { key: 'TEST_ENVIRONMENT', value: envName },
        { key: 'HEADLESS', value: 'true' },
        { key: 'SLOWMO', value: '0' },
        { key: 'BROWSER', value: 'chromium' },
      ];
      results.push(this.write(projectRoot, defaults, envName, false));
    }
    // Also scaffold base .env if not present
    results.push(this.scaffold(projectRoot));
    return results;
  }

  /**
   * Scaffolds a fresh .env file with sensible BDD defaults.
   */
  public scaffold(projectRoot: string): EnvWriteResult {
    const defaults: EnvEntry[] = [
      { key: 'BASE_URL', value: 'https://your-app-url.com' },
      { key: 'TEST_ENVIRONMENT', value: 'local' },
      { key: 'HEADLESS', value: 'true' },
      { key: 'SLOWMO', value: '0' },
      { key: 'BROWSER', value: 'chromium' },
    ];
    return this.write(projectRoot, defaults, undefined, false);
  }

  /** Serializes the key-value map back to .env file format */
  private persistEnvFile(filePath: string, values: Record<string, string>) {
    const lines = [
      '# Auto-managed by TestForge',
      '# DO NOT commit this file — it may contain real credentials.',
      '',
      ...Object.entries(values).map(([k, v]) => `${k}=${v}`),
    ];
    fs.writeFileSync(filePath, lines.join('\n') + '\n', 'utf-8');
  }

  /** Creates/updates .env.example with all keys but redacted values */
  private updateEnvExample(projectRoot: string, keys: string[]) {
    const examplePath = path.join(projectRoot, this.ENV_EXAMPLE_FILE);
    const lines = [
      '# Copy this file to .env and fill in real values.',
      '# Never commit .env — only commit .env.example.',
      '',
      ...keys.map(k => `${k}=`),
    ];
    fs.writeFileSync(examplePath, lines.join('\n') + '\n', 'utf-8');
  }

  /** Ensures the env file is listed in .gitignore */
  private ensureGitignore(projectRoot: string, envFile: string) {
    const gitignorePath = path.join(projectRoot, this.GITIGNORE_FILE);
    const entry = envFile;
    if (fs.existsSync(gitignorePath)) {
      const content = fs.readFileSync(gitignorePath, 'utf-8');
      if (!content.includes(entry)) {
        fs.appendFileSync(gitignorePath, `\n# Environment secrets\n${entry}\n`, 'utf-8');
      }
    } else {
      fs.writeFileSync(gitignorePath, `# Environment secrets\n${entry}\n`, 'utf-8');
    }
  }
}
