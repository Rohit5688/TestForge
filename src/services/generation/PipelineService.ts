import { McpErrors, McpError, McpErrorCode } from '../../types/ErrorSystem.js';
import fs from 'fs';
import path from 'path';

export type PipelineProvider = 'github' | 'gitlab' | 'jenkins';

export interface PipelineOptions {
  provider: PipelineProvider;
  runOnPush: boolean;
  runOnSchedule?: string; // cron syntax
  nodeVersion?: string;
}

export class PipelineService {
  /**
   * Generates a CI/CD pipeline template based on the chosen provider.
   */
  public generatePipeline(projectRoot: string, options: PipelineOptions): string {
    const nodeVersion = options.nodeVersion || '20';
    let content = '';
    let targetPath = '';

    if (options.provider === 'github') {
      const scheduleBlock = options.runOnSchedule ? `\n  schedule:\n    - cron: '${options.runOnSchedule}'` : '';
      const pushBlock = options.runOnPush ? `\n  push:\n    branches: [ main, master ]\n  pull_request:\n    branches: [ main, master ]` : '';
      
      content = `name: Playwright BDD Tests
on:${pushBlock}${scheduleBlock}

jobs:
  test:
    timeout-minutes: 60
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: lts/*
    - name: Install dependencies
      run: npm ci
    - name: Install Playwright Browsers
      run: npx playwright install --with-deps
    - name: Generate BDD Test Files
      run: npm run test
    - name: Upload HTML Report
      uses: actions/upload-artifact@v4
      if: always()
      with:
        name: playwright-report
        path: playwright-report/
        retention-days: 30
`;
      const dir = path.join(projectRoot, '.github', 'workflows');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      targetPath = path.join(dir, 'playwright-bdd.yml');
    }

    else if (options.provider === 'gitlab') {
      content = `stages:
  - test

playwright_tests:
  stage: test
  image: mcr.microsoft.com/playwright:v1.44.0-jammy
  script:
    - npm ci
    - npm run test
  artifacts:
    when: always
    paths:
      - playwright-report/
    expire_in: 30 days
  ${options.runOnPush ? 'rules:\n    - if: $CI_COMMIT_BRANCH == "main"\n    - if: $CI_PIPELINE_SOURCE == "merge_request_event"\n  ' : ''}
`;
      targetPath = path.join(projectRoot, '.gitlab-ci.yml');
    }

    else if (options.provider === 'jenkins') {
      const trigger = options.runOnSchedule ? `triggers {\n        cron('${options.runOnSchedule}')\n    }` : '';
      content = `pipeline {
    agent {
        docker {
            image 'mcr.microsoft.com/playwright:v1.44.0-jammy'
            reuseNode true
        }
    }
    ${trigger}
    stages {
        stage('Install') {
            steps {
                sh 'npm ci'
            }
        }
        stage('Test') {
            steps {
                sh 'npm run test'
            }
        }
    }
    post {
        always {
            archiveArtifacts artifacts: 'playwright-report/**/*', allowEmptyArchive: true
        }
    }
}
`;
      targetPath = path.join(projectRoot, 'Jenkinsfile');
    }

    else {
      throw McpErrors.invalidParameter("provider", `Unsupported pipeline provider: ${options.provider}`);
    }

    fs.writeFileSync(targetPath, content, 'utf8');
    return targetPath;
  }
}
