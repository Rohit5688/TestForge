const fs = require('fs');

// Test content from trifecta-framework
const testContent = `
export declare function gotoURL(path: string, options?: GotoOptions): Promise<null | Response>;
export declare function click(input: string | Locator, options?: ClickOptions): Promise<void>;
export declare function fill(input: string | Locator, value: string, options?: FillOptions): Promise<void>;
`;

// Regex from our fix
const declareMatches = testContent.matchAll(/export\s+declare\s+function\s+(\w+)\s*\(/g);
const methods = [];

for (const match of declareMatches) {
  if (match[1]) methods.push(match[1] + '()');
}

console.log('Extracted methods:', methods);
console.log('Count:', methods.length);
console.log('Expected: gotoURL(), click(), fill()');