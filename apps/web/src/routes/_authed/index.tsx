import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { css } from "@flow-css/core/css";
import { desc, eq } from "drizzle-orm";
import { emails } from "@nanomail/db";
import { getDb } from "~/db";
import { getSession } from "~/auth";

const fetchInbox = createServerFn({ method: "GET" }).handler(async () => {
  const user = await getSession();
  if (!user) throw redirect({ to: "/login" });
  const db = await getDb();
  return db
    .select()
    .from(emails)
    .where(eq(emails.to, user.email))
    .orderBy(desc(emails.receivedAt))
    .limit(50);
});

export const Route = createFileRoute("/_authed/")({
  loader: async () => {
    const inbox = await fetchInbox();
    return { emails: inbox };
  },
  component: Inbox,
});

function Inbox() {
  const { emails } = Route.useLoaderData();
  const { user } = Route.useRouteContext();

  return (
    <div
      className={css({
        padding: "2rem",
        maxWidth: "800px",
        margin: "0 auto",
      })}
    >
      <h1 className={css({ fontSize: "1.5rem", marginBottom: "1rem" })}>
        Inbox — {user.email}
      </h1>
      <Link
        to="/compose"
        className={css({
          display: "inline-block",
          marginBottom: "1rem",
          padding: "0.5rem 1rem",
          background: "#0066cc",
          color: "#fff",
          textDecoration: "none",
          borderRadius: "4px",
          fontSize: "0.875rem",
        })}
      >
        Compose
      </Link>
      {emails.length === 0 ? (
        <p>No emails yet.</p>
      ) : (
        <ul className={css({ listStyle: "none", padding: "0" })}>
          {emails.map((email) => (
            <li
              key={email.id}
              className={css({
                padding: "0.75rem",
                borderBottom: "1px solid #eee",
                "&:hover": { background: "#f9f9f9" },
              })}
            >
              <Link
                to="/emails/$id"
                params={{ id: email.id }}
                className={css({
                  textDecoration: "none",
                  color: "inherit",
                  display: "block",
                })}
              >
                <strong>{email.subject || "(no subject)"}</strong>
                <br />
                <span className={css({ color: "#666", fontSize: "0.875rem" })}>
                  From: {email.from} —{" "}
                  {new Date(email.receivedAt).toLocaleString()}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
