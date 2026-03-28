export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface Session {
  id: string;
  orgId?: string;
  externalCustomerId?: string;
  emailThreadId?: string;
  createdAt: number;
  lastAccessedAt: number;
  turns: ConversationTurn[];
  originalRequest: {
    endpoint: string;
    error_code: string;
    request_body?: Record<string, unknown>;
    context?: string;
    tried?: string[];
  };
}
