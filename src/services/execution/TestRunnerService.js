import { exec } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);
export class TestRunnerService {
    async runTests(projectRoot, specificTestArgs) {
        try {
            const command = `npx bddgen && npx playwright test ${specificTestArgs ? specificTestArgs : ''}`;
            const { stdout, stderr } = await execAsync(command, { cwd: projectRoot });
            return {
                passed: true,
                output: `[SUCCESS] Tests passed!\n\nStandard Output:\n${stdout}\n\nStandard Error:\n${stderr}`
            };
        }
        catch (error) {
            // In JS, exec throws if exit code is not 0, which happens on test failures.
            return {
                passed: false,
                output: `[FAILED] Tests failed or failed to compile.\n\nCommand Error:\n${error.message}\n\nStandard Output:\n${error.stdout || ''}\n\nStandard Error:\n${error.stderr || ''}`
            };
        }
    }
}
//# sourceMappingURL=TestRunnerService.js.map