import { McpError, McpErrorCode } from "../types/ErrorSystem.js";

// Service Imports
import { CodebaseAnalyzerService } from "../services/analysis/CodebaseAnalyzerService.js";
import { TestGenerationService } from "../services/generation/TestGenerationService.js";
import { TestRunnerService } from "../services/execution/TestRunnerService.js";
import { DomInspectorService } from "../services/dom/DomInspectorService.js";
import { SelfHealingService } from "../services/execution/SelfHealingService.js";
import { FileWriterService } from "../services/io/FileWriterService.js";
import { EnvManagerService } from "../services/config/EnvManagerService.js";
import { StagingService } from "../services/execution/StagingService.js";
import { ProjectSetupService } from "../services/setup/ProjectSetupService.js";
import { SuiteSummaryService } from "../services/analysis/SuiteSummaryService.js";
import { McpConfigService } from "../services/config/McpConfigService.js";
import { UserStoreService } from "../services/config/UserStoreService.js";
import { ProjectMaintenanceService } from "../services/setup/ProjectMaintenanceService.js";
import { SeleniumMigrationService } from "../services/generation/SeleniumMigrationService.js";
import { RefactoringService } from "../services/generation/RefactoringService.js";
import { FixtureDataService } from "../services/generation/FixtureDataService.js";
import { LearningService } from "../services/system/LearningService.js";
import { PipelineService } from "../services/generation/PipelineService.js";
import { PlaywrightSessionService } from "../services/execution/PlaywrightSessionService.js";
import { EnvironmentCheckService } from "../services/setup/EnvironmentCheckService.js";
import { LocatorAuditService } from "../services/audit/LocatorAuditService.js";
import { UtilAuditService } from "../services/audit/UtilAuditService.js";
import { CoverageAnalysisService } from "../services/analysis/CoverageAnalysisService.js";
import { BugReportService } from "../services/system/BugReportService.js";
import { DnaTrackerService } from "../services/execution/DnaTrackerService.js";
import { TraceAnalyzerService } from "../services/analysis/TraceAnalyzerService.js";
import { SandboxExecutionService } from "../services/execution/SandboxExecutionService.js";
import { TestContextGathererService } from "../services/dom/TestContextGathererService.js";
import { StructuralBrainService } from "../services/analysis/StructuralBrainService.js";
import { ContextManager } from "../services/system/ContextManager.js";
import { ObservabilityService } from "../services/analysis/ObservabilityService.js";
import { AnalyticsService } from "../services/system/AnalyticsService.js";
import { OrchestrationService } from "../services/system/OrchestrationService.js";
import { NavigationGraphService } from "../services/nav/NavigationGraphService.js";

type Factory<T> = (container: ServiceContainer) => T;

export class ServiceContainer {
  private factories: Map<string, Factory<any>> = new Map();
  private instances: Map<string, any> = new Map();
  private resolving: Set<string> = new Set();

  register<T>(name: string, factory: Factory<T>): void {
    this.factories.set(name, factory);
  }

  resolve<T>(name: string): T {
    if (this.instances.has(name)) {
      return this.instances.get(name);
    }

    const factory = this.factories.get(name);
    if (!factory) {
      throw new McpError(
        `Service not registered: ${name}`,
        McpErrorCode.PROJECT_VALIDATION_FAILED
      );
    }

    if (this.resolving.has(name)) {
      throw new McpError(
        `Circular dependency detected: ${Array.from(this.resolving).join(" -> ")} -> ${name}`,
        McpErrorCode.PROJECT_VALIDATION_FAILED
      );
    }

    this.resolving.add(name);
    try {
      const instance = factory(this);
      this.instances.set(name, instance);
      return instance;
    } finally {
      this.resolving.delete(name);
    }
  }

  /** Clears all cached singletons. Use for testing or deep resets. */
  reset(): void {
    this.instances.clear();
  }
}

export const container = new ServiceContainer();

// --- Register All Services ---

// Fundamental Services
container.register("mcpConfig", () => new McpConfigService());
container.register("envManager", () => new EnvManagerService());
container.register("fileWriter", () => new FileWriterService());
container.register("userStore", () => new UserStoreService());
container.register("learningService", () => new LearningService());
container.register("analytics", () => new AnalyticsService());
container.register("observability", () => ObservabilityService.getInstance());
container.register("contextManager", () => ContextManager.getInstance());

// Domain Services
container.register("analyzer", () => new CodebaseAnalyzerService());
container.register("generator", () => new TestGenerationService());
container.register("runner", () => new TestRunnerService());
container.register("domInspector", () => new DomInspectorService());
container.register("healer", () => new SelfHealingService());
container.register("projectSetup", () => new ProjectSetupService());
container.register("suiteSummary", () => new SuiteSummaryService());
container.register("maintenance", () => new ProjectMaintenanceService());
container.register("seleniumMigrator", () => new SeleniumMigrationService());
container.register("refactoring", () => new RefactoringService());
container.register("fixtureData", () => new FixtureDataService());
container.register("pipeline", () => new PipelineService());
container.register("session", () => new PlaywrightSessionService());
container.register("stagingService", () => new StagingService());
container.register("sandbox", () => new SandboxExecutionService());
container.register("envCheck", () => new EnvironmentCheckService());
container.register("locatorAudit", () => new LocatorAuditService());
container.register("utilAudit", () => new UtilAuditService());
container.register("coverageAnalysis", () => new CoverageAnalysisService());
container.register("bugReport", () => new BugReportService());
container.register("dnaTracker", () => new DnaTrackerService());
container.register("traceAnalyzer", () => new TraceAnalyzerService());
container.register("gatherer", () => new TestContextGathererService());
container.register("structuralBrain", () => StructuralBrainService.getInstance());
container.register("orchestrator", (c) => new OrchestrationService(
  c.resolve("fileWriter"),
  c.resolve("healer"),
  c.resolve("runner"),
  c.resolve("stagingService"),
  c.resolve("session"),
  c.resolve("learningService")
));

// Stateful Caches as Singletons
container.register("analysisCache", () => new Map<string, any>());
container.register("domInspectionCache", () => new Map<string, string>());
container.register("retrySessionMap", () => new Map<string, number>());
container.register("navGraphServices", () => new Map<string, NavigationGraphService>());
container.register("getNavService", (c) => {
  const map = c.resolve<Map<string, NavigationGraphService>>("navGraphServices");
  return (projectRoot: string) => {
    if (!map.has(projectRoot)) {
      map.set(projectRoot, new NavigationGraphService(projectRoot));
    }
    return map.get(projectRoot)!;
  };
});
