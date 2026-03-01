import { anthropic } from "./anthropic";
import { replyToThread } from "./slack";
import prisma from "./prisma";
import { executeDocsUpdateWorkflow } from "./workflows/docs-update";

export interface SlackMessage {
  channelId: string;
  threadTs: string;
  text: string;
  userId: string;
}

export interface TriageResult {
  category: "DOCS_ISSUE" | "API_BUG" | "CONFIG_ERROR" | "BILLING" | "UNKNOWN";
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  vendor: string;
  endpoint: string | null;
  errorCode: string | null;
  summary: string;
  confidence: number;
}

async function classifyTicket(rawContent: string): Promise<TriageResult> {
  if (!anthropic) {
    return {
      category: "UNKNOWN",
      priority: "MEDIUM",
      vendor: "Unknown",
      endpoint: null,
      errorCode: null,
      summary: rawContent.slice(0, 120),
      confidence: 0,
    };
  }

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 512,
    messages: [
      {
        role: "user",
        content: `You are a triage engine for an AI agent support platform. Classify this support message and extract structured context.

Message:
${rawContent}

Respond ONLY with a JSON object matching this exact schema (no markdown fences, just raw JSON):
{
  "category": "DOCS_ISSUE" | "API_BUG" | "CONFIG_ERROR" | "BILLING" | "UNKNOWN",
  "priority": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
  "vendor": "string (e.g. Stripe, Twilio, AgentMail, Unknown)",
  "endpoint": "string | null (e.g. /v1/charges)",
  "errorCode": "string | null (e.g. 404, invalid_api_key)",
  "summary": "string (one sentence)",
  "confidence": 0.0-1.0
}`,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text.trim() : "{}";
  try {
    return JSON.parse(text) as TriageResult;
  } catch {
    return {
      category: "UNKNOWN",
      priority: "MEDIUM",
      vendor: "Unknown",
      endpoint: null,
      errorCode: null,
      summary: rawContent.slice(0, 120),
      confidence: 0,
    };
  }
}

export async function triggerTriageForSlackMessage(msg: SlackMessage) {
  const slackWorkspaceId = process.env.SLACK_WORKSPACE_ID;
  const team = slackWorkspaceId
    ? await prisma.team.findUnique({ where: { slackWorkspaceId } })
    : await prisma.team.findFirst();
  if (!team) {
    console.error("[Triage] No team found for Slack workspace:", slackWorkspaceId ?? "(any)");
    return;
  }

  const idempotencyKey = `slack:${msg.channelId}:${msg.threadTs}`;
  const existing = await prisma.ticket.findUnique({ where: { idempotencyKey } });
  if (existing) {
    console.log("[Triage] Duplicate Slack event, skipping:", idempotencyKey);
    return;
  }

  await replyToThread(msg.channelId, msg.threadTs, "Received your report. Triaging now...");

  const triage = await classifyTicket(msg.text);

  const ticket = await prisma.ticket.create({
    data: {
      teamId: team.id,
      source: "SLACK",
      status: "TRIAGING",
      priority: triage.priority,
      category: triage.category,
      title: triage.summary,
      rawContent: msg.text,
      agentIdentifier: msg.userId,
      slackChannelId: msg.channelId,
      slackThreadTs: msg.threadTs,
      idempotencyKey,
      structuredContext: {
        vendor: triage.vendor,
        endpoint: triage.endpoint,
        errorCode: triage.errorCode,
        confidence: triage.confidence,
      },
    },
  });

  await replyToThread(
    msg.channelId,
    msg.threadTs,
    `Classified as *${triage.category}* (vendor: ${triage.vendor}). Running resolution workflow...`
  );

  await prisma.ticket.update({
    where: { id: ticket.id },
    data: { status: "IN_PROGRESS" },
  });

  if (triage.category === "DOCS_ISSUE") {
    await executeDocsUpdateWorkflow(
      ticket.id,
      msg.text,
      triage,
      msg.channelId,
      msg.threadTs
    );
  } else {
    await prisma.ticket.update({
      where: { id: ticket.id },
      data: { status: "ESCALATED" },
    });
    await replyToThread(
      msg.channelId,
      msg.threadTs,
      `Category *${triage.category}* is not handled by an automated workflow. Ticket escalated for human review.`
    );
  }
}
