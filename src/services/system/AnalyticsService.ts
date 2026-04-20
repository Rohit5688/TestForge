import fs from 'fs';
import path from 'path';

export class AnalyticsService {
  /**
   * Generates a strict system prompt for Root Cause Analysis of a test failure.
   */
  public generateRcaPrompt(errorMessage: string): string {
    return `
You are an expert Playwright SDET conducting a Root Cause Analysis (RCA).
Your task is to analyze the provided test failure log, explain precisely WHY it failed to the user in plain English, and provide the EXACT code snippet required to fix the test or application.

### 🛑 CRITICAL INSTRUCTIONS
1. **Be Concise**: Do not write an essay. Provide a 1-2 sentence diagnosis of the core failure.
2. **Identify the Layer**: State clearly whether this is a **Test Scripting Error** (e.g. bad locator, missing await, timeout) or an **Application Bug** (e.g. 500 server error, button actually missing).
3. **Actionable Fix**: Provide a \`diff\` or rewritten code block showing how to fix the issue.

### 🚨 FAILURE LOG
\`\`\`
${errorMessage}
\`\`\`

Return your response formatted in Markdown.
`;
  }

  /**
   * Reads lcov.info or coverage metrics and generates a strict system prompt
   * instructing the LLM to write missing test vectors.
   */
  public analyzeCoverageGaps(projectRoot: string): string {
    // Look for Istanbul lcov report
    const lcovPath = path.join(projectRoot, 'coverage', 'lcov.info');
    let coverageData = "No coverage report found. Instruct the user to run their tests with NYA/V8 coverage enabled (e.g., npx playwright test --coverage).";

    if (fs.existsSync(lcovPath)) {
      coverageData = fs.readFileSync(lcovPath, 'utf8');
      // Truncate to avoid context window explosion if huge
      if (coverageData.length > 20000) {
        coverageData = coverageData.substring(0, 20000) + '\n... [TRUNCATED]';
      }
    }

    return `
You are an expert Playwright-BDD SDET focusing on Test Coverage.
Your task is to analyze the provided LCOV/Coverage data and identify exactly which lines or branches of the application are UNTESTED.

### 🛑 CRITICAL INSTRUCTIONS
1. **Highlight Gaps**: List the top 3 most critical untested files/lines based on the coverage snippet.
2. **Generate Missing Scenarios**: For each gap, write the missing Playwright-BDD \`.feature\` Scenario (Given/When/Then) that would successfully execute those missing lines.
3. **Code Quality**: Ensure the generated Scenarios adhere to the project's existing step definition vocabulary where possible.

### 🔍 COVERAGE DATA
\`\`\`
${coverageData}
\`\`\`

Return your response formatted in Markdown, putting the proposed Scenarios in code blocks.
`;
  }

  /**
   * Generates a bug report for Jira/Linear export.
   */
  public generateJiraBugPrompt(testName: string, rawError: string): string {
    return `
You are an expert QA Automation Engineer.
Your task is to convert the following Playwright test failure into a professional, correctly formatted Jira/Linear bug report in Markdown.

### 🛑 CRITICAL INSTRUCTIONS
1. **Title**: Write a clear, concise bug title.
2. **Environment**: Put placeholders for Environment, Browser, and OS.
3. **Steps to Reproduce**: Infer the steps leading up to the failure from the test name and error stack trace.
4. **Expected vs Actual**: Clearly state what happened vs what should have happened.
5. **Logs/Traces**: Include a placeholder stating "Attached Playwright Trace (.zip) and Video".
6. **Error Stack**: Include the relevant portion of the error in a code block.

### 🚨 FAILED TEST: ${testName}
\`\`\`
${rawError}
\`\`\`

Return ONLY the Markdown bug report ticket.
`;
  }
}
