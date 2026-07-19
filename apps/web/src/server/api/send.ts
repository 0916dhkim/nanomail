import { createServerFn } from "@tanstack/react-start";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
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
  /** UUID of the email this is a reply to (for threading + In-Reply-To). */
  replyToEmailId?: string;
}

/**
 * Build the standard Gmail-style quoted original block that appears below
 * the user's typed reply:
 *
 *   On <date>, <sender> wrote:
 *   > first line of original body
 *   > second line...
 */
function buildQuotedOriginal(opts: {
  from: string;
  date: Date;
  bodyText: string | null;
}): string {
  const dateStr = opts.date.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
  const quotedBody = (opts.bodyText || "(no body)")
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
  return `\n\nOn ${dateStr}, ${opts.from} wrote:\n\n${quotedBody}`;
}

export const sendEmailFn = createServerFn({ method: "POST" })
  .validator((data: SendEmailInput) => data)
  .handler(async ({ data }) => {
    const user = await getSession();
    if (!user) throw redirect({ to: "/login" });

    if (!data.to || !data.subject) {
      return { error: "To and subject are required" };
    }

    // Resolve the original email (if replying) — needed for In-Reply-To,
    // References, threadId, and the quoted body.
    let original: typeof emails.$inferSelect | null = null;
    if (data.replyToEmailId) {
      const db = await getDb();
      const [row] = await db
        .select()
        .from(emails)
        .where(and(eq(emails.id, data.replyToEmailId), eq(emails.to, user.email)))
        .limit(1);
      if (!row) {
        return { error: "Original email not found" };
      }
      original = row;
    }

    // Compose the full body: user's text + quoted original (if replying).
    let bodyText = data.bodyText ?? "";
    if (original) {
      bodyText += buildQuotedOriginal({
        from: original.from,
        date: original.receivedAt,
        bodyText: original.bodyText,
      });
    }

    // Build the References chain: original's references + original's messageId.
    let inReplyTo: string | undefined;
    let references: string | undefined;
    if (original?.messageId) {
      inReplyTo = original.messageId;
      // References should be the original's references (if any) followed by
      // the original's own Message-ID, per RFC 5322 §3.6.4.
      references = original.messageId;
    }

    const secrets = await getSecrets();
    const messageDomain = user.email.split("@")[1] || "nanomail.local";
    const localMessageId = `${randomUUID()}@${messageDomain}`;

    try {
      await sendEmailViaSes({
        accessKeyId: secrets.AWS_ACCESS_KEY_ID,
        secretAccessKey: secrets.AWS_SECRET_ACCESS_KEY,
        region: secrets.AWS_REGION,
        from: user.email,
        to: data.to,
        subject: data.subject,
        bodyText,
        bodyHtml: data.bodyHtml,
        messageId: localMessageId,
        inReplyTo,
        references,
        messageDomain,
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
      bodyText,
      bodyHtml: data.bodyHtml ?? null,
      isInbound: false,
      replyToEmailId: data.replyToEmailId ?? null,
      messageId: localMessageId,
      threadId: original?.threadId ?? randomUUID(),
    });

    return { success: true as const };
  });
