/**
 * AWS SES v2 email sending via raw fetch + manual Signature V4 signing.
 * Signing logic referenced from aws4fetch (MIT, Michael Hart 2024).
 *
 * Sends raw RFC 822 messages (SES `Content.Raw`) so we can set arbitrary
 * headers like Message-ID, In-Reply-To, and References for proper threading.
 */
import { createHmac, createHash, randomUUID } from "node:crypto";

// --- SigV4 Signing Helpers ---

function hmac(key: string | Buffer, data: string): Buffer {
  return createHmac("sha256", key).update(data).digest();
}

function sha256(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}

function getSigningKey(
  secretKey: string,
  date: string,
  region: string,
  service: string,
): Buffer {
  const kDate = hmac(Buffer.from("AWS4" + secretKey), date);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, "aws4_request");
}

interface SignedRequestInit {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
}

function signRequest(opts: {
  method: string;
  url: string;
  body: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  service: string;
}): SignedRequestInit {
  const { method, body, accessKeyId, secretAccessKey, region, service } = opts;
  const parsedUrl = new URL(opts.url);
  const datetime = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const date = datetime.slice(0, 8);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Host: parsedUrl.host,
    "X-Amz-Date": datetime,
    "X-Amz-Content-Sha256": sha256(body),
  };

  const signedHeaderKeys = Object.keys(headers)
    .map((k) => k.toLowerCase())
    .sort();
  const signedHeaders = signedHeaderKeys.join(";");
  const canonicalHeaders = signedHeaderKeys
    .map((k) => `${k}:${headers[Object.keys(headers).find((h) => h.toLowerCase() === k)!]!}`)
    .join("\n");

  const canonicalRequest = [
    method,
    parsedUrl.pathname,
    parsedUrl.searchParams.toString(),
    canonicalHeaders + "\n",
    signedHeaders,
    headers["X-Amz-Content-Sha256"],
  ].join("\n");

  const credentialScope = `${date}/${region}/${service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    datetime,
    credentialScope,
    sha256(canonicalRequest),
  ].join("\n");

  const signingKey = getSigningKey(opts.secretAccessKey, date, region, service);
  const signature = hmac(signingKey, stringToSign).toString("hex");

  headers["Authorization"] = [
    `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${signature}`,
  ].join(", ");

  return { url: opts.url, method, headers, body };
}

// --- RFC 822 message construction ---

/**
 * Fold a long header value into multiple lines per RFC 5322 §2.2.3.
 * Simple implementation: wrap at the first space after 78 cols.
 */
function foldHeader(value: string): string {
  if (value.length <= 78) return value;
  const out: string[] = [];
  let rest = value;
  while (rest.length > 78) {
    let breakAt = rest.lastIndexOf(" ", 78);
    if (breakAt <= 0) breakAt = 78;
    out.push(rest.slice(0, breakAt));
    rest = " " + rest.slice(breakAt).trimStart();
  }
  out.push(rest);
  return out.join("\r\n");
}

function encodeHeader(value: string): string {
  // Encode non-ASCII as RFC 2047 `=?UTF-8?B?...?=` chunks if needed.
  if (/^[\x20-\x7E]*$/.test(value)) return value;
  const b64 = Buffer.from(value, "utf-8").toString("base64");
  return `=?UTF-8?B?${b64}?=`;
}

export interface SendEmailOptions {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  from: string;
  to: string;
  subject: string;
  bodyText?: string;
  bodyHtml?: string;
  /** RFC 5322 Message-ID (without angle brackets). Generated if omitted. */
  messageId?: string;
  /** Message-ID this message replies to (without angle brackets). */
  inReplyTo?: string;
  /** Space-separated list of Message-IDs for the References header. */
  references?: string;
  /** Domain used to generate the Message-ID (e.g. "nanomail.probablydanny.com"). */
  messageDomain?: string;
}

/**
 * Build a minimal RFC 5322 message string. UTF-8 body, plain text (and HTML
 * multipart/alternative when bodyHtml is provided).
 */
export function buildRawMessage(opts: SendEmailOptions): string {
  const messageDomain = opts.messageDomain || "nanomail.local";
  const messageId = opts.messageId || `${randomUUID()}@${messageDomain}`;
  const lines: string[] = [
    `From: ${encodeHeader(opts.from)}`,
    `To: ${encodeHeader(opts.to)}`,
    `Subject: ${foldHeader(encodeHeader(opts.subject))}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${messageId}>`,
  ];
  if (opts.inReplyTo) lines.push(`In-Reply-To: <${opts.inReplyTo}>`);
  if (opts.references) lines.push(`References: ${opts.references.split(/\s+/).map((id) => `<${id}>`).join(" ")}`);
  lines.push("MIME-Version: 1.0");

  if (opts.bodyHtml) {
    const boundary = `nanomail-${randomUUID()}`;
    lines.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    lines.push("");
    lines.push(`--${boundary}`);
    lines.push("Content-Type: text/plain; charset=UTF-8");
    lines.push("Content-Transfer-Encoding: 8bit");
    lines.push("");
    lines.push(opts.bodyText || "");
    lines.push("");
    lines.push(`--${boundary}`);
    lines.push("Content-Type: text/html; charset=UTF-8");
    lines.push("Content-Transfer-Encoding: 8bit");
    lines.push("");
    lines.push(opts.bodyHtml);
    lines.push("");
    lines.push(`--${boundary}--`);
  } else {
    lines.push("Content-Type: text/plain; charset=UTF-8");
    lines.push("Content-Transfer-Encoding: 8bit");
    lines.push("");
    lines.push(opts.bodyText || "");
  }

  return lines.join("\r\n");
}

export async function sendEmail(opts: SendEmailOptions): Promise<{ messageId: string }> {
  const {
    accessKeyId,
    secretAccessKey,
    region,
    from,
    to,
  } = opts;

  const messageDomain = opts.messageDomain || "nanomail.local";
  const messageId = opts.messageId || `${randomUUID()}@${messageDomain}`;

  const rawMessage = buildRawMessage({ ...opts, messageId });

  const url = `https://email.${region}.amazonaws.com/v2/email/outbound-emails`;
  const body = JSON.stringify({
    FromEmailAddress: from,
    Destination: { ToAddresses: [to] },
    Content: {
      Raw: {
        Data: Buffer.from(rawMessage, "utf-8").toString("base64"),
      },
    },
  });

  const signed = signRequest({
    method: "POST",
    url,
    body,
    accessKeyId,
    secretAccessKey,
    region,
    service: "ses",
  });

  const res = await fetch(signed.url, {
    method: signed.method,
    headers: signed.headers,
    body: signed.body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SES send failed (${res.status}): ${text}`);
  }

  return { messageId };
}
