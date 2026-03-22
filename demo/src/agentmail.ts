// ---------------------------------------------------------------------------
// agentmail.ts — Makes a bad API call to AgentMail and extracts the support URL
// ---------------------------------------------------------------------------

export interface AgentMailErrorBody {
  name: string;
  message?: string;
  errors?: unknown[];
  support?: string;
  [key: string]: unknown;
}

export interface FailingRequestResult {
  statusCode: number;
  error: AgentMailErrorBody;
  supportUrl: string | undefined;
}

// ---------------------------------------------------------------------------
// makeFailingRequest — POSTs to a non-existent inbox to trigger a 404 error
// ---------------------------------------------------------------------------

export async function makeFailingRequest(): Promise<FailingRequestResult> {
  const apiKey = process.env['AGENTMAIL_API_KEY'];
  const baseUrl =
    process.env['AGENTMAIL_BASE_URL'] ?? 'https://api.agentmail.to/v0';

  if (!apiKey) {
    throw new Error(
      'AGENTMAIL_API_KEY is not set. Copy .env.example to .env and fill in your key.'
    );
  }

  // POST to a non-existent inbox — will return 404 NotFoundError
  const url = `${baseUrl}/inboxes/nonexistent-inbox-id/messages`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      subject: 'Test',
      text: 'Hello',
    }),
  });

  const errorBody = (await response.json()) as AgentMailErrorBody;

  // Extract support URL from error response, fall back to env var with constructed params
  let supportUrl = errorBody.support;

  if (!supportUrl) {
    const fallbackBase = process.env['COALESCE_WS_URL'];
    if (fallbackBase) {
      const params = new URLSearchParams({
        endpoint: '/v0/inboxes/{inbox_id}/messages',
        error_code: String(response.status),
        method: 'POST',
        context: errorBody.name ?? 'NotFoundError',
      });
      supportUrl = `${fallbackBase}/ws/agentmail?${params.toString()}`;
    }
  }

  return {
    statusCode: response.status,
    error: errorBody,
    supportUrl,
  };
}
