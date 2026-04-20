import * as fs from 'fs';
import * as path from 'path';
import {} from './UserStoreTypes.js';
import { UserSecurityManager } from '../utils/UserSecurityManager.js';
import { UserStorePersistence } from '../utils/UserStorePersistence.js';
import { UserHelperGenerator } from '../utils/UserHelperGenerator.js';
const SECRET_PLACEHOLDER = '***FILL_IN***';
/**
 * UserStoreService — Phase 23 (Refactored to Facade)
 *
 * Manages environment-specific user credential JSON files.
 * Delegates logic to specialized utility classes.
 */
export class UserStoreService {
    TEST_DATA_DIR = 'test-data';
    security;
    persistence;
    generator;
    constructor() {
        this.security = new UserSecurityManager();
        this.persistence = new UserStorePersistence(this.security);
        this.generator = new UserHelperGenerator();
    }
    /** Read the user store for a given environment */
    read(projectRoot, environment) {
        const testDataDir = path.join(projectRoot, this.TEST_DATA_DIR);
        return this.persistence.read(testDataDir, environment);
    }
    /**
     * Adds new roles to the user store for an environment.
     * Skips roles already present (never overwrites real credentials).
     * Creates the test-data/ directory and example file if needed.
     */
    addRoles(projectRoot, environment, roles) {
        const testDataDir = path.join(projectRoot, this.TEST_DATA_DIR);
        if (!fs.existsSync(testDataDir)) {
            fs.mkdirSync(testDataDir, { recursive: true });
        }
        const filePath = this.persistence.storeFile(testDataDir, environment);
        // TASK-15: Pre-validate credential path against .gitignore rules before writing
        this.security.assertPathIsGitignored(projectRoot, environment, filePath);
        const existing = this.read(projectRoot, environment);
        const currentUsers = existing.users;
        const added = [];
        const skipped = [];
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
        this.persistence.write(filePath, currentUsers);
        this.persistence.syncExample(testDataDir, currentUsers);
        this.security.ensureGitignore(projectRoot, environment);
        return { environment, filePath, added, skipped };
    }
    /**
     * Scaffold default roles (admin, standard, readonly) for each environment.
     * Safe to call multiple times — never overwrites existing entries.
     */
    scaffold(projectRoot, environments, initialRoles = ['admin', 'standard', 'readonly']) {
        const results = {};
        for (const env of environments) {
            results[env] = this.addRoles(projectRoot, env, initialRoles);
        }
        this.generateUserHelper(projectRoot, initialRoles);
        return results;
    }
    /**
     * Generates test-data/user-helper.ts into the project.
     */
    generateUserHelper(projectRoot, knownRoles) {
        const testDataDir = path.join(projectRoot, this.TEST_DATA_DIR);
        if (!fs.existsSync(testDataDir)) {
            fs.mkdirSync(testDataDir, { recursive: true });
        }
        this.generator.generate(projectRoot, testDataDir, knownRoles);
    }
}
//# sourceMappingURL=UserStoreService.js.map