import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { css } from "@flow-css/core/css";
import { desc, eq, or } from "drizzle-orm";
import { emails } from "@nanomail/db";
import { getDb } from "~/db";
import { getSession } from "~/auth";

const fetchInbox = createServerFn({ method: "GET" }).handler(async () => {
  const user = await getSession();
  if (!user) throw redirect({ to: "/login" });
  const db = await getDb();
  // Fetch both inbound (to user) and outbound (from user) so threads show
  // the latest activity regardless of direction.
  return db
    .select()
    .from(emails)
    .where(or(eq(emails.to, user.email), eq(emails.from, user.email)))
    .orderBy(desc(emails.receivedAt))
    .limit(100);
});

export const Route = createFileRoute("/_authed/")({
  loader: async () => {
    const all = await fetchInbox();
    // Group by threadId (fall back to email id for legacy/unthreaded rows).
    const groups = new Map<string, typeof all>();
    for (const email of all) {
      const key = email.threadId ?? email.id;
      const group = groups.get(key);
      if (group) {
        group.push(email);
      } else {
        groups.set(key, [email]);
      }
    }
    // Each thread is represented by its most recent message; sort threads by
    // that latest message's timestamp.
    const threads = Array.from(groups.values()).map((messages) => {
      const sorted = [...messages].sort(
        (a, b) => b.receivedAt.getTime() - a.receivedAt.getTime(),
      );
      return sorted;
    });
    threads.sort(
      (a, b) => b[0].receivedAt.getTime() - a[0].receivedAt.getTime(),
    );
    return { threads };
  },
  component: Inbox,
});

function Inbox() {
  const { threads } = Route.useLoaderData();
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
      {threads.length === 0 ? (
        <p>No emails yet.</p>
      ) : (
        <ul className={css({ listStyle: "none", padding: "0" })}>
          {threads.map((messages) => {
            const latest = messages[0];
            const threadId = latest.threadId ?? latest.id;
            const participant = latest.isInbound ? latest.from : "You";
            return (
              <li
                key={threadId}
                className={css({
                  padding: "0.75rem",
                  borderBottom: "1px solid #eee",
                  "&:hover": { background: "#f9f9f9" },
                })}
              >
                <Link
                  to="/threads/$threadId"
                  params={{ threadId }}
                  className={css({
                    textDecoration: "none",
                    color: "inherit",
                    display: "block",
                  })}
                >
                  <strong>{latest.subject || "(no subject)"}</strong>
                  {messages.length > 1 && (
                    <span
                      className={css({
                        marginLeft: "0.5rem",
                        color: "#999",
                        fontSize: "0.75rem",
                      })}
                    >
                      ({messages.length})
                    </span>
                  )}
                  <br />
                  <span
                    className={css({ color: "#666", fontSize: "0.875rem" })}
                  >
                    {participant} —{" "}
                    {new Date(latest.receivedAt).toLocaleString()}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
