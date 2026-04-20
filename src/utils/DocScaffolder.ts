import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class DocScaffolder {
  /**
   * Scaffolds the MCP Config Reference document.
   */
  public scaffoldReference(projectRoot: string): void {
    const docsDir = path.join(projectRoot, 'docs');
    if (!fs.existsSync(docsDir)) {
      fs.mkdirSync(docsDir, { recursive: true });
    }

    // Adjusted path because this is now in src/utils/
    const sourceDoc = path.join(__dirname, '../../docs/technical/MCP_CONFIG_REFERENCE.md');
    const targetDoc = path.join(projectRoot, 'docs/MCP_CONFIG_REFERENCE.md');

    if (fs.existsSync(sourceDoc)) {
      fs.copyFileSync(sourceDoc, targetDoc);
    } else {
      const content = [
        '# MCP Config Reference — TestForge',
        '',
        'See the full documentation at: https://github.com/ForgeTest-AI/TestForge/blob/main/docs/technical/MCP_CONFIG_REFERENCE.md',
      ].join('\n');
      fs.writeFileSync(targetDoc, content, 'utf-8');
    }
  }

  /**
   * Scaffolds the Prompt Cheatbook document.
   */
  public scaffoldPromptCheatbook(projectRoot: string): void {
    const docsDir = path.join(projectRoot, 'docs');
    if (!fs.existsSync(docsDir)) {
      fs.mkdirSync(docsDir, { recursive: true });
    }

    // Adjusted path because this is now in src/utils/
    const sourceDoc = path.join(__dirname, '../../docs/user/PROMPT_CHEATBOOK.md');
    const targetDoc = path.join(projectRoot, 'docs/PROMPT_CHEATBOOK.md');

    if (fs.existsSync(sourceDoc)) {
      fs.copyFileSync(sourceDoc, targetDoc);
    } else {
      const content = [
        '# Prompt Cheatbook — TestForge',
        '',
        'See the full cheatbook at: https://github.com/ForgeTest-AI/TestForge/blob/main/docs/user/PROMPT_CHEATBOOK.md',
      ].join('\n');
      fs.writeFileSync(targetDoc, content, 'utf-8');
    }
  }
}
