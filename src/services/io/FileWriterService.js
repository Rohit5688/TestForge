import * as fs from 'fs';
import * as path from 'path';
/**
 * FileWriterService
 *
 * Handles writing the LLM-generated JSON file array to the project root on disk.
 * Single Responsibility: Only writes files, does not run tests or analyze code.
 */
export class FileWriterService {
    /**
     * Writes every file in the array to disk under `projectRoot`.
     * Creates any intermediate directories automatically.
     * Returns the list of absolute paths that were written.
     */
    writeFiles(projectRoot, files) {
        const written = [];
        for (const file of files) {
            const absolutePath = path.join(projectRoot, file.path);
            const dir = path.dirname(absolutePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(absolutePath, file.content, 'utf-8');
            written.push(absolutePath);
        }
        return written;
    }
}
//# sourceMappingURL=FileWriterService.js.map