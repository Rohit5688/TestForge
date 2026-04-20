export interface GeneratedFile {
    path: string;
    content: string;
}
/**
 * FileWriterService
 *
 * Handles writing the LLM-generated JSON file array to the project root on disk.
 * Single Responsibility: Only writes files, does not run tests or analyze code.
 */
export declare class FileWriterService {
    /**
     * Writes every file in the array to disk under `projectRoot`.
     * Creates any intermediate directories automatically.
     * Returns the list of absolute paths that were written.
     */
    writeFiles(projectRoot: string, files: GeneratedFile[]): string[];
}
//# sourceMappingURL=FileWriterService.d.ts.map