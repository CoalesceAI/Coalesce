/**
 * Send a reply email via AgentMail API.
 */

export interface ReplyOptions {
  agentmailBaseUrl: string;
  agentmailApiKey: string;
  inboxId: string;
  messageId: string;
  text: string;
}

export async function sendReply(options: ReplyOptions): Promise<void> {
  const { agentmailBaseUrl, agentmailApiKey, inboxId, messageId, text } = options;

  const url = `${agentmailBaseUrl}/inboxes/${encodeURIComponent(inboxId)}/messages/${encodeURIComponent(messageId)}/reply`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${agentmailApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`[email] Reply failed: ${res.status} ${body}`);
  }
}
