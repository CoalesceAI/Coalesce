/**
 * Email channel handler.
 *
 * Receives an AgentMail webhook (message.received), runs diagnosis,
 * and replies with the resolution. Uses thread_id for multi-turn
 * session continuity — follow-up emails in the same thread continue
 * the conversation.
 */

import type { WebhookPayload } from './types.js';
import { parseEmailForErrorContext } from './parser.js';
import { sendReply } from './reply.js';
import { diagnose, buildUserMessage } from '../../services/diagnosis.js';
import { loadOrgDocs } from '../../repositories/documents.js';
import { getOrgBySlug } from '../../repositories/organizations.js';
import type { SessionStore } from '../../repositories/sessions.js';
import type { Session } from '../../domain/session.js';
import type { SupportRequest } from '../../schemas/request.js';

export interface EmailChannelConfig {
  agentmailBaseUrl: string;
  agentmailApiKey: string;
  sessionStore: SessionStore;
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

  const { message, thread } = payload;
  const parsed = parseEmailForErrorContext(message);
  const fromAddr = typeof message.from === 'string' ? message.from : message.from.address;

  console.log(`[email] Incoming from ${fromAddr} | subject: ${message.subject} | thread: ${thread.thread_id} (${thread.message_count} messages)`);

  // Load org docs
  const docsContext = await loadOrgDocs(org.id);
  if (!docsContext) {
    console.error(`[email] No docs found for org '${orgSlug}'`);
    return;
  }

  // -------------------------------------------------------------------------
  // Session lookup: thread_id → existing session, or create new
  // -------------------------------------------------------------------------

  let session: Session;
  let isFollowUp = false;

  const existing = await config.sessionStore.getByThreadId(thread.thread_id);

  if (existing) {
    session = existing;
    isFollowUp = true;
    console.log(`[email] Continuing session ${session.id} (${session.turns.length} turns)`);
  } else {
    session = {
      id: crypto.randomUUID(),
      orgId: org.id,
      emailThreadId: thread.thread_id,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
      status: 'active',
      turns: [],
      originalRequest: {
        endpoint: parsed.endpoint ?? '',
        error_code: parsed.error_code ?? '',
        context: parsed.context || `Email support request: ${message.subject}`,
        tried: [],
      },
    };
    console.log(`[email] New session ${session.id}`);
  }

  // Build request for diagnosis
  const request: SupportRequest = isFollowUp
    ? {
        session_id: session.id,
        answer: {
          clarifications: { reply: parsed.body.slice(0, 2000) },
        },
      }
    : {
        endpoint: parsed.endpoint,
        error_code: parsed.error_code,
        context: parsed.context || `Email support request: ${message.subject}`,
        tried: [`Customer email: ${parsed.body.slice(0, 1000)}`],
      };

  // Run diagnosis with full conversation history
  const { response: diagnosis, assistantContent } = await diagnose(
    request,
    docsContext,
    session.turns,
    undefined,
    org.name,
  );

  // Store turns
  const userContent = buildUserMessage(request, isFollowUp);
  session.turns.push({ role: 'user', content: userContent });
  session.turns.push({ role: 'assistant', content: assistantContent });
  session.lastAccessedAt = Date.now();
  await config.sessionStore.set(session.id, session);

  // Format reply
  const replyText = formatReply(diagnosis);

  // Send reply
  await sendReply({
    agentmailBaseUrl: config.agentmailBaseUrl,
    agentmailApiKey: config.agentmailApiKey,
    inboxId: message.inbox_id,
    messageId: message.message_id,
    text: replyText,
  });

  console.log(`[email] Replied to ${fromAddr} | status: ${diagnosis.status} | session: ${session.id} | turn: ${Math.ceil(session.turns.length / 2)}`);
}

function formatReply(diagnosis: { status: string; [key: string]: unknown }): string {
  if (diagnosis.status === 'resolved') {
    const d = diagnosis as { status: 'resolved'; diagnosis: string; fix: string; fix_steps?: { action: string }[]; references?: string[] };
    return [
      `Here's what we found:`,
      ``,
      `**Diagnosis:** ${d.diagnosis}`,
      ``,
      `**Fix:** ${d.fix}`,
      ...(d.fix_steps?.length
        ? [``, `**Steps:**`, ...d.fix_steps.map((s, i) => `${i + 1}. ${s.action}`)]
        : []),
      ...(d.references?.length
        ? [``, `**References:** ${d.references.join(', ')}`]
        : []),
      ``,
      `— Apoyo (automated support)`,
    ].join('\n');
  }

  if (diagnosis.status === 'needs_info') {
    const d = diagnosis as { status: 'needs_info'; question?: string; need_to_clarify?: string[] };
    return [
      `We need a bit more info to diagnose this:`,
      ``,
      d.question || 'Could you provide more details about the error?',
      ...(d.need_to_clarify?.length
        ? [``, `Specifically:`, ...d.need_to_clarify.map(q => `- ${q}`)]
        : []),
      ``,
      `Just reply to this email with the details.`,
      ``,
      `— Apoyo (automated support)`,
    ].join('\n');
  }

  if (diagnosis.status === 'unknown') {
    const d = diagnosis as { status: 'unknown'; explanation?: string };
    return [
      `We couldn't find a specific resolution in our docs for this issue.`,
      ``,
      d.explanation || 'This may require manual investigation.',
      ``,
      `— Apoyo (automated support)`,
    ].join('\n');
  }

  return [
    `We encountered an error processing your support request.`,
    ``,
    `— Apoyo (automated support)`,
  ].join('\n');
}
