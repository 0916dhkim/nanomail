import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { and, eq } from "drizzle-orm";
import { emails } from "@nanomail/db";
import { css } from "@flow-css/core/css";
import { useEffect, useRef, useState } from "react";
import { getDb } from "~/db";
import { getSession } from "~/auth";
import { sendEmailFn } from "~/server/api/send";

const fetchEmail = createServerFn({ method: "GET" })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const user = await getSession();
    if (!user) throw redirect({ to: "/login" });
    const db = await getDb();
    const [email] = await db
      .select()
      .from(emails)
      .where(and(eq(emails.id, data.id), eq(emails.to, user.email)))
      .limit(1);
    if (!email) throw redirect({ to: "/" });
    return email;
  });

export const Route = createFileRoute("/_authed/emails/$id")({
  loader: async ({ params }) => fetchEmail({ data: { id: params.id } }),
  component: EmailDetail,
});

function EmailDetail() {
  const email = Route.useLoaderData();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [replying, setReplying] = useState(false);
  const [error, setError] = useState<string>();
  const [sending, setSending] = useState(false);
  const navigate = useNavigate();

  // Write HTML body into the iframe via srcdoc so it stays sandboxed.
  // Sandbox allows same-origin for styling but blocks scripts/top-nav.
  useEffect(() => {
    if (iframeRef.current && email.bodyHtml) {
      iframeRef.current.srcdoc = email.bodyHtml;
    }
  }, [email.bodyHtml]);

  return (
    <div
      className={css({
        padding: "2rem",
        maxWidth: "800px",
        margin: "0 auto",
      })}
    >
      <a
        href="/"
        className={css({
          display: "inline-block",
          marginBottom: "1rem",
          color: "#0066cc",
          textDecoration: "none",
        })}
      >
        &larr; Back to inbox
      </a>
      <h1 className={css({ fontSize: "1.5rem", marginBottom: "0.5rem" })}>
        {email.subject || "(no subject)"}
      </h1>
      <div
        className={css({
          color: "#666",
          fontSize: "0.875rem",
          marginBottom: "1.5rem",
          borderBottom: "1px solid #eee",
          paddingBottom: "1rem",
        })}
      >
        <div>
          <strong>From:</strong> {email.from}
        </div>
        <div>
          <strong>To:</strong> {email.to}
        </div>
        <div>
          <strong>Date:</strong> {new Date(email.receivedAt).toLocaleString()}
        </div>
      </div>

      {email.bodyHtml ? (
        <iframe
          ref={iframeRef}
          title="email-body"
          sandbox="allow-same-origin"
          className={css({
            width: "100%",
            minHeight: "60vh",
            border: "1px solid #eee",
            borderRadius: "4px",
          })}
        />
      ) : email.bodyText ? (
        <pre
          className={css({
            whiteSpace: "pre-wrap",
            fontFamily: "inherit",
            margin: "0",
          })}
        >
          {email.bodyText}
        </pre>
      ) : (
        <p className={css({ color: "#999" })}>(empty body)</p>
      )}

      <button
        type="button"
        onClick={() => setReplying((r) => !r)}
        className={css({
          marginTop: "1.5rem",
          padding: "0.5rem 1rem",
          cursor: "pointer",
          border: "1px solid #0066cc",
          background: "#fff",
          color: "#0066cc",
          borderRadius: "4px",
          fontSize: "0.875rem",
        })}
      >
        {replying ? "Cancel" : "Reply"}
      </button>

      {replying && (
        <form
          className={css({
            marginTop: "1rem",
            padding: "1rem",
            border: "1px solid #eee",
            borderRadius: "4px",
          })}
          onSubmit={async (e) => {
            e.preventDefault();
            setError(undefined);
            setSending(true);
            const form = new FormData(e.currentTarget);
            const result = await sendEmailFn({
              data: {
                to: form.get("to") as string,
                subject: form.get("subject") as string,
                bodyText: form.get("body") as string,
                replyToEmailId: email.id,
              },
            });
            setSending(false);
            if ("error" in result) {
              setError(result.error);
            } else {
              navigate({ to: "/" });
            }
          }}
        >
          <label className={css({ display: "block", marginBottom: "0.5rem" })}>
            To
            <input
              name="to"
              type="email"
              defaultValue={email.from}
              required
              className={css({
                display: "block",
                width: "100%",
                padding: "0.5rem",
                marginTop: "0.25rem",
                border: "1px solid #ccc",
                borderRadius: "4px",
              })}
            />
          </label>
          <label className={css({ display: "block", marginBottom: "0.5rem" })}>
            Subject
            <input
              name="subject"
              type="text"
              defaultValue={
                email.subject.startsWith("Re:")
                  ? email.subject
                  : `Re: ${email.subject}`
              }
              required
              className={css({
                display: "block",
                width: "100%",
                padding: "0.5rem",
                marginTop: "0.25rem",
                border: "1px solid #ccc",
                borderRadius: "4px",
              })}
            />
          </label>
          <label className={css({ display: "block", marginBottom: "0.5rem" })}>
            Body
            <textarea
              name="body"
              required
              rows={10}
              className={css({
                display: "block",
                width: "100%",
                padding: "0.5rem",
                marginTop: "0.25rem",
                border: "1px solid #ccc",
                borderRadius: "4px",
                fontFamily: "inherit",
              })}
            />
          </label>
          {error && (
            <p className={css({ color: "red", marginBottom: "0.5rem" })}>
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={sending}
            className={css({
              padding: "0.5rem 1rem",
              cursor: sending ? "not-allowed" : "pointer",
              background: "#0066cc",
              color: "#fff",
              border: "none",
              borderRadius: "4px",
              opacity: sending ? 0.6 : 1,
            })}
          >
            {sending ? "Sending…" : "Send Reply"}
          </button>
        </form>
      )}
    </div>
  );
}
