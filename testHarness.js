import { ServiceContainer } from "./dist/container/ServiceContainer.js";
import { registerAllTools } from "./dist/tools/toolRegistry.js";
import { McpConfigService } from "./dist/services/McpConfigService.js";
import { EnvManagerService } from "./dist/services/EnvManagerService.js";
import { FileWriterService } from "./dist/services/FileWriterService.js";
import { UserStoreService } from "./dist/services/UserStoreService.js";
import { LearningService } from "./dist/services/LearningService.js";
import { AnalyticsService } from "./dist/services/AnalyticsService.js";
import { ObservabilityService } from "./dist/services/ObservabilityService.js";
import { ContextManager } from "./dist/services/ContextManager.js";
import { CodebaseAnalyzerService } from "./dist/services/CodebaseAnalyzerService.js";
import { TestGenerationService } from "./dist/services/TestGenerationService.js";
import { TestRunnerService } from "./dist/services/TestRunnerService.js";
import { DomInspectorService } from "./dist/services/DomInspectorService.js";
import { SelfHealingService } from "./dist/services/SelfHealingService.js";
import { ProjectSetupService } from "./dist/services/ProjectSetupService.js";
import { SuiteSummaryService } from "./dist/services/SuiteSummaryService.js";
import { ProjectMaintenanceService } from "./dist/services/ProjectMaintenanceService.js";
import { SeleniumMigrationService } from "./dist/services/SeleniumMigrationService.js";
import { RefactoringService } from "./dist/services/RefactoringService.js";
import { FixtureDataService } from "./dist/services/FixtureDataService.js";
import { PipelineService } from "./dist/services/PipelineService.js";
import { PlaywrightSessionService } from "./dist/services/PlaywrightSessionService.js";
import { StagingService } from "./dist/services/StagingService.js";
import { SandboxExecutionService } from "./dist/services/SandboxExecutionService.js";
import { EnvironmentCheckService } from "./dist/services/EnvironmentCheckService.js";
import { LocatorAuditService } from "./dist/services/LocatorAuditService.js";
import { UtilAuditService } from "./dist/services/UtilAuditService.js";
import { CoverageAnalysisService } from "./dist/services/CoverageAnalysisService.js";
import { BugReportService } from "./dist/services/BugReportService.js";
import { DnaTrackerService } from "./dist/services/DnaTrackerService.js";
import { TraceAnalyzerService } from "./dist/services/TraceAnalyzerService.js";
import { TestContextGathererService } from "./dist/services/TestContextGathererService.js";
import { StructuralBrainService } from "./dist/services/StructuralBrainService.js";
import { OrchestrationService } from "./dist/services/OrchestrationService.js";
import { NavigationGraphService } from "./dist/services/NavigationGraphService.js";

const container = new ServiceContainer();

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
container.register("analysisCache", () => new Map());
container.register("domInspectionCache", () => new Map());
container.register("retrySessionMap", () => new Map());
container.register("navGraphServices", () => new Map());
container.register("getNavService", (c) => {
  const map = c.resolve("navGraphServices");
  return (projectRoot) => {
    if (!map.has(projectRoot)) {
      map.set(projectRoot, new NavigationGraphService(projectRoot));
    }
    return map.get(projectRoot);
  };
});


const handlers = {};
const mockServer = {
  registerTool(name, schema, handler) {
    handlers[name] = handler;
  }
};

try {
  registerAllTools(mockServer, container);
} catch (e) {
  console.log("Error during registration:", e.message);
}

const dummyArgs = {
  projectRoot: process.cwd(),
  url: "http://localhost:3000",
  startUrl: "http://localhost:3000",
  testDescription: "Login test",
  error: "TimeoutError",
  xml: "<html></html>",
  candidateSelector: "button",
  question: "What should I do?",
  context: "I am stuck",
  issuePattern: "bad_locator",
  solution: "use text",
  provider: "github",
  runOnPush: true,
  action: "read",
  operation: "read",
  script: "return 1;",
  selector: "button",
  baseUrl: "http://localhost",
  paths: ["/"],
  testName: "test",
  rawError: "error",
  entityName: "User",
  schemaDefinition: "{}",
  generatedFiles: []
};

async function testTools() {
  console.log("Registered Tools count:", Object.keys(handlers).length);
  for (const [name, handler] of Object.entries(handlers)) {
    try {
      await handler(dummyArgs, {});
      console.log("[PASS] " + name + " (completed gracefully without crash)");
    } catch (err) {
      if (err.message && (
        err.message.includes("is not a function") || 
        err.message.includes("Cannot read properties of undefined") ||
        err.message.includes("Service not registered")
      )) {
        console.log("[BUG] " + name + ": " + err.message);
      } else {
        console.log("[OK] " + name + ": threw domain error gracefully (" + err.message.split('\n')[0].substring(0, 50) + ")");
      }
    }
  }
}

testTools();
