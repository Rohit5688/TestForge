import * as fs from 'fs';
import * as path from 'path';
import { type UserStore, type UserStoreReadResult } from '../services/config/UserStoreTypes.js';
import { UserSecurityManager } from './UserSecurityManager.js';

export class UserStorePersistence {
  private readonly EXAMPLE_FILE = 'users.example.json';
  private readonly security: UserSecurityManager;

  constructor(security: UserSecurityManager) {
    this.security = security;
  }

  public storeFile(testDataDir: string, environment: string): string {
    return path.join(testDataDir, `users.${environment}.json`);
  }

  /** Read the user store for a given environment */
  public read(testDataDir: string, environment: string): UserStoreReadResult {
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

  /** Writes the environment-specific user store */
  public write(filePath: string, users: UserStore): void {
    fs.writeFileSync(filePath, JSON.stringify(users, null, 2), 'utf-8');
  }

  /** Keeps users.example.json in sync with all known roles (no credentials) */
  public syncExample(testDataDir: string, users: UserStore): void {
    for (const [role, cred] of Object.entries(users)) {
      this.security.assertNoApiKeyFields(role, cred);
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
}
