import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface ZipEntry { 
  name: string; 
  compression: number; 
  compressedSize: number; 
  uncompressedSize: number; 
  dataOffset: number 
}

export class ZipExtractor {
  /**
   * Extracts trace events from trace.zip.
   * Strategy: use binary parsing of ZIP local file headers to find .trace entry,
   * falling back to system tools if parsing fails.
   */
  public static async extractTraceEvents(tracePath: string): Promise<any[]> {
    try {
      return await this.readTraceFromZip(tracePath);
    } catch {
      try {
        return await this.extractWithSystemTool(tracePath);
      } catch {
        return [];
      }
    }
  }

  /**
   * Reads the .trace event file from inside a ZIP using raw binary parsing.
   */
  private static async readTraceFromZip(zipPath: string): Promise<any[]> {
    const zipBuf = fs.readFileSync(zipPath);
    const entries = this.findZipEntries(zipBuf);

    const traceEntry = entries.find(e =>
      e.name.endsWith('.trace') || e.name === 'trace.trace'
    );

    if (!traceEntry) return [];

    const compressed = zipBuf.slice(traceEntry.dataOffset, traceEntry.dataOffset + traceEntry.compressedSize);

    let rawText: string;
    if (traceEntry.compression === 0) {
      rawText = compressed.toString('utf-8');
    } else if (traceEntry.compression === 8) {
      rawText = zlib.inflateRawSync(compressed).toString('utf-8');
    } else {
      return [];
    }

    return rawText
      .split('\n')
      .map(line => { try { return JSON.parse(line); } catch { return null; } })
      .filter(Boolean);
  }

  private static findZipEntries(buf: Buffer): ZipEntry[] {
    const entries: ZipEntry[] = [];
    let offset = 0;

    while (offset < buf.length - 4) {
      if (buf[offset] === 0x50 && buf[offset + 1] === 0x4b &&
          buf[offset + 2] === 0x03 && buf[offset + 3] === 0x04) {
        const compression    = buf.readUInt16LE(offset + 8);
        const compressedSize = buf.readUInt32LE(offset + 18);
        const nameLength     = buf.readUInt16LE(offset + 26);
        const extraLength    = buf.readUInt16LE(offset + 28);
        const name           = buf.slice(offset + 30, offset + 30 + nameLength).toString('utf-8');
        const dataOffset     = offset + 30 + nameLength + extraLength;
        const uncompressedSize = buf.readUInt32LE(offset + 22);

        entries.push({ name, compression, compressedSize, uncompressedSize, dataOffset });
        offset = dataOffset + compressedSize;
      } else {
        offset++;
      }
    }
    return entries;
  }

  private static async extractWithSystemTool(zipPath: string): Promise<any[]> {
    const osPlatform = process.platform;
    const tempDir = path.join(path.dirname(zipPath), '.trace-extract-tmp');
    fs.mkdirSync(tempDir, { recursive: true });

    try {
      if (osPlatform === 'win32') {
        await execFileAsync('powershell', [
          '-Command',
          `Expand-Archive -Path '${zipPath}' -DestinationPath '${tempDir}' -Force`
        ]);
      } else {
        await execFileAsync('unzip', ['-o', zipPath, '-d', tempDir]);
      }

      const traceFile = this.findTraceFile(tempDir);
      if (!traceFile) return [];

      const content = fs.readFileSync(traceFile, 'utf-8');
      return content.split('\n')
        .map(line => { try { return JSON.parse(line); } catch { return null; } })
        .filter(Boolean);
    } finally {
      try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  }

  private static findTraceFile(dir: string): string | null {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isFile() && entry.name.endsWith('.trace')) return fullPath;
      if (entry.isDirectory()) {
        const found = this.findTraceFile(fullPath);
        if (found) return found;
      }
    }
    return null;
  }
}
