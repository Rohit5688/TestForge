export interface CodebaseAnalysisResult {
  bddSetup: {
    present: boolean;
    configFile?: string;
  };
  existingFeatures: string[];
  existingStepDefinitions: {
    file: string;
    steps: string[];
  }[];
  existingPageObjects: {
    path: string;
    className?: string;
    publicMethods: string[];
  }[];
  /**
   * BUG-04 FIX: Page Registry / AppManager pattern.
   * Registries are classes whose properties instantiate other page classes
   * (e.g. class AppManager { loginPage = new LoginPage(page); }).
   * When detected, generators MUST use the registry variable
   * (e.g. `this.app.loginPage`) instead of instantiating a new class.
   */
  pageRegistries?: {
    className: string;        // e.g. 'AppManager'
    path: string;             // relative file path
    registryVar?: string;     // conventional accessor name, e.g. 'app'
    pages: {
      propertyName: string;   // e.g. 'loginPage'
      pageClass: string;      // e.g. 'LoginPage'
    }[];
  }[];
  customWrapper?: {
    package: string;
    detectedMethods: string[];
    isInstalled?: boolean;
    resolutionError?: string;
    architectureNotesPath?: string;
  };
  namingConventions: {
    features: string;
    pages: string;
  };
  mcpConfig?: {
    version: string;
    upgradeNeeded: boolean;
    allowedTags: string[];
    backgroundBlockThreshold?: number;
    waitStrategy?: 'networkidle' | 'domcontentloaded' | 'load';
    authStrategy?: 'none' | 'users-json' | 'env';
    setPageRequired?: boolean;
  };
  userRoles?: {
    environment: string;
    roles: string[];
    helperImport: string;
  };
  envConfig?: {
    present: boolean;
    files: string[];
    keys: string[];
  };
  npmScripts?: Record<string, string>;
  existingTestData?: {
    payloads: Array<{ path: string; sampledStructure?: string }>;
    fixtures: Array<{ path: string; sampledStructure?: string }>;
  };
  duplicateSteps?: Array<{ step: string; files: string[] }>;
  unusedPomMethods?: Array<{ path: string; unusedMethods: string[] }>;
  duplicateInstallWarnings?: string[];
  mcpLearnDirectives?: string[];
  detectedPaths: {
    featuresRoot: string;
    stepsRoot: string;
    pagesRoot: string;
    utilsRoot: string;
  };
  importAliases?: Record<string, string[]>;
  packageScripts?: Record<string, string>;
  recommendation: string;
  warnings?: string[];
  dependencies?: {
    hasPlaywright: boolean;
    hasPlaywrightBdd: boolean;
    hasCucumber: boolean;
    frameworkDetected: string;
    implicitFrameworkDetected: boolean;
    transitiveDeps: string[];
  };
}

export interface ICodebaseAnalyzer {
  /**
   * Analyzes the project directory to find existing Playwright-BDD configuration,
   * features, step definitions, and introspects Page Objects.
   */
  analyze(projectRoot: string, customWrapperPackage?: string): Promise<CodebaseAnalysisResult>;
}
