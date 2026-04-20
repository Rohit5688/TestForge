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

    if (suggestions.length === 3) { // Only title and success messages
      suggestions.push('\n🎉 Your codebase is incredibly clean! No refactorings necessary step-side.');
    }

    return suggestions.join('\n');
  }
}
