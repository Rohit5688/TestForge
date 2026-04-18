import type { ITestGenerator } from '../interfaces/ITestGenerator.js';
import type { CodebaseAnalysisResult } from '../interfaces/ICodebaseAnalyzer.js';
export declare class TestGenerationService implements ITestGenerator {
    generatePromptInstruction(testDescription: string, projectRoot: string, analysisResult: CodebaseAnalysisResult, customWrapperPackage?: string, baseUrl?: string, memoryPrompt?: string, domJsonContext?: string, // Optional: JSON string of JsonElement[] from inspect_page_dom(returnFormat:'json')
    testContext?: import('../types/TestContext.js').TestContext): Promise<string>;
    /**
     * TASK-34 — Gherkin Prompt Compression.
     * Reads all .feature files in the project, extracts Scenario/Scenario Outline
     * headings per file, and returns only the last MAX_GHERKIN_SCREENS unique
     * screen contexts in a compact text block.
     *
     * Rationale: Large projects accumulate hundreds of Gherkin lines. The LLM only
     * needs the most recent screen context to avoid step duplication — earlier
     * screens are already encoded in the existingStepDefinitions analysis slice.
     */
    private compressFeatureFiles;
    /**
     * TASK-34 — Mermaid Navigation Graph Injection.
     * Looks for a pre-built Mermaid diagram at .TestForge/nav-graph.md (generated
     * by export_navigation_map or similar tooling). If found, includes it verbatim
     * so the LLM understands screen-to-screen transitions before generating steps.
     *
     * Fallback: also accepts graphify-out/nav-graph.md for compatibility with
     * projects using graphify to build their navigation maps.
     */
    private injectNavGraph;
}
//# sourceMappingURL=TestGenerationService.d.ts.map