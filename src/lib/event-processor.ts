import prisma from "./prisma";
import { executeSesSuppressionWorkflow } from "./workflows/ses-suppression";

const SES_EVENT_TYPES = new Set([
  "ses_suppression",
  "email_bounce",
  "email_spam_flag",
  "ses_bounce",
]);

export async function processEvent(eventId: string): Promise<void> {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event || event.processed) return;

  if (!SES_EVENT_TYPES.has(event.eventType)) {
    await prisma.event.update({ where: { id: eventId }, data: { processed: true } });
    return;
  }

  const payload = event.payload as {
    context: {
      email?: string;
      errorMessage?: string;
      endpoint?: string;
      errorCode?: string;
    };
    webhookUrl?: string;
    idempotencyKey?: string;
  };

  const email = payload.context?.email;
  if (!email) {
    console.warn(`[EventProcessor] Event ${eventId} missing email in context`);
    await prisma.event.update({ where: { id: eventId }, data: { processed: true } });
    return;
  }

  const ticket = await prisma.ticket.create({
    data: {
      teamId: event.teamId,
      source: "SDK",
      status: "IN_PROGRESS",
      priority: "HIGH",
      category: "API_BUG",
      title: `SES suppression: ${email}`,
      rawContent: JSON.stringify(payload.context, null, 2),
      agentIdentifier: event.agentIdentifier,
      structuredContext: payload.context,
      webhookUrl: payload.webhookUrl ?? null,
      idempotencyKey: payload.idempotencyKey ?? null,
    },
  });

  await prisma.event.update({
    where: { id: eventId },
    data: { processed: true, ticketId: ticket.id },
  });

  await executeSesSuppressionWorkflow(ticket.id, email);
}
