export interface TestRunnerResult {
  passed: boolean;
  output: string;
}

export interface TestRunFilters {
  tags?: string;
  featurePaths?: string[];
}

export interface ITestRunner {
  /**
   * Executes the Playwright-BDD test suite and returns the console output
   * to verify if the generated tests compile and pass.
   *
   * @param projectRoot - Absolute path to the test project
   * @param specificTestArgs - Optional Playwright CLI arguments (e.g., --grep @smoke)
   * @param timeoutMs - Optional per-run shell timeout in milliseconds (default: 120000)
   * @param executionCommand - Optional custom execution command (e.g., "yarn test")
   * @param filters - Optional source filters to apply to bddgen before Playwright runs
   */
  runTests(projectRoot: string, specificTestArgs?: string, timeoutMs?: number, executionCommand?: string, filters?: TestRunFilters): Promise<TestRunnerResult>;
}
