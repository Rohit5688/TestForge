import * as fs from 'fs';
import * as path from 'path';
import { VIEWER_HTML } from '../assets/LogViewerTemplate.js';

/**
 * LogStreamManager — handles file streams and log directory maintenance.
 */
export class LogStreamManager {
  private logStreams = new Map<string, fs.WriteStream>();

  /** 
   * Prepares the project-specific log directory and returns an active write stream.
   * Returns null if initialization fails.
   */
  public getStream(projectRoot: string): fs.WriteStream | null {
    if (this.logStreams.has(projectRoot)) {
      return this.logStreams.get(projectRoot)!;
    }

    try {
      const logDir = path.join(projectRoot, 'mcp-logs');
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
      this.ensureViewer(logDir);

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const logFilePath = path.join(logDir, `session-${timestamp}.jsonl`);
      const stream = fs.createWriteStream(logFilePath, { flags: 'a', encoding: 'utf-8' });
      
      stream.on('error', () => {
        this.logStreams.delete(projectRoot);
      });

      this.logStreams.set(projectRoot, stream);
      return stream;
    } catch {
      return null;
    }
  }

  /** Writes viewer.html into logDir on first run. Idempotent. */
  private ensureViewer(logDir: string): void {
    try {
      const viewerPath = path.join(logDir, 'viewer.html');
      if (!fs.existsSync(viewerPath)) {
        fs.writeFileSync(viewerPath, VIEWER_HTML, 'utf-8');
      }
    } catch {
      // Best-effort
    }
  }

  /** Closes all active streams (call on shutdown) */
  public dispose(): void {
    for (const stream of this.logStreams.values()) {
      stream.end();
    }
    this.logStreams.clear();
  }
}
