import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ServiceContainer } from "../container/ServiceContainer.js";

// Maintenance Tools
import { registerRepairProject } from "./repair_project.js";
import { registerUpgradeProject } from "./upgrade_project.js";
import { registerSetupProject } from "./setup_project.js";
import { registerCheckPlaywrightReady } from "./check_playwright_ready.js";
import { registerManageEnv } from "./manage_env.js";
import { registerManageConfig } from "./manage_config.js";
import { registerManageUsers } from "./manage_users.js";
import { registerCheckEnvironment } from "./check_environment.js";

// Inspection Tools
import { registerInspectPageDom } from "./inspect_page_dom.js";
import { registerGatherTestContext } from "./gather_test_context.js";
import { registerDiscoverAppFlow } from "./discover_app_flow.js";
import { registerStartSession } from "./start_session.js";
import { registerNavigateSession } from "./navigate_session.js";
import { registerGetProjectContract } from "./get_project_contract.js";
import { registerListExistingSteps } from "./list_existing_steps.js";

// Generation Tools
import { registerGenerateGherkinPomTestSuite } from "./generate_gherkin_pom_test_suite.js";
import { registerMigrateTest } from "./migrate_test.js";
import { registerGenerateTestDataFactory } from "./generate_test_data_factory.js";

// Execution & Maintenance Tools
import { registerValidateAndWrite } from "./validate_and_write.js";
import { registerRunPlaywrightTest } from "./run_playwright_test.js";
import { registerUpdateVisualBaselines } from "./update_visual_baselines.js";
import { registerSummarizeSuite } from "./summarize_suite.js";

// Analysis Tools
import { registerAnalyzeCodebase } from "./analyze_codebase.js";
import { registerExecuteSandboxCode } from "./execute_sandbox_code.js";
import { registerAuditLocators } from "./audit_locators.js";
import { registerAuditUtils } from "./audit_utils.js";
import { registerAnalyzeCoverage } from "./analyze_coverage.js";
import { registerAnalyzeCoverageGaps } from "./analyze_coverage_gaps.js";
import { registerAnalyzeTrace } from "./analyze_trace.js";
import { registerGetFlakySelectors } from "./get_flaky_selectors.js";

// Healing & Learning Tools
import { registerSelfHealTest } from "./self_heal_test.js";
import { registerVerifySelector } from "./verify_selector.js";
import { registerHealAndVerifyAtomically } from "./heal_and_verify_atomically.js";
import { registerTrainOnExample } from "./train_on_example.js";
import { registerExportTeamKnowledge } from "./export_team_knowledge.js";

// Meta & Viz Tools
import { registerExportNavigationMap } from "./export_navigation_map.js";
import { registerWorkflowGuide } from "./workflow_guide.js";
import { registerGetTokenBudget } from "./get_token_budget.js";
import { registerGetSystemState } from "./get_system_state.js";
import { registerScanStructuralBrain } from "./scan_structural_brain.js";

// Recovered Tools
import { registerSuggestRefactorings } from "./suggest_refactorings.js";
import { registerRequestUserClarification } from "./request_user_clarification.js";
import { registerGenerateCiPipeline } from "./generate_ci_pipeline.js";
import { registerExportJiraBug } from "./export_jira_bug.js";
import { registerCreateTestAtomically } from "./create_test_atomically.js";
import { registerExportBugReport } from "./export_bug_report.js";

export function registerAllTools(server: McpServer, container: ServiceContainer) {
  // Maintenance
  registerRepairProject(server, container);
  registerUpgradeProject(server, container);
  registerSetupProject(server, container);
  registerCheckPlaywrightReady(server, container);
  registerManageEnv(server, container);
  registerManageConfig(server, container);
  registerManageUsers(server, container);
  registerCheckEnvironment(server, container);

  // Inspection
  registerInspectPageDom(server, container);
  registerGatherTestContext(server, container);
  registerDiscoverAppFlow(server, container);
  registerStartSession(server, container);
  registerNavigateSession(server, container);
  registerGetProjectContract(server, container);
  registerListExistingSteps(server, container);

  // Generation
  registerGenerateGherkinPomTestSuite(server, container);
  registerMigrateTest(server, container);
  registerGenerateTestDataFactory(server, container);

  // Execution
  registerValidateAndWrite(server, container);
  registerRunPlaywrightTest(server, container);
  registerUpdateVisualBaselines(server, container);
  registerSummarizeSuite(server, container);

  // Analysis
  registerAnalyzeCodebase(server, container);
  registerExecuteSandboxCode(server, container);
  registerAuditLocators(server, container);
  registerAuditUtils(server, container);
  registerAnalyzeCoverage(server, container);
  registerAnalyzeCoverageGaps(server, container);
  registerAnalyzeTrace(server, container);
  registerGetFlakySelectors(server, container);

  // Healing
  registerSelfHealTest(server, container);
  registerVerifySelector(server, container);
  registerHealAndVerifyAtomically(server, container);
  registerTrainOnExample(server, container);
  registerExportTeamKnowledge(server, container);

  // Meta
  registerExportNavigationMap(server, container);
  registerWorkflowGuide(server, container);
  registerGetTokenBudget(server, container);
  registerGetSystemState(server, container);
  registerScanStructuralBrain(server);

  // Recovered Tools
  registerSuggestRefactorings(server, container);
  registerRequestUserClarification(server, container);
  registerGenerateCiPipeline(server, container);
  registerExportJiraBug(server, container);
  registerCreateTestAtomically(server, container);
  registerExportBugReport(server, container);
}
