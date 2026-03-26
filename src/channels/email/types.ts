/**
 * AgentMail webhook payload types for message.received events
 */

export interface WebhookPayload {
  type: 'event';
  event_type: 'message.received';
  event_id: string;
  message: IncomingMessage;
  thread: Thread;
}

export interface IncomingMessage {
  message_id: string;
  inbox_id: string;
  thread_id: string;
  from: string | { address: string; name?: string };
  to: string | string[];
  cc?: string | string[];
  subject: string;
  text?: string;
  html?: string;
  extracted_text?: string;
  in_reply_to?: string;
  references?: string[];
  timestamp: string;
  created_at: string;
}

export interface Thread {
  thread_id: string;
  subject: string;
  message_count: number;
}
