import * as fs from 'fs';
import * as crypto from 'crypto';
import { McpErrors } from '../../types/ErrorSystem.js';

/**
 * FileStateService.ts
 * Implements the File-State Race Guard (TASK-66) to prevent the agent from
 * overwriting files that have been modified by a human since the agent last read them.
 */

export class FileStateService {
  // Map of projectRoot -> Map<absolutePath, hash>
  private readTracker = new Map<string, Map<string, string>>();

  private sha256(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Records the hash of a file at the moment it is read by the agent.
   */
  public recordRead(projectRoot: string, absolutePath: string, content: string): void {
    if (!this.readTracker.has(projectRoot)) {
      this.readTracker.set(projectRoot, new Map());
    }
    const hash = this.sha256(content);
    this.readTracker.get(projectRoot)!.set(absolutePath, hash);
  }

  /**
   * Checks if any of the files slated for writing have changed on disk since the agent last read them.
   * Throws an error listing the files that have diverged, forcing the agent to re-read.
   */
  public validateWriteState(projectRoot: string, files: Array<{ path: string; content: string }>): void {
    const projectTracker = this.readTracker.get(projectRoot);
    if (!projectTracker) return; // No files were read, so no race condition possible

    const divergedFiles: string[] = [];

    for (const file of files) {
      // Only check files that already exist on disk
      const absolutePath = require('path').resolve(projectRoot, file.path);
      if (!fs.existsSync(absolutePath)) continue;

      const lastReadHash = projectTracker.get(absolutePath);
      if (!lastReadHash) continue; // The agent didn't read it, but is overwriting it (this is allowed, e.g. full rewrite task, although risky)

      try {
        const currentContent = fs.readFileSync(absolutePath, 'utf8');
        const currentHash = this.sha256(currentContent);

        if (currentHash !== lastReadHash) {
          divergedFiles.push(file.path);
        }
      } catch {
        // If we can't read it now, it might have been deleted, which is a state change.
        divergedFiles.push(file.path);
      }
    }

    if (divergedFiles.length > 0) {
      const divergedStr = divergedFiles.map(f => f).join(', ');
      throw McpErrors.fileModifiedExternally(
        divergedStr,
        divergedFiles.map(f => `  - ${f}`).join('\n') +
        `\n\nTo prevent overwriting human work, you MUST re-read these files before trying to write again.`
      );
    }
  }

  /**
   * Clears the read state for a project, typically after a successful write
   * or when starting a completely new session.
   */
  public clearState(projectRoot: string): void {
    this.readTracker.delete(projectRoot);
  }
}
