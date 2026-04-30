export interface ActionStep {
  action: 'click' | 'fill' | 'wait' | 'goto' | 'clickText' | 'hover' | 'select' | 'press' | 'clearAndFill' | 'waitForSelector' | 'evaluate' | 'waitForResponse' | 'switchToFrame' | 'switchToMainFrame' | 'uploadFile' | 'switchToNewTab' | 'switchToTab' | 'closeTab';
  selector?: string;
  value?: string;
  timeout?: number;
  url?: string;
  frameSelector?: string; // for switchToFrame: CSS selector of the iframe element
}

export interface IDomInspector {
  /**
   * Navigates to a target URL headlessly and returns a highly simplified
   * Accessibility Tree (AOM) or cleaned DOM representation.
   * This provides the LLM with exact, real locators (roles, names, aria properties).
   */
  inspect(url: string, waitForSelector?: string, storageState?: string, includeIframes?: boolean, actionSequence?: ActionStep[]): Promise<string>;
}
