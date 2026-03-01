import {
  SESv2Client,
  DeleteSuppressedDestinationCommand,
  GetSuppressedDestinationCommand,
} from "@aws-sdk/client-sesv2";
import prisma from "@/lib/prisma";

const sesClient = new SESv2Client({
  region: process.env.AWS_REGION ?? "us-east-1",
  ...(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
    ? {
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        },
      }
    : {}),
});

async function isOnSuppressionList(email: string): Promise<boolean> {
  try {
    await sesClient.send(
      new GetSuppressedDestinationCommand({ EmailAddress: email })
    );
    return true;
  } catch (err: unknown) {
    if ((err as { name?: string }).name === "NotFoundException") return false;
    throw err;
  }
}

async function removeFromSuppressionList(email: string): Promise<void> {
  await sesClient.send(
    new DeleteSuppressedDestinationCommand({ EmailAddress: email })
  );
}

async function notifyWebhook(
  webhookUrl: string,
  ticketId: string,
  email: string,
  outcome: "SUCCESS" | "FAILURE",
  message: string
): Promise<void> {
  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticketId, email, outcome, message }),
    });
  } catch (err) {
    console.error("[SES Workflow] Webhook notification failed:", err);
  }
}

export async function executeSesSuppressionWorkflow(
  ticketId: string,
  email: string
): Promise<void> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { webhookUrl: true },
  });
  const webhookUrl = ticket?.webhookUrl ?? undefined;

  try {
    const onList = await isOnSuppressionList(email);

    if (!onList) {
      await prisma.resolution.create({
        data: {
          ticketId,
          type: "API_ACTION",
          outcome: "SUCCESS",
          executedAt: new Date(),
          content: {
            email,
            action: "no_action_needed",
            message: `${email} was not on the SES suppression list`,
          },
        },
      });

      await prisma.ticket.update({
        where: { id: ticketId },
        data: { status: "RESOLVED", resolvedAt: new Date() },
      });

      if (webhookUrl) {
        await notifyWebhook(
          webhookUrl,
          ticketId,
          email,
          "SUCCESS",
          `${email} was not on the SES suppression list — no action needed`
        );
      }

      return;
    }

    await removeFromSuppressionList(email);

    await prisma.resolution.create({
      data: {
        ticketId,
        type: "API_ACTION",
        outcome: "SUCCESS",
        executedAt: new Date(),
        content: {
          email,
          action: "removed_from_suppression_list",
          message: `${email} successfully removed from SES suppression list`,
        },
      },
    });

    await prisma.ticket.update({
      where: { id: ticketId },
      data: { status: "RESOLVED", resolvedAt: new Date() },
    });

    if (webhookUrl) {
      await notifyWebhook(
        webhookUrl,
        ticketId,
        email,
        "SUCCESS",
        `${email} successfully removed from SES suppression list`
      );
    }
  } catch (err) {
    console.error("[SES Workflow] Error:", err);

    await prisma.resolution.create({
      data: {
        ticketId,
        type: "API_ACTION",
        outcome: "FAILURE",
        executedAt: new Date(),
        content: { email, error: String(err) },
      },
    });

    await prisma.ticket.update({
      where: { id: ticketId },
      data: { status: "ESCALATED" },
    });

    if (webhookUrl) {
      await notifyWebhook(
        webhookUrl,
        ticketId,
        email,
        "FAILURE",
        `Failed to remove ${email} from SES suppression list — escalated for human review`
      );
    }
  }
}
