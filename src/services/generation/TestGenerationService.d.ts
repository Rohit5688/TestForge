import type { ITestGenerator } from '../interfaces/ITestGenerator.js';
import type { CodebaseAnalysisResult } from '../interfaces/ICodebaseAnalyzer.js';
export declare class TestGenerationService implements ITestGenerator {
    generatePromptInstruction(testDescription: string, projectRoot: string, analysisResult: CodebaseAnalysisResult, customWrapperPackage?: string, baseUrl?: string): Promise<string>;
}
//# sourceMappingURL=TestGenerationService.d.ts.map