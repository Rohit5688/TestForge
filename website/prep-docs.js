import fs from 'node:fs';
import path from 'node:path';

const docsDir = 'src/content/docs/repo';

const emojiMap = {
  'UserGuide': '📱',
  'Onboarding': '🔰',
  'Installation': '🐳',
  'Docker': '🐳',
  'E2E': '🧪',
  'Architecture': '🏛️',
  'Evolution': '📈',
  'Workflow': '🔄',
  'Execution': '🩹',
  'Healing': '🩹',
  'McpConfig': '⚙️',
  'Config': '⚙️',
  'Path': '📍',
  'Tool': '🛠️',
  'Security': '🛡️',
  'Compliance': '🔍',
  'Audit': '🔍',
  'Sandbox': '📦',
  'Risk': '⚠️',
  'CI': '🚀',
  'Integration': '🚀',
  'Observability': '📊',
  'Logging': '📊',
  'Appium': '🔌',
  'WDIO': '🔌',
  'Migration': '🚚',
  'Prompt': '📗',
  'Cheatbook': '📗',
  'Token': '🎟️',
  'Agent': '🤖',
  'Issue': '🗺️',
  'Map': '🗺️',
  'Knowledge': '🗺️',
  'Executive': '💼',
  'Design': '🎨',
  'Protocol': '📋',
  'Task': '📋',
  'Persona': '👤',
  'Table of Contents': '📋',
  'Generation': '✍️',
  'Development': '✍️',
  'Device': '📱',
  'Interaction': '📱',
  'Live': '👁️',
  'Debugging': '🩹',
  'Quality': '🔍',
  'Refactoring': '🛠️',
  'Pipeline': '🚀',
  'Advanced': '🌟',
  'Strategic': '🌟',
  'Training': '🧠',
  'Learning': '🧠',
  'Troubleshooting': '🆘',
  'Failure': '🆘',
  'Code Mode': '📦',
  'Tips': '💡',
  'Best Practice': '💡',
  'Glossary': '📖',
  'Related': '🔗',
  'Decoupled': '🏛️',
  'Concurrency': '⏳',
  'Structured Content': '📥',
  'Output': '📥',
  'Logger': '📊',
  'Metric': '📊',
  'Coverage': '📈'
};

const emojiRegex = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F000}-\u{1F9FF}\u{FE0F}\u{200D}]/gu;

function getEmojiForText(text, fallback) {
  for (const [key, emoji] of Object.entries(emojiMap)) {
    if (text.toLowerCase().includes(key.toLowerCase())) {
      return emoji;
    }
  }
  return fallback || '📄';
}

function cleanHeader(text) {
  if (!text) return '';
  // 1. Remove all emojis and special zero-width/variation selector characters
  let cleaned = text.replace(emojiRegex, '');
  
  // 2. Remove broken symbols like ?, ??, ??? at the start
  cleaned = cleaned.replace(/^[?\s!]+/, '');
  
  // 3. Remove leading symbols like - or . and any surrounding spaces
  cleaned = cleaned.replace(/^[-.]\s+/, '').trim();
  
  // 4. Final aggressive trim to remove any hidden characters
  cleaned = cleaned.replace(/^\s+|\s+$/g, '');
  
  return cleaned;
}

function processFiles(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      processFiles(fullPath);
      continue;
    }
    if (!file.endsWith('.md')) continue;

    let content = fs.readFileSync(fullPath, 'utf8');
    
    let fmContent = '';
    let bodyContent = content;
    
    // Find existing frontmatter
    const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (fmMatch) {
      fmContent = fmMatch[1];
      bodyContent = content.slice(fmMatch[0].length);
    }

    // Ensure title exists in fmContent
    if (!fmContent.includes('title:')) {
      // Try to find H1 in body
      const h1Match = bodyContent.match(/^#\s+(.*)$/m);
      let titleVal = '';
      if (h1Match) {
        titleVal = cleanHeader(h1Match[1]);
        // Remove the H1 from body since it will be in frontmatter
        bodyContent = bodyContent.replace(/^#\s+.*$/m, '').trim();
      } else {
        // Fallback to filename
        titleVal = cleanHeader(file.replace('.md', '').replace(/_/g, ' '));
      }
      fmContent = `title: "${titleVal}"\n${fmContent}`.trim();
    }
    
    // 1. Process Frontmatter Title (inject emojis)
    fmContent = fmContent.replace(/^title:.*$/m, (line) => {
        let titleVal = line.replace('title:', '').trim().replace(/^["']/, '').replace(/["']$/, '').trim();
        titleVal = cleanHeader(titleVal);
        const emoji = getEmojiForText(file + ' ' + titleVal, '📄');
        return `title: "${emoji} ${titleVal}"`;
    });

    // 2. Process Body Headers (H2, H3)
    const lines = bodyContent.split('\n');
    const updatedLines = lines.map(line => {
        const hMatch = line.match(/^(#{2,3})\s+(.*)$/);
        if (hMatch) {
            const level = hMatch[1];
            let headerText = hMatch[2].trim();
            headerText = cleanHeader(headerText);
            const emoji = getEmojiForText(headerText, '');
            return `${level} ${emoji ? emoji + ' ' : ''}${headerText}`;
        }
        return line;
    });
    bodyContent = updatedLines.join('\n');

    const finalContent = `---\n${fmContent.trim()}\n---\n\n${bodyContent.trim()}`;
    fs.writeFileSync(fullPath, finalContent);
    console.log(`Deep-synced style/iconography for ${file}`);
  }
}

processFiles(docsDir);
