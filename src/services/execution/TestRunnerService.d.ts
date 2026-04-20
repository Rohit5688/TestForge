import type { ITestRunner, TestRunnerResult } from '../interfaces/ITestRunner.js';
export declare class TestRunnerService implements ITestRunner {
    runTests(projectRoot: string, specificTestArgs?: string): Promise<TestRunnerResult>;
}
//# sourceMappingURL=TestRunnerService.d.ts.map