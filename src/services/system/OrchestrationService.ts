import { FileWriterService } from '../io/FileWriterService.js';
import { SelfHealingService } from '../execution/SelfHealingService.js';
import { StagingService } from '../execution/StagingService.js';
import { PlaywrightSessionService } from '../execution/PlaywrightSessionService.js';
import { LearningService } from './LearningService.js';
import { TestRunnerService } from '../execution/TestRunnerService.js';
import { McpErrors } from '../../types/ErrorSystem.js';

export interface GeneratedFile {
  path: string;
  content: string;
}

export class OrchestrationService {
  constructor(
    private readonly writerService: FileWriterService,
    private readonly healingService: SelfHealingService,
    private readonly runnerService: TestRunnerService,
    private readonly stagingService: StagingService,
    private readonly sessionService: PlaywrightSessionService,
    private readonly learningService: LearningService
  ) {}

  /**
   * WORKFLOW ORCHESTRATOR: Validate -> Write test files in one atomic call.
   */
  public async createTestAtomically(
    projectRoot: string,
    files: GeneratedFile[]
  ): Promise<{ success: boolean; filesWritten: string[] }> {
    // Stage and validate atomically
    await this.stagingService.stageAndValidate(projectRoot, files);

    // Write verified files to disk using the typed FileWriterService.writeFiles API.
    // FileWriterService.writeFiles returns { written: string[], warnings: string[] }.
    const writeResult = this.writerService.writeFiles(projectRoot, files, false);

    return {
      success: true,
      filesWritten: writeResult.written,
    };
  }

  /**
   * WORKFLOW ORCHESTRATOR: Self-heal -> Verify -> Learn in one atomic call.
   */
  public async healAndVerifyAtomically(
    projectRoot: string,
    error: string,
    xml: string, // in TestForge xml usually means pageUrl or DOM, but we keep signature to match AppForge MCP requirements exactly
    oldSelector?: string,
    candidateSelector?: string // extra param for testforge flow
  ): Promise<{ healedSelector: string; verified: boolean; learned: boolean; confidence: number }> {
    if (!candidateSelector) {
        throw McpErrors.invalidParameter('candidateSelector', 'Must provide candidateSelector in TestForge Orchestration', 'heal_and_verify_atomically');
    }

    // Verify candidate via active session
    const verificationStr = await this.sessionService.verifySelector(candidateSelector);
    let verification: any;
    try {
      verification = JSON.parse(verificationStr);
    } catch {
      throw McpErrors.projectValidationFailed(`Failed to parse verification result for ${projectRoot}`, 'heal_and_verify_atomically');
    }

    if (!verification.success || !verification.verified) {
      return {
        healedSelector: candidateSelector,
        verified: false,
        learned: false,
        confidence: 0,
      };
    }

    // Auto-learn fix
    let learned = false;
    if (oldSelector) {
      this.learningService.learn(
        projectRoot,
        `Selector Failure: \`${oldSelector}\``,
        `Replacement: \`${candidateSelector}\``,
        ['auto_healed']
      );
      learned = true;
    }

    return {
      healedSelector: candidateSelector,
      verified: true,
      learned,
      confidence: 0.9
    };
  }

  /**
   * INTEGRATED WORKFLOW: Write -> Run -> Heal.
   * This is the heart of autonomous test generation and repair.
   */
  public async executeAtomicWorkflow(
    projectRoot: string,
    files: GeneratedFile[],
    options: { runTests?: boolean; selfHealAttempts?: number; pageUrl?: string } = {}
  ): Promise<{ 
    success: boolean; 
    filesWritten: string[]; 
    testOutput?: string;
    healingAnalysis?: any;
  }> {
    // 1. Stage and Validate (throws on syntax/logic errors)
    await this.stagingService.stageAndValidate(projectRoot, files);

    // 2. Write validated files to disk
    const writeResult = this.writerService.writeFiles(projectRoot, files, false);

    if (!options.runTests) {
      return {
        success: true,
        filesWritten: writeResult.written
      };
    }

    // 3. Run the tests
    const runResult = await this.runnerService.runTests(projectRoot);

    if (runResult.passed) {
      return {
        success: true,
        filesWritten: writeResult.written,
        testOutput: runResult.output
      };
    }

    // 4. If failed, analyze for healing
    // Note: We don't loop here; we return the instruction to allow the LLM to decide the next fix turn.
    const analysis = this.healingService.analyzeFailure(runResult.output, '', 'default', projectRoot);

    return {
      success: false,
      filesWritten: writeResult.written,
      testOutput: runResult.output,
      healingAnalysis: analysis
    };
  }
}
