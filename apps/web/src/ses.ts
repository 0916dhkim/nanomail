/**
 * AWS SES v2 email sending via raw fetch + manual Signature V4 signing.
 * Signing logic referenced from aws4fetch (MIT, Michael Hart 2024).
 */
import { createHmac, createHash } from "node:crypto";

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

  const signingKey = getSigningKey(secretAccessKey, date, region, service);
  const signature = hmac(signingKey, stringToSign).toString("hex");

  headers["Authorization"] = [
    `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${signature}`,
  ].join(", ");

  return { url: opts.url, method, headers, body };
}

// --- SES v2 API ---

export interface SendEmailOptions {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  from: string;
  to: string;
  subject: string;
  bodyText?: string;
  bodyHtml?: string;
}

export async function sendEmail(opts: SendEmailOptions): Promise<void> {
  const {
    accessKeyId,
    secretAccessKey,
    region,
    from,
    to,
    subject,
    bodyText,
    bodyHtml,
  } = opts;

  const url = `https://email.${region}.amazonaws.com/v2/email/outbound-emails`;

  const body: Record<string, unknown> = {
    FromEmailAddress: from,
    Destination: { ToAddresses: [to] },
    Content: {
      Simple: {
        Subject: { Data: subject },
        Body: {},
      },
    },
  };

  const simpleBody = (body.Content as Record<string, Record<string, Record<string, unknown>>>).Simple!.Body;
  if (bodyText) simpleBody.Text = { Data: bodyText };
  if (bodyHtml) simpleBody.Html = { Data: bodyHtml };

  const signed = signRequest({
    method: "POST",
    url,
    body: JSON.stringify(body),
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
}
