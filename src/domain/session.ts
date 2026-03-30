export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

export type SessionStatus = 'active' | 'resolved' | 'needs_info' | 'unknown';

export interface Session {
  id: string;
  orgId?: string;
  externalCustomerId?: string;
  emailThreadId?: string;
  createdAt: number;
  lastAccessedAt: number;
  status: SessionStatus;
  resolvedAt?: number;
  turns: ConversationTurn[];
  originalRequest: {
    endpoint: string;
    error_code: string;
    request_body?: Record<string, unknown>;
    context?: string;
    tried?: string[];
  };
}
