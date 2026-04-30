export interface ActionStep {
  action: 'click' | 'fill' | 'wait' | 'goto';
  selector?: string;
  value?: string;
  timeout?: number;
  url?: string;
}

export interface IDomInspector {
  /**
   * Navigates to a target URL headlessly and returns a highly simplified
   * Accessibility Tree (AOM) or cleaned DOM representation.
   * This provides the LLM with exact, real locators (roles, names, aria properties).
   */
  inspect(url: string, waitForSelector?: string, storageState?: string, includeIframes?: boolean, actionSequence?: ActionStep[]): Promise<string>;
}
