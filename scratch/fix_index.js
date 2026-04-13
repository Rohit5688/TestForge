import fs from 'fs';
import path from 'path';

const filePath = 'C:/Users/Rohit/mcp/TestForge/src/index.ts';
let content = fs.readFileSync(filePath, 'utf-8');

// Replace sessionTimeout initialization to include enableVisualMode
content = content.replace(
  '      let sessionTimeout = 30000;',
  '      let sessionTimeout = 30000;\n      let enableVisualMode = false;'
);

// Update config reading to capture enableVisualExploration
content = content.replace(
  '          sessionTimeout = config.timeouts?.sessionStart ?? 30000;',
  '          sessionTimeout = config.timeouts?.sessionStart ?? 30000;\n          enableVisualMode = config.enableVisualExploration ?? false;'
);

// Update inspect call to pass enableVisualMode
content = content.replace(
  'const domTree = await domInspector.inspect(url, waitForSelector, storageState, includeIframes, loginMacro, sessionTimeout);',
  'const domTree = await domInspector.inspect(url, waitForSelector, storageState, includeIframes, loginMacro, sessionTimeout, enableVisualMode);'
);

fs.writeFileSync(filePath, content);
console.log('Successfully updated src/index.ts');
