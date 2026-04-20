/**
 * BugReportService — Generates structured bug reports from test failures.
 * Supports Jira-style format with reproduction steps, expected/actual, 
 * and references to Playwright logs and errors.
 */
export class BugReportService {

  /**
   * Generates a Jira-formatted bug report from a failed Playwright test.
   */
  public generateBugReport(
    testName: string,
    rawError: string,
    browser?: string,
    baseUrl?: string,
    appVersion?: string
  ): string {
    const severity = this.classifySeverity(rawError);
    const errorSummary = this.extractErrorSummary(rawError);
    const timestamp = new Date().toISOString();

    return `## 🐛 Bug Report — ${testName}

**Priority**: ${severity.priority}
**Severity**: ${severity.level}
**Component**: Web Application
**Browser**: ${browser ?? 'Unknown Browser'}
**Base URL**: ${baseUrl ?? 'Unknown'}
**App Version**: ${appVersion ?? 'Unknown'}
**Reported**: ${timestamp}

---

### Summary
${errorSummary}

### Steps to Reproduce
> Automated test: \`${testName}\`

1. Navigate to the application at ${baseUrl ?? 'base URL'}
2. Execute the test scenario \`${testName}\`
3. Observe the failure at the step indicated in the error log

### Expected Result
The test scenario should complete without errors.

### Actual Result
\`\`\`
${rawError.substring(0, 2000)}
\`\`\`
${rawError.length > 2000 ? '\n_(truncated — full log attached)_' : ''}

### Environment
| Key | Value |
|-----|-------|
| Browser | ${browser ?? 'N/A'} |
| Base URL | ${baseUrl ?? 'N/A'} |
| App Version | ${appVersion ?? 'N/A'} |
| Test Framework | Playwright BDD |

### Attachments
- [ ] Playwright trace file / video
- [ ] Screenshot at failure
- [ ] Test execution report

### Root Cause Analysis
${severity.analysis}
`;
  }

  private classifySeverity(error: string): { priority: string; level: string; analysis: string } {
    const lower = error.toLowerCase();

    // timeout=P1, assertion=P2, crash=P0 from prompt
    if (lower.includes('crash') || lower.includes('sigkill') || lower.includes('page crashed')) {
      return { priority: 'P0 — Blocker', level: 'Critical', analysis: 'The browser or application appears to have crashed. This needs immediate investigation.' };
    }
    if (lower.includes('timeout') || lower.includes('timed out') || lower.includes('exceeded')) {
      return { priority: 'P1 — High', level: 'Major', analysis: 'A timeout occurred. The element or action took longer than expected. Consider increasing timeouts or investigating performance.' };
    }
    if (lower.includes('assertion') || lower.includes('expected') || lower.includes('to equal') || lower.includes('to contain') || lower.includes('not.tobe')) {
      return { priority: 'P2 — Major', level: 'Minor', analysis: 'An assertion failed. The application returned unexpected data. This may indicate a data/logic bug in the app.' };
    }
    if (lower.includes('element not found') || lower.includes('nosuchelement') || lower.includes('waiting for locator')) {
      return { priority: 'P2 — Major', level: 'Major', analysis: 'A UI element was not found. This could be a locator change after an app update, or a rendering delay.' };
    }
    return { priority: 'P2 — Major', level: 'Major', analysis: 'Unable to auto-classify. Manual investigation recommended.' };
  }

  private extractErrorSummary(error: string): string {
    const lines = error.split('\n').filter(l => l.trim().length > 0);
    const errorLine = lines.find(l =>
      l.includes('Error:') || l.includes('FAILED') || l.includes('AssertionError') || l.includes('Timeout') || l.match(/expected.*received/i)
    );
    return errorLine ?? lines[0] ?? 'Test failed with no clear error message.';
  }
}
