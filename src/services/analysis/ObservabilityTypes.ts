// ─── Log Event Types ──────────────────────────────────────────────────────────

export type LogEventType =
  | 'tool_start'
  | 'tool_end'
  | 'tool_error'
  | 'warning'
  | 'system';

export interface BaseLogEvent {
  type: LogEventType;
  traceId: string;
  timestamp: string;   // ISO 8601
}

export interface ToolStartEvent extends BaseLogEvent {
  type: 'tool_start';
  tool: string;
  inputSummary: Record<string, any>;
}

export interface ToolEndEvent extends BaseLogEvent {
  type: 'tool_end';
  tool: string;
  success: boolean;
  durationMs: number;
  outputSummary: Record<string, any>;
}

export interface ToolErrorEvent extends BaseLogEvent {
  type: 'tool_error';
  tool: string;
  errorMessage: string;
  stack?: string;
  durationMs: number;
}

export interface WarningEvent extends BaseLogEvent {
  type: 'warning';
  message: string;
  context?: Record<string, any>;
}

export type LogEvent = ToolStartEvent | ToolEndEvent | ToolErrorEvent | WarningEvent;
