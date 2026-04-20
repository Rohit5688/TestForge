export interface TraceAction {
  type: string;                    // 'click' | 'fill' | 'navigate' | 'waitForSelector' | etc.
  apiName: string | undefined;     // Playwright API name e.g. 'page.click'
  selector: string | undefined;    // Element targeted
  value: string | undefined;       // Value entered (fill)
  url: string | undefined;         // URL navigated to
  startTime: number;               // ms since trace start
  endTime: number | undefined;     // ms since trace start
  duration: number | undefined;    // ms
  error: string | undefined;       // Error message if action failed
  hasError: boolean;
}

export interface TraceNetworkCall {
  url: string;
  method: string;
  status: number | undefined;
  startTime: number;
  endTime: number | undefined;
  duration: number | undefined;
  isXhr: boolean;                  // true for XHR / fetch calls
}

export interface SuspiciousGap {
  afterAction: string;   // Description of action
  beforeAction: string;  // Description of next action
  gapMs: number;         // Time between them
  warning: string;       // Why this is suspicious
}

export interface TraceReport {
  traceFile: string;
  totalActions: number;
  failedAction: TraceAction | undefined;  // undefined when test passed
  actionsNearFailure: TraceAction[];
  networkDuringFailure: TraceNetworkCall[];
  suspiciousGaps: SuspiciousGap[];
  hasScreenshotAtFailure: boolean;
  summary: string;
}
