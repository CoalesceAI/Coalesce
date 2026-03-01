export type EventType = "error" | "warning" | "info";

export interface EventContext {
  endpoint?: string;
  request?: unknown;
  response?: unknown;
  errorCode?: string | number;
  errorMessage?: string;
  [key: string]: unknown;
}

export interface CoalesceEvent {
  agentId: string;
  eventType: EventType;
  context: EventContext;
  webhookUrl?: string;
  idempotencyKey?: string;
  timestamp?: string;
}

export interface IngestResponse {
  ticketId: string | null;
  eventId: string;
  status: "accepted";
}

export interface CoalesceClientOptions {
  apiKey: string;
  baseUrl?: string;
  batchSize?: number;
  flushInterval?: number;
}
