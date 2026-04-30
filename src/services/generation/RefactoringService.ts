import type { CodebaseAnalysisResult } from '../../interfaces/ICodebaseAnalyzer.js';

export class RefactoringService {
  /**
   * Generates an actionable refactoring plan based on codebase analysis.
   */
  public generateRefactoringSuggestions(analysis: CodebaseAnalysisResult): string {
    const suggestions: string[] = [];
    suggestions.push('### 🧹 Codebase Refactoring & Maintenance Report\n');

    // 1. Unused POM Methods
    if (analysis.unusedPomMethods && analysis.unusedPomMethods.length > 0) {
      suggestions.push('#### 🗑️ Unused Page Object Methods');
      suggestions.push('The following methods exist in your Page Objects but are NEVER called by any step definition. Consider deleting them to reduce maintenance surface:\n');
      analysis.unusedPomMethods.forEach(pom => {
        pom.unusedMethods.forEach(method => {
            suggestions.push(`- **${method}** (File: \`${pom.path}\`)`);
        });
      });
      suggestions.push('');
    } else {
      suggestions.push('✅ No unused Page Object methods detected.');
    }

    // 2. Duplicate Step Definitions
    if (analysis.duplicateSteps && analysis.duplicateSteps.length > 0) {
      suggestions.push('\n#### 👯 Duplicate Step Definitions');
      suggestions.push('The following steps have identical patterns but exist in multiple files. This causes Playwright-BDD compilation errors and fragmentation. You MUST merge these into a common step definition file:\n');
      
      analysis.duplicateSteps.forEach(dup => {
        suggestions.push(`- **Pattern**: \`${dup.step}\``);
        dup.files.forEach(file => {
          suggestions.push(`  - Found in: \`${file}\``);
        });
      });
      suggestions.push('');
    } else {
      suggestions.push('\n✅ No duplicate step definition patterns detected.');
    }

    // 3. Code Quality Checks
    if (analysis.codeQuality) {
      const q = analysis.codeQuality;

      // God Objects
      if (q.godObjects && q.godObjects.length > 0) {
        suggestions.push('\n#### 🐘 God Page Objects (Too Many Responsibilities)');
        suggestions.push('These page classes have more than 20 public methods. Consider splitting them by feature area (e.g. `CreditCardFiltersPage`, `CreditCardActionsPage`):\n');
        q.godObjects.forEach(g => {
          suggestions.push(`- **${g.className}** — ${g.methodCount} methods (File: \`${g.path}\`)`);
        });
        suggestions.push('');
      }

      // Long Methods
      if (q.longMethods && q.longMethods.length > 0) {
        suggestions.push('\n#### 📏 Long Methods (Extract Helper Methods)');
        suggestions.push('These methods exceed 30 lines. Extract sub-steps into private helpers to improve readability and testability:\n');
        q.longMethods.slice(0, 15).forEach(m => {
          suggestions.push(`- **${m.method}** — ${m.lines} lines in \`${m.className}\` (File: \`${m.path}\`)`);
        });
        if (q.longMethods.length > 15) suggestions.push(`  _...and ${q.longMethods.length - 15} more_`);
        suggestions.push('');
      }

      // Hardcoded Selectors in Step Files
      if (q.hardcodedSelectors && q.hardcodedSelectors.length > 0) {
        suggestions.push('\n#### 🔒 Hardcoded Selectors in Step Files');
        suggestions.push('Selectors (locators) found directly in step definition files. Move these to Page Object classes to maintain the POM pattern:\n');
        q.hardcodedSelectors.slice(0, 10).forEach(s => {
          suggestions.push(`- \`${s.selector}\` — Line ${s.line} in \`${s.path}\``);
        });
        if (q.hardcodedSelectors.length > 10) suggestions.push(`  _...and ${q.hardcodedSelectors.length - 10} more_`);
        suggestions.push('');
      }

      // Missing Awaits
      if (q.missingAwaits && q.missingAwaits.length > 0) {
        suggestions.push('\n#### ⚡ Potential Missing `await` Keywords');
        suggestions.push('These async page method calls may be missing `await`. Missing await causes steps to complete before the action finishes, leading to flaky tests:\n');
        q.missingAwaits.slice(0, 10).forEach(a => {
          suggestions.push(`- \`${a.expression}\` — Line ${a.line} in \`${a.path}\``);
        });
        if (q.missingAwaits.length > 10) suggestions.push(`  _...and ${q.missingAwaits.length - 10} more_`);
        suggestions.push('');
      }

      // Large Step Files
      if (q.largeStepFiles && q.largeStepFiles.length > 0) {
        suggestions.push('\n#### 📄 Oversized Step Files (Delegate Logic to Page Objects)');
        suggestions.push('These step files exceed 200 lines. Step files should only orchestrate — move business logic and selector usage to Page Objects:\n');
        q.largeStepFiles.forEach(f => {
          suggestions.push(`- \`${f.path}\` — ${f.lines} lines`);
        });
        suggestions.push('');
      }
    }

    if (suggestions.length === 3) { // Only title and success messages
      suggestions.push('\n🎉 Your codebase is incredibly clean! No refactorings necessary.');
    }

    return suggestions.join('\n');
  }
}
