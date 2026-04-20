import { type UserStoreReadResult, type UserStoreWriteResult } from './UserStoreTypes.js';
/**
 * UserStoreService — Phase 23 (Refactored to Facade)
 *
 * Manages environment-specific user credential JSON files.
 * Delegates logic to specialized utility classes.
 */
export declare class UserStoreService {
    private readonly TEST_DATA_DIR;
    private readonly security;
    private readonly persistence;
    private readonly generator;
    constructor();
    /** Read the user store for a given environment */
    read(projectRoot: string, environment: string): UserStoreReadResult;
    /**
     * Adds new roles to the user store for an environment.
     * Skips roles already present (never overwrites real credentials).
     * Creates the test-data/ directory and example file if needed.
     */
    addRoles(projectRoot: string, environment: string, roles: string[]): UserStoreWriteResult;
    /**
     * Scaffold default roles (admin, standard, readonly) for each environment.
     * Safe to call multiple times — never overwrites existing entries.
     */
    scaffold(projectRoot: string, environments: string[], initialRoles?: string[]): Record<string, UserStoreWriteResult>;
    /**
     * Generates test-data/user-helper.ts into the project.
     */
    generateUserHelper(projectRoot: string, knownRoles: string[]): void;
}
//# sourceMappingURL=UserStoreService.d.ts.map