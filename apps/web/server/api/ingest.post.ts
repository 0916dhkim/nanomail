import { defineEventHandler } from "h3";
import PostalMime from "postal-mime";
import { emails } from "@nanomail/db";
import { getDb } from "~/db";
import { getSecrets } from "~/secrets";

/**
 * Inbound-email ingestion endpoint. The Cloudflare email worker forwards the
 * raw RFC822 message here; all parsing and DB writes happen in this backend so
 * the worker never touches the database directly.
 */
export default defineEventHandler(async (event) => {
  const { INGEST_SECRET } = await getSecrets();
  const authorization = event.req.headers.get("authorization");
  if (authorization !== `Bearer ${INGEST_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const from = event.req.headers.get("x-mail-from");
  const to = event.req.headers.get("x-mail-to");
  if (!from || !to) {
    return new Response("Missing X-Mail-From / X-Mail-To headers", {
      status: 400,
    });
  }

  const raw = await event.req.arrayBuffer();
  const parsed = await PostalMime.parse(raw);

  const db = await getDb();
  await db.insert(emails).values({
    from,
    to,
    subject: parsed.subject ?? "",
    bodyText: parsed.text ?? null,
    bodyHtml: parsed.html ?? null,
    isInbound: true,
    receivedAt: new Date(),
  });

  return { ok: true };
});
