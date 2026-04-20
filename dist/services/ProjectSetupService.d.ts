import { EnvManagerService } from './EnvManagerService.js';
/**
 * ProjectSetupService — Phase 20D + Phase 8 Hardening (Refactored Phase 6)
 *
 * Bootstraps a blank directory into a fully configured Playwright-BDD project.
 * This class acts as a Facade, delegating specific scaffolding tasks to specialized utilities.
 */
export declare class ProjectSetupService {
    private readonly envManager;
    private readonly scaffolder;
    private readonly configManager;
    private readonly dependencyManager;
    private readonly docScaffolder;
    constructor(envManager?: EnvManagerService);
    /**
     * Main entry point for project setup.
     * Handles Phase 1 (Config Template) and Phase 2 (Full Scaffolding).
     */
    setup(projectRoot: string): Promise<string>;
    /**
     * Safe to run at any time — only generates files that are missing.
     * Never overwrites existing files. Used by repair_project and upgrade_project.
     */
    repairProject(projectRoot: string): Promise<string>;
    /**
     * Internal scaffolding orchestration.
     */
    private _scaffold;
    /**
     * Delegates config schema syncing.
     */
    syncConfigSchema(projectRoot: string): string[];
    /**
     * Helper to generate the final summary message.
     */
    private generateSummaryMessage;
    generateConfigTemplate(projectRoot: string): string;
    scaffoldMcpConfigReference(projectRoot: string): void;
    scaffoldPromptCheatbook(projectRoot: string): void;
    scanConfigureMe(projectRoot: string): string[];
}
//# sourceMappingURL=ProjectSetupService.d.ts.map