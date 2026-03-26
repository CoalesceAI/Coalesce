/**
 * Extract error context from an email body.
 *
 * People/agents email support with things like:
 *   "I'm getting a 404 when I call /v0/inboxes/foo"
 *   "Message rejected error when sending to external email"
 *   "Domain verification stuck"
 *
 * We extract what we can and pass it to the diagnosis engine.
 */

import type { IncomingMessage } from './types.js';

export interface ParsedErrorContext {
  endpoint?: string;
  error_code?: string;
  context?: string;
  body: string; // the full email text for Claude to work with
}

export function parseEmailForErrorContext(message: IncomingMessage): ParsedErrorContext {
  const text = message.extracted_text || message.text || message.subject || '';

  // Try to extract HTTP status codes
  const statusMatch = text.match(/\b(400|401|403|404|409|429|500|502|503)\b/);
  const error_code = statusMatch?.[1];

  // Try to extract API endpoints
  const endpointMatch = text.match(/\/v\d+\/[a-zA-Z\/_\-{}]+/);
  const endpoint = endpointMatch?.[0];

  // Try to extract error names
  const errorNameMatch = text.match(/(NotFoundError|ValidationError|ForbiddenError|UnauthorizedError|MessageRejectedError|DomainNotVerifiedError|RateLimitError|ServerError)/i);
  const context = errorNameMatch?.[1];

  return {
    endpoint,
    error_code,
    context,
    body: text,
  };
}
