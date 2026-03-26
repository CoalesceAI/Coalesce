/**
 * Email channel handler.
 *
 * Receives an AgentMail webhook (message.received), runs diagnosis,
 * and replies with the resolution.
 */

import type { WebhookPayload } from './types.js';
import { parseEmailForErrorContext } from './parser.js';
import { sendReply } from './reply.js';
import { diagnose } from '../../services/diagnosis.js';
import { loadOrgDocs } from '../../repositories/documents.js';
import { getOrgBySlug } from '../../repositories/organizations.js';
import type { SupportRequest } from '../../schemas/request.js';

export interface EmailChannelConfig {
  agentmailBaseUrl: string;
  agentmailApiKey: string;
}

export async function handleIncomingEmail(
  orgSlug: string,
  payload: WebhookPayload,
  config: EmailChannelConfig,
): Promise<void> {
  const org = await getOrgBySlug(orgSlug);
  if (!org) {
    console.error(`[email] Org '${orgSlug}' not found`);
    return;
  }

  const { message } = payload;
  const parsed = parseEmailForErrorContext(message);

  console.log(`[email] Incoming from ${typeof message.from === 'string' ? message.from : message.from.address} | subject: ${message.subject}`);

  // Load org docs
  const docsContext = await loadOrgDocs(org.id);
  if (!docsContext) {
    console.error(`[email] No docs found for org '${orgSlug}'`);
    return;
  }

  // Build a support request from the email
  const request: SupportRequest = {
    endpoint: parsed.endpoint,
    error_code: parsed.error_code,
    context: parsed.context || `Email support request: ${message.subject}`,
    // Pass the full email body as additional context via 'tried'
    tried: [`Customer email: ${parsed.body.slice(0, 1000)}`],
  };

  // Run diagnosis
  const { response: diagnosis } = await diagnose(request, docsContext, [], undefined, org.name);

  // Format reply
  let replyText: string;

  if (diagnosis.status === 'resolved') {
    replyText = [
      `Hi,`,
      ``,
      `Here's what we found:`,
      ``,
      `**Diagnosis:** ${diagnosis.diagnosis}`,
      ``,
      `**Fix:** ${diagnosis.fix}`,
      ``,
      ...(diagnosis.fix_steps?.length
        ? [`**Steps:**`, ...diagnosis.fix_steps.map((s, i) => `${i + 1}. ${s.action}`)]
        : []),
      ``,
      ...(diagnosis.references?.length
        ? [`**References:** ${diagnosis.references.join(', ')}`]
        : []),
      ``,
      `— Coalesce (automated support)`,
    ].join('\n');
  } else if (diagnosis.status === 'needs_info') {
    replyText = [
      `Hi,`,
      ``,
      `We need a bit more info to diagnose this:`,
      ``,
      diagnosis.question || 'Could you provide more details about the error?',
      ``,
      ...(diagnosis.need_to_clarify?.length
        ? [`Specifically:`, ...diagnosis.need_to_clarify.map(q => `- ${q}`)]
        : []),
      ``,
      `Just reply to this email with the details.`,
      ``,
      `— Coalesce (automated support)`,
    ].join('\n');
  } else if (diagnosis.status === 'unknown') {
    replyText = [
      `Hi,`,
      ``,
      `We couldn't find a specific resolution in our docs for this issue.`,
      ``,
      diagnosis.explanation || 'This may require manual investigation.',
      ``,
      `We've flagged this for the team.`,
      ``,
      `— Coalesce (automated support)`,
    ].join('\n');
  } else {
    replyText = [
      `Hi,`,
      ``,
      `We encountered an error processing your support request. The team has been notified.`,
      ``,
      `— Coalesce (automated support)`,
    ].join('\n');
  }

  // Send reply
  await sendReply({
    agentmailBaseUrl: config.agentmailBaseUrl,
    agentmailApiKey: config.agentmailApiKey,
    inboxId: message.inbox_id,
    messageId: message.message_id,
    text: replyText,
  });

  console.log(`[email] Replied to ${typeof message.from === 'string' ? message.from : message.from.address} | status: ${diagnosis.status}`);
}
