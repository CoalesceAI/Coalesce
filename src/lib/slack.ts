import { WebClient } from "@slack/web-api";
import crypto from "crypto";

const slackBotToken = process.env.SLACK_BOT_TOKEN;

export const slackClient = slackBotToken ? new WebClient(slackBotToken) : null;

export function verifySlackSignature(
  signingSecret: string,
  rawBody: string,
  timestamp: string,
  signature: string
): boolean {
  const baseString = `v0:${timestamp}:${rawBody}`;
  const hmac = crypto.createHmac("sha256", signingSecret);
  hmac.update(baseString);
  const computed = `v0=${hmac.digest("hex")}`;
  try {
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signature));
  } catch {
    return false;
  }
}

export async function replyToThread(
  channelId: string,
  threadTs: string,
  text: string
) {
  if (!slackClient) {
    console.warn("[Slack] SLACK_BOT_TOKEN not set, skipping reply");
    return;
  }
  return slackClient.chat.postMessage({
    channel: channelId,
    thread_ts: threadTs,
    text,
  });
}
