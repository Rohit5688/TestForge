# Graph Report - .  (2026-04-14)

## Corpus Check
- Large corpus: 231 files · ~199,694 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder, or use --no-semantic to run AST-only.

## Summary
- 555 nodes · 672 edges · 106 communities detected
- Extraction: 68% EXTRACTED · 32% INFERRED · 0% AMBIGUOUS · INFERRED: 218 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## God Nodes (most connected - your core abstractions)
1. `CodebaseAnalyzerService` - 19 edges
2. `NavigationGraphService` - 18 edges
3. `StructuralBrainService` - 14 edges
4. `EnvironmentCheckService` - 12 edges
5. `PreFlightService` - 12 edges
6. `MCPConnection` - 11 edges
7. `UserStoreService` - 11 edges
8. `ContextManager` - 10 edges
9. `ObservabilityService` - 10 edges
10. `ProjectSetupService` - 10 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Communities

### Community 0 - "Community 0"
Cohesion: 0.1
Nodes (16): ABC, create_connection(), MCPConnection, MCPConnectionHTTP, MCPConnectionSSE, MCPConnectionStdio, Lightweight connection handling for MCP servers., MCP connection using Streamable HTTP. (+8 more)

### Community 1 - "Community 1"
Cohesion: 0.27
Nodes (1): CodebaseAnalyzerService

### Community 2 - "Community 2"
Cohesion: 0.2
Nodes (1): NavigationGraphService

### Community 3 - "Community 3"
Cohesion: 0.14
Nodes (2): BasePage, JQueryDatePickerPage

### Community 4 - "Community 4"
Cohesion: 0.19
Nodes (1): StructuralBrainService

### Community 5 - "Community 5"
Cohesion: 0.22
Nodes (7): DeterministicVerifier, main(), parse_evaluation_file(), AppForge Deterministic Evaluation Harness  This script verifies the AppForge MCP, Returns (tool_name, args) for negative test scenarios., Helper to call a tool and catch the error message., Map task indices to specific programmatic checks.

### Community 6 - "Community 6"
Cohesion: 0.31
Nodes (1): EnvironmentCheckService

### Community 7 - "Community 7"
Cohesion: 0.24
Nodes (1): PreFlightService

### Community 8 - "Community 8"
Cohesion: 0.31
Nodes (2): detectApiKeyField(), UserStoreService

### Community 9 - "Community 9"
Cohesion: 0.26
Nodes (1): ProjectSetupService

### Community 10 - "Community 10"
Cohesion: 0.22
Nodes (1): ContextManager

### Community 11 - "Community 11"
Cohesion: 0.33
Nodes (1): ObservabilityService

### Community 12 - "Community 12"
Cohesion: 0.29
Nodes (1): SelfHealingService

### Community 13 - "Community 13"
Cohesion: 0.4
Nodes (1): DnaTrackerService

### Community 14 - "Community 14"
Cohesion: 0.33
Nodes (1): McpConfigService

### Community 15 - "Community 15"
Cohesion: 0.42
Nodes (1): EnvManagerService

### Community 16 - "Community 16"
Cohesion: 0.47
Nodes (5): capText(), collectNodes(), deriveSelector(), renderActionableMarkdown(), SmartDomExtractor

### Community 17 - "Community 17"
Cohesion: 0.43
Nodes (1): FileWriterService

### Community 18 - "Community 18"
Cohesion: 0.5
Nodes (1): LearningService

### Community 19 - "Community 19"
Cohesion: 0.43
Nodes (1): LocatorAuditService

### Community 20 - "Community 20"
Cohesion: 0.36
Nodes (4): isMcpError(), isRetryableError(), McpError, toMcpErrorResponse()

### Community 21 - "Community 21"
Cohesion: 0.32
Nodes (1): ShellSecurityEngine

### Community 22 - "Community 22"
Cohesion: 0.36
Nodes (1): StringMatcher

### Community 23 - "Community 23"
Cohesion: 0.38
Nodes (1): PlaywrightSessionService

### Community 24 - "Community 24"
Cohesion: 0.48
Nodes (4): classifyError(), ErrorDistiller, extractSelector(), extractStep()

### Community 25 - "Community 25"
Cohesion: 0.48
Nodes (1): FileSuggester

### Community 26 - "Community 26"
Cohesion: 0.33
Nodes (1): AjaxToolkitPage

### Community 27 - "Community 27"
Cohesion: 0.4
Nodes (1): JQuerySortablePage

### Community 28 - "Community 28"
Cohesion: 0.33
Nodes (2): DashboardPage, LoginPage

### Community 29 - "Community 29"
Cohesion: 0.47
Nodes (1): FileStateService

### Community 30 - "Community 30"
Cohesion: 0.53
Nodes (1): HybridPromptEngine

### Community 31 - "Community 31"
Cohesion: 0.47
Nodes (1): ProjectMaintenanceService

### Community 32 - "Community 32"
Cohesion: 0.53
Nodes (1): SuiteSummaryService

### Community 33 - "Community 33"
Cohesion: 0.33
Nodes (1): Metrics

### Community 34 - "Community 34"
Cohesion: 0.33
Nodes (0): 

### Community 35 - "Community 35"
Cohesion: 0.4
Nodes (1): EcommerceHomePage

### Community 36 - "Community 36"
Cohesion: 0.4
Nodes (1): EcommerceProductPage

### Community 37 - "Community 37"
Cohesion: 0.4
Nodes (1): GooglePage

### Community 38 - "Community 38"
Cohesion: 0.4
Nodes (1): SauceDemoPage

### Community 39 - "Community 39"
Cohesion: 0.4
Nodes (1): ServiceContainer

### Community 40 - "Community 40"
Cohesion: 0.4
Nodes (1): AnalyticsService

### Community 41 - "Community 41"
Cohesion: 0.6
Nodes (1): BugReportService

### Community 42 - "Community 42"
Cohesion: 0.4
Nodes (1): OrchestrationService

### Community 43 - "Community 43"
Cohesion: 0.6
Nodes (3): createSafeConsole(), executeSandbox(), validateScript()

### Community 44 - "Community 44"
Cohesion: 0.6
Nodes (1): TestGenerationService

### Community 45 - "Community 45"
Cohesion: 0.6
Nodes (1): UtilAuditService

### Community 46 - "Community 46"
Cohesion: 0.6
Nodes (1): FileGuard

### Community 47 - "Community 47"
Cohesion: 0.5
Nodes (1): HeuristicMatcher

### Community 48 - "Community 48"
Cohesion: 0.4
Nodes (2): ClarificationRequired, Questioner

### Community 49 - "Community 49"
Cohesion: 0.5
Nodes (1): RequestTracer

### Community 50 - "Community 50"
Cohesion: 0.6
Nodes (3): isTransientError(), sleep(), withRetry()

### Community 51 - "Community 51"
Cohesion: 0.5
Nodes (0): 

### Community 52 - "Community 52"
Cohesion: 0.5
Nodes (1): CoverageAnalysisService

### Community 53 - "Community 53"
Cohesion: 0.5
Nodes (1): DependencyService

### Community 54 - "Community 54"
Cohesion: 0.5
Nodes (1): FewShotLibrary

### Community 55 - "Community 55"
Cohesion: 0.5
Nodes (1): SeleniumMigrationService

### Community 56 - "Community 56"
Cohesion: 0.67
Nodes (1): StagingService

### Community 57 - "Community 57"
Cohesion: 0.5
Nodes (1): TestRunnerService

### Community 58 - "Community 58"
Cohesion: 0.67
Nodes (1): ErrorClassifier

### Community 59 - "Community 59"
Cohesion: 0.67
Nodes (1): ScreenshotStorage

### Community 60 - "Community 60"
Cohesion: 0.5
Nodes (1): TsConfigManager

### Community 61 - "Community 61"
Cohesion: 1.0
Nodes (2): main(), schemaToZod()

### Community 62 - "Community 62"
Cohesion: 0.67
Nodes (1): EcommerceCartPage

### Community 63 - "Community 63"
Cohesion: 0.67
Nodes (1): EcommerceCategoryPage

### Community 64 - "Community 64"
Cohesion: 0.67
Nodes (1): EcommerceCheckoutPage

### Community 65 - "Community 65"
Cohesion: 0.67
Nodes (1): DomInspectorService

### Community 66 - "Community 66"
Cohesion: 0.67
Nodes (1): FixtureDataService

### Community 67 - "Community 67"
Cohesion: 0.67
Nodes (1): PipelineService

### Community 68 - "Community 68"
Cohesion: 0.67
Nodes (1): RefactoringService

### Community 69 - "Community 69"
Cohesion: 0.67
Nodes (1): ASTScrutinizer

### Community 70 - "Community 70"
Cohesion: 0.67
Nodes (1): ExtensionLoader

### Community 71 - "Community 71"
Cohesion: 0.67
Nodes (1): JsonToPomTranspiler

### Community 72 - "Community 72"
Cohesion: 0.67
Nodes (0): 

### Community 73 - "Community 73"
Cohesion: 1.0
Nodes (0): 

### Community 74 - "Community 74"
Cohesion: 1.0
Nodes (0): 

### Community 75 - "Community 75"
Cohesion: 1.0
Nodes (1): CodebaseAnalyzerService

### Community 76 - "Community 76"
Cohesion: 1.0
Nodes (1): DomInspectorService

### Community 77 - "Community 77"
Cohesion: 1.0
Nodes (1): FileWriterService

### Community 78 - "Community 78"
Cohesion: 1.0
Nodes (1): SelfHealingService

### Community 79 - "Community 79"
Cohesion: 1.0
Nodes (1): TestGenerationService

### Community 80 - "Community 80"
Cohesion: 1.0
Nodes (1): TestRunnerService

### Community 81 - "Community 81"
Cohesion: 1.0
Nodes (0): 

### Community 82 - "Community 82"
Cohesion: 1.0
Nodes (0): 

### Community 83 - "Community 83"
Cohesion: 1.0
Nodes (0): 

### Community 84 - "Community 84"
Cohesion: 1.0
Nodes (0): 

### Community 85 - "Community 85"
Cohesion: 1.0
Nodes (0): 

### Community 86 - "Community 86"
Cohesion: 1.0
Nodes (0): 

### Community 87 - "Community 87"
Cohesion: 1.0
Nodes (0): 

### Community 88 - "Community 88"
Cohesion: 1.0
Nodes (0): 

### Community 89 - "Community 89"
Cohesion: 1.0
Nodes (0): 

### Community 90 - "Community 90"
Cohesion: 1.0
Nodes (0): 

### Community 91 - "Community 91"
Cohesion: 1.0
Nodes (1): Create the connection context based on connection type.

### Community 92 - "Community 92"
Cohesion: 1.0
Nodes (0): 

### Community 93 - "Community 93"
Cohesion: 1.0
Nodes (0): 

### Community 94 - "Community 94"
Cohesion: 1.0
Nodes (0): 

### Community 95 - "Community 95"
Cohesion: 1.0
Nodes (0): 

### Community 96 - "Community 96"
Cohesion: 1.0
Nodes (0): 

### Community 97 - "Community 97"
Cohesion: 1.0
Nodes (0): 

### Community 98 - "Community 98"
Cohesion: 1.0
Nodes (0): 

### Community 99 - "Community 99"
Cohesion: 1.0
Nodes (0): 

### Community 100 - "Community 100"
Cohesion: 1.0
Nodes (0): 

### Community 101 - "Community 101"
Cohesion: 1.0
Nodes (0): 

### Community 102 - "Community 102"
Cohesion: 1.0
Nodes (0): 

### Community 103 - "Community 103"
Cohesion: 1.0
Nodes (0): 

### Community 104 - "Community 104"
Cohesion: 1.0
Nodes (0): 

### Community 105 - "Community 105"
Cohesion: 1.0
Nodes (0): 

## Knowledge Gaps
- **21 isolated node(s):** `Lightweight connection handling for MCP servers.`, `Base class for MCP server connections.`, `Create the connection context based on connection type.`, `Initialize MCP server connection.`, `Clean up MCP server connection resources.` (+16 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 73`** (2 nodes): `test_client.js`, `main()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 74`** (2 nodes): `user-helper.ts`, `getUser()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 75`** (2 nodes): `CodebaseAnalyzerService.d.ts`, `CodebaseAnalyzerService`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 76`** (2 nodes): `DomInspectorService.d.ts`, `DomInspectorService`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 77`** (2 nodes): `FileWriterService.d.ts`, `FileWriterService`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 78`** (2 nodes): `SelfHealingService.d.ts`, `SelfHealingService`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 79`** (2 nodes): `TestGenerationService.d.ts`, `TestGenerationService`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 80`** (2 nodes): `TestRunnerService.d.ts`, `TestRunnerService`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 81`** (1 nodes): `migrated_tools.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 82`** (1 nodes): `patch_descriptions.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 83`** (1 nodes): `playwright.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 84`** (1 nodes): `ajax-toolkit.steps.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 85`** (1 nodes): `datepicker.steps.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 86`** (1 nodes): `jquery-sortable.steps.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 87`** (1 nodes): `login.steps.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 88`** (1 nodes): `purchaseFlow.steps.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 89`** (1 nodes): `saucedemo.steps.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 90`** (1 nodes): `fix_index.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 91`** (1 nodes): `Create the connection context based on connection type.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 92`** (1 nodes): `index.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 93`** (1 nodes): `ICodebaseAnalyzer.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 94`** (1 nodes): `ICodebaseAnalyzer.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 95`** (1 nodes): `IDomInspector.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 96`** (1 nodes): `IDomInspector.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 97`** (1 nodes): `ITestGenerator.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 98`** (1 nodes): `ITestGenerator.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 99`** (1 nodes): `ITestRunner.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 100`** (1 nodes): `ITestRunner.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 101`** (1 nodes): `CodebaseAnalyzerService.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 102`** (1 nodes): `ExtensionLoader.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 103`** (1 nodes): `LocatorAuditService.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 104`** (1 nodes): `SandboxEngine.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 105`** (1 nodes): `SecurityUtils.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What connects `Lightweight connection handling for MCP servers.`, `Base class for MCP server connections.`, `Create the connection context based on connection type.` to the rest of the system?**
  _21 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.14 - nodes in this community are weakly interconnected._