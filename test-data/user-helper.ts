import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Resolve __dirname equivalent for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type UserRole = 'admin' | 'standard' | 'readonly';

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
  const storePath = path.join(__dirname, `users.${env}.json`);

  if (!fs.existsSync(storePath)) {
    throw new Error(
      `[UserStore] No user store found for environment "${env}".\n` +
      `  Expected: ${storePath}\n` +
      `  Create it using: manage_users { action: "scaffold", projectRoot: "..." }`
    );
  }

  const store = JSON.parse(fs.readFileSync(storePath, 'utf-8')) as Record<string, UserCredential>;
  const user = store[role];

  if (!user) {
    throw new Error(
      `[UserStore] Role "${role}" not found in "${storePath}".\n` +
      `  Available roles: ${Object.keys(store).join(', ')}\n` +
      `  Add it using: manage_users { action: "add-role", role: "\${role}", projectRoot: "..." }`
    );
  }

  if (user.password === '***FILL_IN***') {
    throw new Error(
      `[UserStore] Password for role "${role}" is still a placeholder.\n` +
      `  Open ${storePath} and replace ***FILL_IN*** with real credentials.`
    );
  }

  return user;
}
