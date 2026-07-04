export interface Env {
  /** Full URL of the backend ingest endpoint, e.g. https://app.example.com/api/ingest */
  INGEST_URL: string;
  /** Shared secret presented to the backend as a Bearer token. */
  INGEST_SECRET: string;
}

export default {
  async email(
    message: ForwardableEmailMessage,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    const raw = await new Response(message.raw).arrayBuffer();

    const res = await fetch(env.INGEST_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.INGEST_SECRET}`,
        "Content-Type": "message/rfc822",
        "X-Mail-From": message.from,
        "X-Mail-To": message.to,
      },
      body: raw,
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Ingest failed (${res.status}): ${detail}`);
    }
  },
} satisfies ExportedHandler<Env>;
