import { defineEventHandler } from "h3";
import PostalMime from "postal-mime";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { emails } from "@nanomail/db";
import { getDb } from "~/db";
import { getSecrets } from "~/secrets";
import { log } from "~/logger";

/**
 * Inbound-email ingestion endpoint. The Cloudflare email worker forwards the
 * raw RFC822 message here; all parsing and DB writes happen in this backend so
 * the worker never touches the database directly.
 */
export default defineEventHandler(async (event) => {
  const { INGEST_SECRET } = await getSecrets();
  const authorization = event.req.headers.get("authorization");
  if (authorization !== `Bearer ${INGEST_SECRET}`) {
    log.warn("ingest: unauthorized", {
      hasAuth: !!authorization,
    });
    return new Response("Unauthorized", { status: 401 });
  }

  const from = event.req.headers.get("x-mail-from");
  const to = event.req.headers.get("x-mail-to");
  if (!from || !to) {
    log.warn("ingest: missing mail-from/to headers", { from, to });
    return new Response("Missing X-Mail-From / X-Mail-To headers", {
      status: 400,
    });
  }

  const raw = await event.req.arrayBuffer();
  const parsed = await PostalMime.parse(raw);

  // PostalMime exposes Message-ID and inReplyTo as parsed header values
  // (strings). Strip any angle brackets for storage so lookups are simple.
  const messageId = parsed.messageId?.replace(/^<|>$/g, "") || null;
  const inReplyToRaw = parsed.inReplyTo?.replace(/^<|>$/g, "") || null;
  const referencesRaw = parsed.references
    ?.split(/\s+/)
    .map((s) => s.replace(/^<|>$/g, ""))
    .filter(Boolean) ?? [];

  log.info("ingest: received", {
    from,
    to,
    subject: parsed.subject ?? "",
    messageId,
    inReplyTo: inReplyToRaw,
    hasHtml: !!parsed.html,
    hasText: !!parsed.text,
  });

  const db = await getDb();

  // Resolve the thread: if this is a reply, try to find an existing email
  // whose messageId matches In-Reply-To or any of References. Fall back to
  // starting a new thread.
  let threadId: string | null = null;
  let threadSource: "in-reply-to" | "references" | "new" = "new";
  const candidateIds = [inReplyToRaw, ...referencesRaw].filter(
    (x): x is string => x != null,
  );
  for (const candidateId of candidateIds) {
    const [existing] = await db
      .select({ threadId: emails.threadId })
      .from(emails)
      .where(eq(emails.messageId, candidateId))
      .limit(1);
    if (existing?.threadId) {
      threadId = existing.threadId;
      threadSource = candidateId === inReplyToRaw ? "in-reply-to" : "references";
      break;
    }
  }
  if (!threadId) {
    threadId = randomUUID();
  }

  log.info("ingest: resolved thread", {
    threadId,
    threadSource,
    from,
    messageId,
  });

  await db.insert(emails).values({
    from,
    to,
    subject: parsed.subject ?? "",
    bodyText: parsed.text ?? null,
    bodyHtml: parsed.html ?? null,
    isInbound: true,
    messageId,
    threadId,
  });

  log.info("ingest: stored", {
    from,
    to,
    threadId,
    messageId,
  });

  return { ok: true };
});
