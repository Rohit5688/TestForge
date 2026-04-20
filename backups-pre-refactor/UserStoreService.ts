import * as fs from 'fs';
import * as path from 'path';
import { McpErrors } from '../types/ErrorSystem.js';

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

/** Returns the matched pattern string if the field is considered an API key, null otherwise */
function detectApiKeyField(fieldName: string): string | null {
  for (const pattern of API_KEY_FIELD_PATTERNS) {
    if (pattern.test(fieldName)) return fieldName;
  }
  return null;
}

export interface UserCredential {
  username: string;
  password: string;
  role: string;
  /** Any additional metadata: email, displayName, permissions, etc. */
  [extra: string]: string;
}

export interface UserStore {
  [role: string]: UserCredential;
}

export interface UserStoreReadResult {
  environment: string;
  filePath: string;
  exists: boolean;
  roles: string[];
  users: UserStore;
}

export interface UserStoreWriteResult {
  environment: string;
  filePath: string;
  added: string[];
  skipped: string[];   // roles already present
}

const SECRET_PLACEHOLDER = '***FILL_IN***';

/**
 * UserStoreService — Phase 23
 *
 * Manages environment-specific user credential JSON files.
 *
 * File per environment: test-data/users.{env}.json  (never commit — add to .gitignore)
 * Safe-to-commit copy:  test-data/users.example.json (role keys + empty values)
 *
 * Design principles:
 *  - Never overwrites an existing user's credentials
 *  - Secret placeholders (***) flow into the file so devs know to fill them in
 *  - Generates a typed user-helper.ts into the project so Page Objects can call: getUser('admin')
 */
export class UserStoreService {
  private readonly TEST_DATA_DIR = 'test-data';
  private readonly EXAMPLE_FILE = 'users.example.json';
  private readonly HELPER_FILE = 'user-helper.ts';

  private storeFile(testDataDir: string, environment: string): string {
    return path.join(testDataDir, `users.${environment}.json`);
  }

  /** Read the user store for a given environment */
  public read(projectRoot: string, environment: string): UserStoreReadResult {
    const testDataDir = path.join(projectRoot, this.TEST_DATA_DIR);
    const filePath = this.storeFile(testDataDir, environment);

    if (!fs.existsSync(filePath)) {
      return { environment, filePath, exists: false, roles: [], users: {} };
    }

    try {
      const users = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as UserStore;
      return { environment, filePath, exists: true, roles: Object.keys(users), users };
    } catch {
      return { environment, filePath, exists: false, roles: [], users: {} };
    }
  }

  /**
   * Adds new roles to the user store for an environment.
   * Skips roles already present (never overwrites real credentials).
   * Creates the test-data/ directory and example file if needed.
   */
  public addRoles(
    projectRoot: string,
    environment: string,
    roles: string[]
  ): UserStoreWriteResult {
    const testDataDir = path.join(projectRoot, this.TEST_DATA_DIR);
    if (!fs.existsSync(testDataDir)) {
      fs.mkdirSync(testDataDir, { recursive: true });
    }

    const filePath = this.storeFile(testDataDir, environment);

    // TASK-15: Pre-validate credential path against .gitignore rules before writing
    this.assertPathIsGitignored(projectRoot, environment, filePath);

    const existing = this.read(projectRoot, environment);
    const currentUsers: UserStore = existing.users;

    const added: string[] = [];
    const skipped: string[] = [];

    for (const role of roles) {
      if (currentUsers[role]) {
        skipped.push(role);
        continue;
      }
      currentUsers[role] = {
        username: `${role}@yourapp.com`,
        password: SECRET_PLACEHOLDER,
        role,
      };
      added.push(role);
    }

    fs.writeFileSync(filePath, JSON.stringify(currentUsers, null, 2), 'utf-8');
    this.updateExampleFile(testDataDir, currentUsers);
    this.ensureGitignore(projectRoot, environment);

    return { environment, filePath, added, skipped };
  }

  /**
   * Scaffold default roles (admin, standard, readonly) for each environment.
   * Safe to call multiple times — never overwrites existing entries.
   */
  public scaffold(
    projectRoot: string,
    environments: string[],
    initialRoles: string[] = ['admin', 'standard', 'readonly']
  ): Record<string, UserStoreWriteResult> {
    const results: Record<string, UserStoreWriteResult> = {};
    for (const env of environments) {
      results[env] = this.addRoles(projectRoot, env, initialRoles);
    }
    this.generateUserHelper(projectRoot, initialRoles);
    return results;
  }

  /**
   * Generates test-data/user-helper.ts into the project so Page Objects
   * can call: const { username, password } = getUser('admin');
   * Reads from users.{ENV}.json where ENV = process.env.TEST_ENV ?? 'staging'
   */
  public generateUserHelper(projectRoot: string, knownRoles: string[]): void {
    const testDataDir = path.join(projectRoot, this.TEST_DATA_DIR);
    if (!fs.existsSync(testDataDir)) {
      fs.mkdirSync(testDataDir, { recursive: true });
    }

    const helperPath = path.join(testDataDir, this.HELPER_FILE);

    // Build a union type from known roles for type safety
    const roleType = knownRoles.map(r => `'${r}'`).join(' | ') || 'string';

    const helperContent = `import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Resolve __dirname equivalent for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type UserRole = ${roleType};

export interface UserCredential {
  username: string;
  password: string;
  role: string;
  [extra: string]: string;
}

/**
 * Returns credentials for the given role from the environment-specific user store.
 *
 * File loaded: test-data/users.{TEST_ENV}.json
 * Set process.env.TEST_ENV (or TEST_ENVIRONMENT) to switch environments.
 *
 * Example usage in a Page Object:
 *   const { username, password } = getUser('admin');
 *   await page.fill('#username', username);
 */
export function getUser(role: UserRole): UserCredential {
  const env = process.env['TEST_ENV'] ?? process.env['TEST_ENVIRONMENT'] ?? 'staging';
  const storePath = path.join(__dirname, \`users.\${env}.json\`);

  if (!fs.existsSync(storePath)) {
    throw new Error(
      \`[UserStore] No user store found for environment "\${env}".\\n\` +
      \`  Expected: \${storePath}\\n\` +
      \`  Create it using: manage_users { action: "scaffold", projectRoot: "..." }\`
    );
  }

  const store = JSON.parse(fs.readFileSync(storePath, 'utf-8')) as Record<string, UserCredential>;
  const user = store[role];

  if (!user) {
    throw new Error(
      \`[UserStore] Role "\${role}" not found in "\${storePath}".\\n\` +
      \`  Available roles: \${Object.keys(store).join(', ')}\\n\` +
      \`  Add it using: manage_users { action: "add-role", role: "\\\${role}", projectRoot: "..." }\`
    );
  }

  if (user.password === '***FILL_IN***') {
    throw new Error(
      \`[UserStore] Password for role "\${role}" is still a placeholder.\\n\` +
      \`  Open \${storePath} and replace ***FILL_IN*** with real credentials.\`
    );
  }

  return user;
}
`;

    // Always overwrite to ensure role types/imports stay in sync with latest project config
    fs.writeFileSync(helperPath, helperContent, 'utf-8');
  }

  /** Keeps users.example.json in sync with all known roles (no credentials) */
  private updateExampleFile(testDataDir: string, users: UserStore): void {
    // TASK-15: Reject API key fields before persisting to the example file
    for (const [role, cred] of Object.entries(users)) {
      this.assertNoApiKeyFields(role, cred);
    }
    const example: Record<string, any> = {
      _README: 'Copy this file to users.{env}.json and fill in real credentials. NEVER commit files with real passwords.'
    };
    for (const [role, cred] of Object.entries(users)) {
      example[role] = { ...cred, password: 'FILL_IN' };
    }
    const examplePath = path.join(testDataDir, this.EXAMPLE_FILE);
    fs.writeFileSync(examplePath, JSON.stringify(example, null, 2), 'utf-8');
  }

  /**
   * TASK-15: Hard-reject any credential object that contains API key fields.
   * API keys must be stored via manage_env → .env, never in credential JSON.
   */
  private assertNoApiKeyFields(role: string, cred: UserCredential): void {
    const apiKeyFields: string[] = [];
    for (const field of Object.keys(cred)) {
      if (detectApiKeyField(field) !== null) {
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
   * TASK-15: Pre-validate that the target credential path is covered by .gitignore
   * before any write occurs. Ensures the file is safe to write credentials.
   * If not yet gitignored, calls ensureGitignore() first.
   */
  private assertPathIsGitignored(
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
    // If something went wrong (disk error, etc.) we must abort rather than write.
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
      // .gitignore still doesn't exist after the write attempt — fail safe
      throw McpErrors.fileOperationFailed(
        `[UserStoreService] Cannot verify .gitignore at ${gitignorePath}: ${readErr.message}\n` +
        `Aborting write to prevent accidental secret commit.`
      );
    }

    // TASK-15: Also ensure .env itself is gitignored (for API key sibling files)
    this.ensureEnvGitignored(projectRoot, gitignorePath);
  }

  /**
   * TASK-15: Ensure .env is in .gitignore.
   * Called as a side-effect whenever credentials are written so API key files
   * are always protected even if manage_env hasn't run yet.
   */
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

  /** Adds users.{env}.json entries to .gitignore */
  private ensureGitignore(projectRoot: string, environment: string): void {
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
}
