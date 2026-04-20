import { lintPageObject } from './dist/utils/PageObjectLinter.js';
import { SmartDomExtractor } from './dist/utils/SmartDomExtractor.js';
import * as v8 from 'v8';

console.log('--- TEST 1: PageObjectLinter ---');
const lintTests = [
  "await this.page.getByRole('button', { name: 'Submit (Optional)' }).click()",
  "await this.page.getByRole('button').first().click()",
  "await this.page.locator('div > span').nth(2).fill('Test text')",
  "await this.submitBtn.click()",
  "await this.formContainer.getByRole('button').click()"
];
lintTests.forEach(t => console.log('IN: ' + t + '\nOUT: ' + lintPageObject(t, true) + '\n'));

console.log('--- TEST 2: V8 Serialize/Deserialize (DomInspectorService fix) ---');
try {
  const err = new Error('Test Error');
  // Freeze stack trace limit to simulate tight VM environments
  Object.defineProperty(err, 'stackTraceLimit', { value: 10, writable: false });
  const result = { mainFrame: { err } };
  
  const safeResult = v8.deserialize(v8.serialize(result));
  const rawJson = JSON.stringify(safeResult, (key, value) => {
    if (value instanceof Error) return { message: value.message, name: value.name };
    return value;
  });
  console.log('Successfully serialized safeResult:', rawJson);
} catch (e) {
  console.log('V8 Serialize failed:', e.message);
}

console.log('\n--- TEST 3: SmartDomExtractor Decorative Node Pruning ---');
const yaml = `
  - link "Home"
  - link "Follow us on Twitter"
  - heading "Copyright 2025"
  - button "Powered by V8"
  - button "Submit"
`;
const rawJson = JSON.stringify({ mainFrame: { ariaYaml: yaml }});
const out = SmartDomExtractor.extract(rawJson, 'http://test.com');
console.log(out);
