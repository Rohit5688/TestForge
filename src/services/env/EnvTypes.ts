export interface EnvironmentCheck {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
  fixHint?: string | undefined;
}
