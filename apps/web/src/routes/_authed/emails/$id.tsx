import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { and, eq } from "drizzle-orm";
import { emails } from "@nanomail/db";
import { css } from "@flow-css/core/css";
import { useEffect, useRef } from "react";
import { getDb } from "~/db";
import { getSession } from "~/auth";

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
    </div>
  );
}
