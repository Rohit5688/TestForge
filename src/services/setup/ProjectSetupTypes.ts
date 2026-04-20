export interface SetupResult {
  projectRoot: string;
  installed: boolean;
  dirsCreated: string[];
  filesCreated: string[];
  envScaffolded: boolean;
  message: string;
}

export interface ConfigTemplate extends Record<string, any> {
  version: string;
  tags: string[];
  envKeys: Record<string, string>;
  dirs: Record<string, string>;
  browsers: string[];
  timeouts: Record<string, number>;
  retries: number;
  backgroundBlockThreshold: number;
  authStrategy: string;
  currentEnvironment: string;
  environments: string[];
  waitStrategy: string;
  architectureNotesPath: string;
  additionalDataPaths: string[];
  a11yStandards: string[];
  a11yReportPath: string;
  projectRoot: string;
}
