# Graph Report - .  (2026-04-19)

## Corpus Check
- Large corpus: 301 files · ~558,982 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder, or use --no-semantic to run AST-only.

## Summary
- 448 nodes · 596 edges · 66 communities detected
- Extraction: 64% EXTRACTED · 36% INFERRED · 0% AMBIGUOUS · INFERRED: 214 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## God Nodes (most connected - your core abstractions)
1. `NavigationGraphService` - 18 edges
2. `StructuralBrainService` - 14 edges
3. `EnvironmentCheckService` - 12 edges
4. `PreFlightService` - 12 edges
5. `TraceAnalyzerService` - 12 edges
6. `ContextManager` - 11 edges
7. `ObservabilityService` - 11 edges
8. `UserStoreService` - 11 edges
9. `CodebaseAnalyzerService` - 10 edges
10. `ProjectSetupService` - 10 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Communities

### Community 0 - "Community 0"
Cohesion: 0.2
Nodes (1): NavigationGraphService

### Community 1 - "Community 1"
Cohesion: 0.19
Nodes (1): StructuralBrainService

### Community 2 - "Community 2"
Cohesion: 0.31
Nodes (1): EnvironmentCheckService

### Community 3 - "Community 3"
Cohesion: 0.24
Nodes (1): PreFlightService

### Community 4 - "Community 4"
Cohesion: 0.28
Nodes (1): TraceAnalyzerService

### Community 5 - "Community 5"
Cohesion: 0.31
Nodes (2): detectApiKeyField(), UserStoreService

### Community 6 - "Community 6"
Cohesion: 0.2
Nodes (1): ContextManager

### Community 7 - "Community 7"
Cohesion: 0.3
Nodes (1): ObservabilityService

### Community 8 - "Community 8"
Cohesion: 0.26
Nodes (1): ProjectSetupService

### Community 9 - "Community 9"
Cohesion: 0.36
Nodes (6): capText(), collectNodes(), deriveSelector(), isDecorativeContainer(), renderActionableMarkdown(), SmartDomExtractor

### Community 10 - "Community 10"
Cohesion: 0.35
Nodes (1): CodebaseAnalyzerService

### Community 11 - "Community 11"
Cohesion: 0.29
Nodes (1): SelfHealingService

### Community 12 - "Community 12"
Cohesion: 0.44
Nodes (1): WrapperIntrospectService

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
Cohesion: 0.36
Nodes (1): LocatorAuditService

### Community 17 - "Community 17"
Cohesion: 0.43
Nodes (1): FileWriterService

### Community 18 - "Community 18"
Cohesion: 0.5
Nodes (1): LearningService

### Community 19 - "Community 19"
Cohesion: 0.46
Nodes (1): TestContextGathererService

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
Cohesion: 0.4
Nodes (1): DependencyService

### Community 27 - "Community 27"
Cohesion: 0.47
Nodes (1): FileStateService

### Community 28 - "Community 28"
Cohesion: 0.53
Nodes (1): HybridPromptEngine

### Community 29 - "Community 29"
Cohesion: 0.47
Nodes (1): ProjectMaintenanceService

### Community 30 - "Community 30"
Cohesion: 0.53
Nodes (1): SuiteSummaryService

### Community 31 - "Community 31"
Cohesion: 0.33
Nodes (1): ASTScrutinizer

### Community 32 - "Community 32"
Cohesion: 0.33
Nodes (1): Metrics

### Community 33 - "Community 33"
Cohesion: 0.33
Nodes (0): 

### Community 34 - "Community 34"
Cohesion: 0.4
Nodes (1): ServiceContainer

### Community 35 - "Community 35"
Cohesion: 0.4
Nodes (1): AnalyticsService

### Community 36 - "Community 36"
Cohesion: 0.6
Nodes (1): BugReportService

### Community 37 - "Community 37"
Cohesion: 0.4
Nodes (1): OrchestrationService

### Community 38 - "Community 38"
Cohesion: 0.6
Nodes (3): createSafeConsole(), executeSandbox(), validateScript()

### Community 39 - "Community 39"
Cohesion: 0.6
Nodes (1): StagingService

### Community 40 - "Community 40"
Cohesion: 0.6
Nodes (1): TestGenerationService

### Community 41 - "Community 41"
Cohesion: 0.6
Nodes (1): UtilAuditService

### Community 42 - "Community 42"
Cohesion: 0.6
Nodes (1): FileGuard

### Community 43 - "Community 43"
Cohesion: 0.5
Nodes (1): HeuristicMatcher

### Community 44 - "Community 44"
Cohesion: 0.4
Nodes (2): ClarificationRequired, Questioner

### Community 45 - "Community 45"
Cohesion: 0.5
Nodes (1): RequestTracer

### Community 46 - "Community 46"
Cohesion: 0.6
Nodes (3): isTransientError(), sleep(), withRetry()

### Community 47 - "Community 47"
Cohesion: 0.5
Nodes (0): 

### Community 48 - "Community 48"
Cohesion: 0.5
Nodes (1): CoverageAnalysisService

### Community 49 - "Community 49"
Cohesion: 0.5
Nodes (1): FewShotLibrary

### Community 50 - "Community 50"
Cohesion: 0.5
Nodes (1): SeleniumMigrationService

### Community 51 - "Community 51"
Cohesion: 0.5
Nodes (1): TestRunnerService

### Community 52 - "Community 52"
Cohesion: 0.67
Nodes (1): ErrorClassifier

### Community 53 - "Community 53"
Cohesion: 0.5
Nodes (1): JsonToStepsTranspiler

### Community 54 - "Community 54"
Cohesion: 0.67
Nodes (1): ScreenshotStorage

### Community 55 - "Community 55"
Cohesion: 0.5
Nodes (1): TsConfigManager

### Community 56 - "Community 56"
Cohesion: 0.67
Nodes (1): DomInspectorService

### Community 57 - "Community 57"
Cohesion: 0.67
Nodes (1): FixtureDataService

### Community 58 - "Community 58"
Cohesion: 0.67
Nodes (1): PipelineService

### Community 59 - "Community 59"
Cohesion: 0.67
Nodes (1): RefactoringService

### Community 60 - "Community 60"
Cohesion: 0.67
Nodes (1): ExtensionLoader

### Community 61 - "Community 61"
Cohesion: 0.67
Nodes (1): JsonToPomTranspiler

### Community 62 - "Community 62"
Cohesion: 0.67
Nodes (0): 

### Community 63 - "Community 63"
Cohesion: 1.0
Nodes (0): 

### Community 64 - "Community 64"
Cohesion: 1.0
Nodes (0): 

### Community 65 - "Community 65"
Cohesion: 1.0
Nodes (0): 

## Knowledge Gaps
- **Thin community `Community 63`** (2 nodes): `PageObjectLinter.ts`, `lintPageObject()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 64`** (1 nodes): `TestContext.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 65`** (1 nodes): `config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Not enough signal to generate questions. This usually means the corpus has no AMBIGUOUS edges, no bridge nodes, no INFERRED relationships, and all communities are tightly cohesive. Add more files or run with --mode deep to extract richer edges._