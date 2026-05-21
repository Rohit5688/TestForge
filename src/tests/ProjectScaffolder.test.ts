import { describe, test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ProjectScaffolder } from '../utils/ProjectScaffolder.js';

describe('ProjectScaffolder sample smoke test', () => {
  test('creates a runnable sample feature with matching step definitions', () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'testforge-scaffold-'));
    const scaffolder = new ProjectScaffolder();

    scaffolder.scaffoldDirectories(projectRoot);
    assert.equal(scaffolder.scaffoldPageSetup(projectRoot), true);
    assert.equal(scaffolder.scaffoldSampleFeature(projectRoot), true);
    assert.equal(scaffolder.scaffoldSampleSteps(projectRoot), true);

    const feature = fs.readFileSync(path.join(projectRoot, 'features', 'sample.feature'), 'utf-8');
    const steps = fs.readFileSync(path.join(projectRoot, 'step-definitions', 'sample.steps.ts'), 'utf-8');

    assert.match(feature, /@smoke @setup/);
    assert.match(feature, /Given I open the TestForge setup smoke page/);
    assert.match(feature, /Then the TestForge setup title should be visible/);
    assert.match(steps, /Given\('I open the TestForge setup smoke page'/);
    assert.match(steps, /Then\('the TestForge setup title should be visible'/);
    assert.match(steps, /data:text\/html/);
    assert.match(steps, /TestForge Setup Ready/);
  });
});

describe('ProjectScaffolder agent skills', () => {
  test('creates project-local TestForge agent and skill files without overwriting existing edits', () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'testforge-agent-skills-'));
    const scaffolder = new ProjectScaffolder();

    scaffolder.scaffoldDirectories(projectRoot);
    const created = scaffolder.scaffoldAgentSkills(projectRoot);

    assert.ok(created.includes('.github/agents/testforge-agent.agent.md'));
    assert.ok(created.includes('.github/skills/testforge-setup-and-preflight.md'));
    assert.ok(created.includes('.github/skills/testforge-new-bdd-test.md'));
    assert.ok(created.includes('.github/skills/testforge-playwright-bdd.md'));
    assert.ok(created.includes('.github/skills/testforge-web-selectors.md'));
    assert.ok(created.includes('.github/skills/testforge-api-testing.md'));
    assert.ok(created.includes('.github/skills/testforge-dom-and-locators.md'));
    assert.ok(created.includes('.github/skills/testforge-run-and-heal.md'));
    assert.ok(created.includes('.github/skills/testforge-verification-and-truth.md'));

    const agentPath = path.join(projectRoot, '.github', 'agents', 'testforge-agent.agent.md');
    const agent = fs.readFileSync(agentPath, 'utf-8');
    assert.match(agent, /setup_project -> check_playwright_ready -> inspect_page_dom/);
    assert.match(agent, /TestForge source code is not available/);
    assert.match(agent, /not a generic Playwright-BDD agent/);
    assert.match(agent, /TestForge MCP Tool Groups/);
    assert.match(agent, /testforge-playwright-bdd\.md/);
    assert.match(agent, /testforge-web-selectors\.md/);
    assert.match(agent, /testforge-api-testing\.md/);

    const bddSkill = fs.readFileSync(path.join(projectRoot, '.github', 'skills', 'testforge-playwright-bdd.md'), 'utf-8');
    assert.match(bddSkill, /createBdd\(test\)/);
    assert.match(bddSkill, /list_existing_steps/);
    assert.match(bddSkill, /run_playwright_test/);
    assert.match(bddSkill, /bddgen --tags/);

    const selectorSkill = fs.readFileSync(path.join(projectRoot, '.github', 'skills', 'testforge-web-selectors.md'), 'utf-8');
    assert.match(selectorSkill, /getLocatorByTestId/);
    assert.match(selectorSkill, /getLocatorByRole/);
    assert.match(selectorSkill, /getLocatorByLabel/);
    assert.match(selectorSkill, /getLocatorByPlaceholder/);
    assert.match(selectorSkill, /CSS only as fallback/);
    assert.doesNotMatch(selectorSkill, /CSS-First Priority/);

    const apiSkill = fs.readFileSync(path.join(projectRoot, '.github', 'skills', 'testforge-api-testing.md'), 'utf-8');
    assert.match(apiSkill, /getRequest\(\)/);
    assert.match(apiSkill, /APIRequestContext/);
    assert.match(apiSkill, /manage_env/);
    assert.match(apiSkill, /never hardcode/i);

    for (const file of created) {
      if (!file.startsWith('.github/')) continue;
      const content = fs.readFileSync(path.join(projectRoot, file), 'utf-8');
      assert.match(content, /TestForge/);
      assert.doesNotMatch(content, /Trifecta-BDD|@ecs-na\/trifecta/);
    }

    const editedContent = 'user customized agent\n';
    fs.writeFileSync(agentPath, editedContent, 'utf-8');

    const secondCreated = scaffolder.scaffoldAgentSkills(projectRoot);

    assert.equal(secondCreated.includes('.github/agents/testforge-agent.agent.md'), false);
    assert.equal(fs.readFileSync(agentPath, 'utf-8'), editedContent);
  });
});
