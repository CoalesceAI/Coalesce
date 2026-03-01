import { anthropic } from "@/lib/anthropic";
import { replyToThread } from "@/lib/slack";
import prisma from "@/lib/prisma";
import type { TriageResult } from "@/lib/triage";
import fs from "fs/promises";
import path from "path";

async function findDocFile(endpoint: string | null, docsPath: string): Promise<string | null> {
  let files: string[] = [];
  try {
    files = await fs.readdir(docsPath);
  } catch {
    return null;
  }

  if (endpoint) {
    const slug = endpoint.replace(/\//g, "-").replace(/^-/, "").toLowerCase();
    const match = files.find(
      (f) => f.toLowerCase().includes(slug) || slug.includes(f.replace(".md", "").toLowerCase())
    );
    if (match) return path.join(docsPath, match);
  }

  const mdFile = files.find((f) => f.endsWith(".md"));
  return mdFile ? path.join(docsPath, mdFile) : null;
}

async function generateDocFix(currentContent: string, issueDescription: string): Promise<string> {
  if (!anthropic) return currentContent;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: `You are a technical documentation editor. An AI agent reported the following documentation issue:

ISSUE:
${issueDescription}

CURRENT DOCUMENTATION:
${currentContent}

Rewrite the documentation to address the reported issue. Make minimal, targeted changes that resolve the problem. Return ONLY the updated documentation content — no preamble, no explanation.`,
      },
    ],
  });

  return response.content[0].type === "text" ? response.content[0].text : currentContent;
}

export async function executeDocsUpdateWorkflow(
  ticketId: string,
  issueText: string,
  triage: TriageResult,
  slackChannelId: string,
  slackThreadTs: string
) {
  const docsPath = process.env.FERN_DOCS_PATH ?? "./fern/pages";

  try {
    const docFilePath = await findDocFile(triage.endpoint, docsPath);

    if (!docFilePath) {
      await replyToThread(
        slackChannelId,
        slackThreadTs,
        "Could not locate a relevant documentation file. Escalating for human review."
      );
      await prisma.ticket.update({ where: { id: ticketId }, data: { status: "ESCALATED" } });
      return;
    }

    const originalContent = await fs.readFile(docFilePath, "utf-8");
    const fileName = path.basename(docFilePath);

    await replyToThread(
      slackChannelId,
      slackThreadTs,
      `Found documentation file: \`${fileName}\`. Generating fix...`
    );

    const updatedContent = await generateDocFix(originalContent, issueText);

    await fs.writeFile(docFilePath, updatedContent, "utf-8");

    await prisma.resolution.create({
      data: {
        ticketId,
        type: "DOCS_UPDATE",
        outcome: "SUCCESS",
        executedAt: new Date(),
        content: {
          filePath: docFilePath,
          fileName,
          originalContent,
          updatedContent,
        },
      },
    });

    await prisma.ticket.update({
      where: { id: ticketId },
      data: { status: "RESOLVED", resolvedAt: new Date() },
    });

    await replyToThread(
      slackChannelId,
      slackThreadTs,
      `Documentation updated successfully.\n\n*File:* \`${fileName}\`\n\nTo publish, commit the updated file and push to your Fern docs repository.`
    );
  } catch (err) {
    console.error("Docs update workflow error:", err);

    await prisma.ticket.update({ where: { id: ticketId }, data: { status: "ESCALATED" } });

    await prisma.resolution.create({
      data: {
        ticketId,
        type: "DOCS_UPDATE",
        outcome: "FAILURE",
        executedAt: new Date(),
        content: { error: String(err) },
      },
    });

    await replyToThread(
      slackChannelId,
      slackThreadTs,
      "The docs update workflow encountered an error. Ticket escalated for human review."
    );
  }
}
