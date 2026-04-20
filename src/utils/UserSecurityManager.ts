import * as fs from 'fs';
import * as path from 'path';
import { McpErrors } from '../types/ErrorSystem.js';
import { type UserCredential } from '../services/config/UserStoreTypes.js';

/** Field name patterns that indicate an API key — must live in .env, never in credential JSON */
const API_KEY_FIELD_PATTERNS: RegExp[] = [
  /api[-_]?key/i,
  /secret[-_]?key/i,
  /access[-_]?token/i,
  /auth[-_]?token/i,
  /bearer[-_]?token/i,
  /client[-_]?secret/i,
  /private[-_]?key/i,
];

export class UserSecurityManager {
  /** Returns the matched pattern string if the field is considered an API key, null otherwise */
  public detectApiKeyField(fieldName: string): string | null {
    for (const pattern of API_KEY_FIELD_PATTERNS) {
      if (pattern.test(fieldName)) return fieldName;
    }
    return null;
  }

  /**
   * Hard-reject any credential object that contains API key fields.
   * API keys must be stored via manage_env → .env, never in credential JSON.
   */
  public assertNoApiKeyFields(role: string, cred: UserCredential): void {
    const apiKeyFields: string[] = [];
    for (const field of Object.keys(cred)) {
      if (this.detectApiKeyField(field) !== null) {
        apiKeyFields.push(field);
      }
    }
    if (apiKeyFields.length > 0) {
      throw McpErrors.projectValidationFailed(
        `[UserStoreService] Role "${role}" contains API key field(s): ${apiKeyFields.join(', ')}.\n` +
        `API keys must NEVER be stored in users.{env}.json files.\n` +
        `Store them via manage_env { action: "write", entries: [{ key: "${apiKeyFields[0]!.toUpperCase()}", value: "..." }] } instead.\n` +
        `They will be written to .env and automatically gitignored.`
      );
    }
  }

  /**
   * Pre-validate that the target credential path is covered by .gitignore
   * before any write occurs. Ensures the file is safe to write credentials.
   */
  public assertPathIsGitignored(
    projectRoot: string,
    environment: string,
    filePath: string
  ): void {
    const gitignorePath = path.join(projectRoot, '.gitignore');
    const relEntry = `test-data/users.${environment}.json`;

    // ensureGitignore writes the entry — run it now so the file is protected
    // before we touch the credential file at all.
    this.ensureGitignore(projectRoot, environment);

    // Post-write assertion: verify the entry is actually present in .gitignore.
    try {
      const gitContent = fs.readFileSync(gitignorePath, 'utf-8');
      if (!gitContent.includes(relEntry)) {
        throw McpErrors.fileOperationFailed(
          `[UserStoreService] Credential path "${relEntry}" could not be added to .gitignore.\n` +
          `Aborting write to prevent accidental secret commit.\n` +
          `Manually add "${relEntry}" to ${gitignorePath} and retry.`
        );
      }
    } catch (readErr: any) {
      if (readErr.message.startsWith('[UserStoreService]')) throw readErr;
      throw McpErrors.fileOperationFailed(
        `[UserStoreService] Cannot verify .gitignore at ${gitignorePath}: ${readErr.message}\n` +
        `Aborting write to prevent accidental secret commit.`
      );
    }

    // Also ensure .env itself is gitignored
    this.ensureEnvGitignored(projectRoot, gitignorePath);
  }

  /** Ensures users.{env}.json entries are in .gitignore */
  public ensureGitignore(projectRoot: string, environment: string): void {
    const gitignorePath = path.join(projectRoot, '.gitignore');
    const entry = `test-data/users.${environment}.json`;
    if (fs.existsSync(gitignorePath)) {
      const content = fs.readFileSync(gitignorePath, 'utf-8');
      if (!content.includes(entry)) {
        fs.appendFileSync(gitignorePath, `\n# User credential stores (never commit)\n${entry}\n`, 'utf-8');
      }
    } else {
      fs.writeFileSync(gitignorePath, `# User credential stores (never commit)\n${entry}\n`, 'utf-8');
    }
  }

  /** Ensures .env is in .gitignore */
  private ensureEnvGitignored(projectRoot: string, gitignorePath: string): void {
    try {
      const gi = fs.existsSync(gitignorePath)
        ? fs.readFileSync(gitignorePath, 'utf-8')
        : '';
      if (!gi.split(/\r?\n/).map((l: string) => l.trim()).includes('.env')) {
        fs.appendFileSync(
          gitignorePath,
          `\n# Local environment / API keys (never commit)\n.env\n`,
          'utf-8'
        );
      }
    } catch { /* non-fatal — best-effort */ }
  }
}
