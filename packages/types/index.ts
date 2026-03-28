// Shared domain interfaces for Coalesce admin UI and API server.
// Copied from src/domain/ — do not import from src/ directly.

export interface Organization {
  id: string;
  slug: string;
  name: string;
  settings: Record<string, unknown>;
  signing_secret: string;
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date | null;
}

export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface Session {
  id: string;
  orgId?: string;
  externalCustomerId?: string;
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

export interface ApiKey {
  id: string;
  org_id: string;
  key_hash: string;
  label: string;
  prefix: string;
  revoked_at: Date | null;
  created_at: Date;
  last_used_at: Date | null;
}
