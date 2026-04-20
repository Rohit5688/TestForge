export class FixtureDataService {
  /**
   * Generates a strict system prompt instructing the LLM to scaffold a custom
   * Playwright Fixture that generates mock data using faker-js.
   */
  public generateFixturePrompt(entityName: string, schemaDefinition: string): string {
    return `
You are an expert Playwright-BDD and TypeScript Developer.
Your task is to generate a custom Playwright Fixture that yields a mock data factory for the requested entity using \`@faker-js/faker\`.

### 🎯 TARGET ENTITY
Entity Name: ${entityName}
Schema / Requirements:
\`\`\`
${schemaDefinition}
\`\`\`

### 🛑 CRITICAL INSTRUCTIONS

1. **TypeScript Interface**: 
   - Define a strict TypeScript \`interface\` for the \`${entityName}\` based on the schema provided.
   - If optional fields exist, mark them with \`?\`.

2. **Faker.js Factory Function**:
   - Write a \`build${entityName}(overrides?: Partial<${entityName}>): ${entityName}\` function.
   - Use \`import { faker } from '@faker-js/faker';\` to populate default mock data (e.g., \`faker.internet.email()\`, \`faker.person.firstName()\`).
   - Merge the \`overrides\` parameter into the return object so tests can customize specific fields.

3. **Playwright Fixture Binding**:
   - Create and export a custom \`test\` object using \`import { test as base } from '@playwright/test';\`.
   - Extend the base test with the custom fixture.
   - Example syntax:
     \`\`\`typescript
     export const test = base.extend<{ ${entityName}Factory: (overrides?: Partial<${entityName}>) => ${entityName} }>({
       ${entityName}Factory: async ({}, use) => {
         await use(build${entityName});
       }
     });
     \`\`\`

4. **Output Format**:
   - Return a single valid JSON object — NO markdown fences, NO extra text.
   - The JSON MUST match this schema exactly so the MCP \`validate_and_write\` tool can process it:
     \`\`\`json
     {
       "files": [
         {
           "path": "fixtures/${entityName.toLowerCase()}.fixture.ts",
           "content": "/* full TypeScript source */"
         }
       ]
     }
     \`\`\`
   - The \`content\` string must contain the complete TypeScript: the interface, the factory function, and the extended \`test\` export.
   - Escape all backticks and template-literal characters inside the content string correctly.
`;
  }
}
