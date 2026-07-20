import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { sql } from "drizzle-orm";
import { css } from "@flow-css/core/css";
import { useState } from "react";
import { getDb } from "~/db";
import { getSession } from "~/auth";

const PAGE_SIZE = 25;

export interface ThreadSummary {
  id: string;
  thread_id: string | null;
  from: string;
  to: string;
  subject: string;
  is_inbound: boolean;
  received_at: string;
  thread_count: number;
}

export interface InboxPage {
  items: ThreadSummary[];
  nextCursor: { receivedAt: string; id: string } | null;
}

const fetchInboxPage = createServerFn({ method: "GET" })
  .validator(
    (data: { cursorReceivedAt?: string; cursorId?: string }) => data,
  )
  .handler(async ({ data }) => {
    const user = await getSession();
    if (!user) throw redirect({ to: "/login" });
    const db = await getDb();

    // Latest message per thread, paginated by (received_at, id) cursor.
    // COALESCE(thread_id, id) treats legacy rows (null thread_id) as their
    // own thread. Window function gives the thread message count for free.
    const cursorClause = data.cursorReceivedAt
      ? sql`(received_at, id) < (${data.cursorReceivedAt}::timestamptz, ${data.cursorId}::uuid)`
      : sql`TRUE`;

    const result = await db.execute(sql`
      SELECT * FROM (
        SELECT DISTINCT ON (COALESCE(thread_id, id)) *,
          COUNT(*) OVER (PARTITION BY COALESCE(thread_id, id)) AS thread_count
        FROM emails
        WHERE "to" = ${user.email} OR "from" = ${user.email}
        ORDER BY COALESCE(thread_id, id), received_at DESC, id DESC
      ) t
      WHERE ${cursorClause}
      ORDER BY received_at DESC, id DESC
      LIMIT ${PAGE_SIZE + 1}
    `);

    const rows = (result.rows ?? []) as unknown as ThreadSummary[];
    const hasMore = rows.length > PAGE_SIZE;
    const items = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
    const last = items[items.length - 1];
    const nextCursor = hasMore && last
      ? { receivedAt: last.received_at, id: last.id }
      : null;

    return { items, nextCursor };
  });

export const Route = createFileRoute("/_authed/")({
  loader: async () => fetchInboxPage({ data: {} }),
  component: Inbox,
});

function Inbox() {
  const initialPage = Route.useLoaderData();
  const { user } = Route.useRouteContext();
  const [pages, setPages] = useState<InboxPage[]>([initialPage]);
  const [loadingMore, setLoadingMore] = useState(false);

  const allItems = pages.flatMap((p) => p.items);
  const lastPage = pages[pages.length - 1];
  const hasMore = !!lastPage?.nextCursor;

  async function loadMore() {
    if (!lastPage?.nextCursor || loadingMore) return;
    setLoadingMore(true);
    const next = await fetchInboxPage({
      data: {
        cursorReceivedAt: lastPage.nextCursor.receivedAt,
        cursorId: lastPage.nextCursor.id,
      },
    });
    setPages((prev) => [...prev, next]);
    setLoadingMore(false);
  }

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
      {allItems.length === 0 ? (
        <p>No emails yet.</p>
      ) : (
        <>
          <ul className={css({ listStyle: "none", padding: "0" })}>
            {allItems.map((item) => {
              const threadId = item.thread_id ?? item.id;
              const participant = item.is_inbound ? item.from : "You";
              return (
                <li
                  key={item.id}
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
                    <strong>{item.subject || "(no subject)"}</strong>
                    {item.thread_count > 1 && (
                      <span
                        className={css({
                          marginLeft: "0.5rem",
                          color: "#999",
                          fontSize: "0.75rem",
                        })}
                      >
                        ({item.thread_count})
                      </span>
                    )}
                    <br />
                    <span
                      className={css({ color: "#666", fontSize: "0.875rem" })}
                    >
                      {participant} —{" "}
                      {new Date(item.received_at).toLocaleString()}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          {hasMore && (
            <button
              type="button"
              onClick={loadMore}
              disabled={loadingMore}
              className={css({
                display: "block",
                margin: "1.5rem auto 0",
                padding: "0.5rem 1.5rem",
                cursor: "pointer",
                border: "1px solid #ccc",
                background: "#fff",
                color: "#333",
                borderRadius: "4px",
                fontSize: "0.875rem",
              })}
              style={
                loadingMore ? { opacity: 0.6, cursor: "not-allowed" } : undefined
              }
            >
              {loadingMore ? "Loading…" : "Load more"}
            </button>
          )}
        </>
      )}
    </div>
  );
}
