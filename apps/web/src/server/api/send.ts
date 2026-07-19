import { createServerFn } from "@tanstack/react-start";
import { and, eq } from "drizzle-orm";
import { redirect } from "@tanstack/react-router";
import { emails } from "@nanomail/db";
import { getDb } from "~/db";
import { getSession } from "~/auth";
import { getSecrets } from "~/secrets";
import { sendEmail as sendEmailViaSes } from "~/ses";

export interface SendEmailInput {
  to: string;
  subject: string;
  bodyText?: string;
  bodyHtml?: string;
  replyToEmailId?: string;
}

export const sendEmailFn = createServerFn({ method: "POST" })
  .validator((data: SendEmailInput) => data)
  .handler(async ({ data }) => {
    const user = await getSession();
    if (!user) throw redirect({ to: "/login" });

    if (!data.to || !data.subject) {
      return { error: "To and subject are required" };
    }

    // If replying, verify the original email belongs to the user and pull
    // its sender so we can address the reply correctly.
    let replyToEmailId = data.replyToEmailId;
    if (replyToEmailId) {
      const db = await getDb();
      const [original] = await db
        .select({ id: emails.id, from: emails.from })
        .from(emails)
        .where(and(eq(emails.id, replyToEmailId), eq(emails.to, user.email)))
        .limit(1);
      if (!original) {
        return { error: "Original email not found" };
      }
      // Reply recipient defaults to the original sender if not provided.
      if (!data.to) data.to = original.from;
    }

    const secrets = await getSecrets();
    try {
      await sendEmailViaSes({
        accessKeyId: secrets.AWS_ACCESS_KEY_ID,
        secretAccessKey: secrets.AWS_SECRET_ACCESS_KEY,
        region: secrets.AWS_REGION,
        from: user.email,
        to: data.to,
        subject: data.subject,
        bodyText: data.bodyText,
        bodyHtml: data.bodyHtml,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { error: `Failed to send: ${message}` };
    }

    // Store the sent email for history.
    const db = await getDb();
    await db.insert(emails).values({
      from: user.email,
      to: data.to,
      subject: data.subject,
      bodyText: data.bodyText ?? null,
      bodyHtml: data.bodyHtml ?? null,
      isInbound: false,
      replyToEmailId: replyToEmailId ?? null,
    });

    return { success: true as const };
  });
