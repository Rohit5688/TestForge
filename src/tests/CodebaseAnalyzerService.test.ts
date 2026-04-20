import { test, describe, before } from 'node:test';
import * as assert from 'node:assert/strict';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';
import { CodebaseAnalyzerService } from '../services/analysis/CodebaseAnalyzerService.js';

describe('CodebaseAnalyzerService (TestForge Unit Tests)', () => {
  let analyzerService: CodebaseAnalyzerService;
  let tempDir: string;
  let pagesDir: string;
  let stepsDir: string;

  before(async () => {
    analyzerService = new CodebaseAnalyzerService();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'testforge-analyzer-'));
    pagesDir = path.join(tempDir, 'pages');
    stepsDir = path.join(tempDir, 'step-definitions');
    await fs.mkdir(pagesDir, { recursive: true });
    await fs.mkdir(stepsDir, { recursive: true });
  });

  test('should analyze standard Page Object Models', async () => {
    const pagePom = `
      import { Page } from '@playwright/test';
      export class AuthPage {
        private usernameInp = this.page.locator('#username');
        public async login() { return; }
        private async helper() { return; }
      }
    `;
    const pagePath = path.join(pagesDir, 'AuthPage.ts');
    await fs.writeFile(pagePath, pagePom);

    const result = await analyzerService.analyze(tempDir);
    
    // Cleanup
    await fs.unlink(pagePath);

    const authPage = result.existingPageObjects.find(p => p.className === 'AuthPage');
    assert.ok(authPage, 'AuthPage should be detected');
    assert.deepEqual(authPage?.publicMethods, ['login()'], 'Should only extract public methods with ()');
  });

  test('should detect Page Registries (BUG-04 Extracted Feature)', async () => {
    // A registry instantiates other pages
    const registryPom = `
      import { Page } from '@playwright/test';
      import { LoginPage } from './LoginPage';
      import { DashboardPage } from './DashboardPage';
      
      export class AppManager {
        public loginPage = new LoginPage(this.page);
        public dashboardPage = new DashboardPage(this.page);
        
        constructor(public page: Page) {}
      }
    `;
    const registryPath = path.join(pagesDir, 'AppManager.ts');
    await fs.writeFile(registryPath, registryPom);

    const result = await analyzerService.analyze(tempDir);
    
    // Cleanup
    await fs.unlink(registryPath);

    assert.equal(result.pageRegistries?.length, 1, 'Should detect 1 page registry');
    const registry = result.pageRegistries![0];
    assert.equal(registry?.className, 'AppManager');
    const pageClasses = registry?.pages.map(p => p.pageClass) || [];
    assert.ok(pageClasses.includes('LoginPage'), 'Should detect LoginPage instantiation');
    assert.ok(pageClasses.includes('DashboardPage'), 'Should detect DashboardPage instantiation');
  });
});
