import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { and, or, eq, asc } from "drizzle-orm";
import { emails } from "@nanomail/db";
import { css } from "@flow-css/core/css";
import { useEffect, useMemo, useRef, useState } from "react";
import { getDb } from "~/db";
import { getSession } from "~/auth";
import { sendEmailFn } from "~/server/api/send";

const fetchThread = createServerFn({ method: "GET" })
  .validator((data: { threadId: string }) => data)
  .handler(async ({ data }) => {
    const user = await getSession();
    if (!user) throw redirect({ to: "/login" });
    const db = await getDb();
    // All emails in this thread that involve the user (as sender or recipient).
    const rows = await db
      .select()
      .from(emails)
      .where(
        and(
          eq(emails.threadId, data.threadId),
          or(eq(emails.to, user.email), eq(emails.from, user.email)),
        ),
      )
      .orderBy(asc(emails.receivedAt));
    if (rows.length === 0) throw redirect({ to: "/" });
    return rows;
  });



export const Route = createFileRoute("/_authed/threads/$threadId")({
  loader: async ({ params }) =>
    fetchThread({ data: { threadId: params.threadId } }),
  component: ThreadView,
});

function splitQuoted(body: string): { visible: string; quoted: string } {
  const match = body.match(/\n\n(On .+ wrote:\n[\s\S]*)$/);
  if (match) {
    return {
      visible: body.slice(0, match.index).trimEnd(),
      quoted: match[1],
    };
  }
  return { visible: body, quoted: "" };
}

function ThreadMessage({ email }: { email: typeof emails.$inferSelect }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [showQuoted, setShowQuoted] = useState(false);
  const [replying, setReplying] = useState(false);
  const [error, setError] = useState<string>();
  const [sending, setSending] = useState(false);
  const navigate = useNavigate();

  const { visible, quoted } = useMemo(
    () => splitQuoted(email.bodyText || ""),
    [email.bodyText],
  );

  useEffect(() => {
    if (iframeRef.current && email.bodyHtml) {
      iframeRef.current.srcdoc = email.bodyHtml;
    }
  }, [email.bodyHtml]);

  const isInbound = email.isInbound;

  return (
    <div
      className={css({
        marginBottom: "1.5rem",
        padding: "1rem",
        borderRadius: "4px",
        border: "1px solid #eee",
      })}
      style={{ background: isInbound ? "#f8f9fa" : "#eef6ff" }}
    >
      <div className={css({ marginBottom: "0.5rem", fontSize: "0.875rem" })}>
        <strong>{email.from}</strong>
        <span className={css({ color: "#666" })}>
          {" → "}
          {email.to}
        </span>
        <span className={css({ color: "#999", marginLeft: "0.5rem" })}>
          {new Date(email.receivedAt).toLocaleString()}
        </span>
      </div>

      {email.bodyHtml ? (
        <iframe
          ref={iframeRef}
          title={`email-${email.id}`}
          sandbox="allow-same-origin"
          className={css({
            width: "100%",
            minHeight: "30vh",
            border: "none",
          })}
        />
      ) : (
        <div>
          <pre
            className={css({
              whiteSpace: "pre-wrap",
              fontFamily: "inherit",
              margin: "0",
            })}
          >
            {visible}
          </pre>
          {quoted && (
            <div className={css({ marginTop: "0.5rem" })}>
              <button
                type="button"
                onClick={() => setShowQuoted((s) => !s)}
                className={css({
                  background: "none",
                  border: "none",
                  color: "#0066cc",
                  cursor: "pointer",
                  padding: "0.25rem 0",
                  fontSize: "0.875rem",
                })}
              >
                {showQuoted ? "Hide quoted text" : "Show quoted text"}
              </button>
              {showQuoted && (
                <pre
                  className={css({
                    whiteSpace: "pre-wrap",
                    fontFamily: "inherit",
                    margin: "0.5rem 0 0",
                    color: "#666",
                    borderLeft: "2px solid #eee",
                    paddingLeft: "0.75rem",
                  })}
                >
                  {quoted}
                </pre>
              )}
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => setReplying((r) => !r)}
        className={css({
          marginTop: "0.75rem",
          padding: "0.4rem 0.8rem",
          cursor: "pointer",
          border: "1px solid #0066cc",
          background: "#fff",
          color: "#0066cc",
          borderRadius: "4px",
          fontSize: "0.8125rem",
        })}
      >
        {replying ? "Cancel" : "Reply"}
      </button>

      {replying && (
        <form
          className={css({ marginTop: "0.75rem" })}
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
          <label className={css({ display: "block", marginBottom: "0.4rem" })}>
            To
            <input
              name="to"
              type="email"
              defaultValue={email.from}
              required
              className={css({
                display: "block",
                width: "100%",
                padding: "0.4rem",
                marginTop: "0.2rem",
                border: "1px solid #ccc",
                borderRadius: "4px",
              })}
            />
          </label>
          <label className={css({ display: "block", marginBottom: "0.4rem" })}>
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
                padding: "0.4rem",
                marginTop: "0.2rem",
                border: "1px solid #ccc",
                borderRadius: "4px",
              })}
            />
          </label>
          <label className={css({ display: "block", marginBottom: "0.4rem" })}>
            Body
            <textarea
              name="body"
              required
              rows={6}
              className={css({
                display: "block",
                width: "100%",
                padding: "0.4rem",
                marginTop: "0.2rem",
                border: "1px solid #ccc",
                borderRadius: "4px",
                fontFamily: "inherit",
              })}
            />
          </label>
          {error && (
            <p className={css({ color: "red", marginBottom: "0.4rem" })}>
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={sending}
            className={css({
              padding: "0.4rem 0.8rem",
              cursor: "pointer",
              background: "#0066cc",
              color: "#fff",
              border: "none",
              borderRadius: "4px",
            })}
            style={sending ? { opacity: 0.6, cursor: "not-allowed" } : undefined}
          >
            {sending ? "Sending…" : "Send Reply"}
          </button>
        </form>
      )}
    </div>
  );
}

function ThreadView() {
  const messages = Route.useLoaderData();
  const subject = messages[0]?.subject || "(no subject)";

  return (
    <div
      className={css({
        padding: "2rem",
        maxWidth: "800px",
        margin: "0 auto",
      })}
    >
      <Link
        to="/"
        className={css({
          display: "inline-block",
          marginBottom: "1rem",
          color: "#0066cc",
          textDecoration: "none",
        })}
      >
        &larr; Back to inbox
      </Link>
      <h1 className={css({ fontSize: "1.5rem", marginBottom: "1rem" })}>
        {subject}{" "}
        <span className={css({ color: "#999", fontSize: "0.875rem" })}>
          ({messages.length})
        </span>
      </h1>
      {messages.map((email) => (
        <ThreadMessage key={email.id} email={email} />
      ))}
    </div>
  );
}
