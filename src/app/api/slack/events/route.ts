import { NextRequest as Request, NextResponse as Response } from "next/server";
import { after } from "next/server";
import { verifySlackSignature } from "@/lib/slack";
import { triggerTriageForSlackMessage } from "@/lib/triage";

export async function POST(req: Request) {
  const rawBody = await req.text();
  const timestamp = req.headers.get("x-slack-request-timestamp") ?? "";
  const signature = req.headers.get("x-slack-signature") ?? "";
  const signingSecret = process.env.SLACK_SIGNING_SECRET;

  if (signingSecret && !verifySlackSignature(signingSecret, rawBody, timestamp, signature)) {
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  const body = JSON.parse(rawBody);

  if (body.type === "url_verification") {
    return Response.json({ challenge: body.challenge });
  }

  const event = body.event;
  if (event && event.type === "app_mention" && !event.bot_id) {
    after(() =>
      triggerTriageForSlackMessage({
        channelId: event.channel,
        threadTs: event.thread_ts ?? event.ts,
        text: event.text,
        userId: event.user,
      }).catch(console.error)
    );
  }

  return Response.json({ ok: true });
}
