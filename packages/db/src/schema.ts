import { cockroachTable, uuid, text, timestamp, bool, index } from "drizzle-orm/cockroach-core";

export const emails = cockroachTable(
  "emails",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    from: text("from").notNull(),
    to: text("to").notNull(),
    subject: text("subject").notNull().default(""),
    bodyText: text("body_text"),
    bodyHtml: text("body_html"),
    isInbound: bool("is_inbound").notNull().default(true),
    isRead: bool("is_read").notNull().default(false),
    replyToEmailId: uuid("reply_to_email_id"),
    // RFC 5322 Message-ID header value (without angle brackets). Set for both
    // inbound (parsed from raw) and outbound (generated locally) messages so
    // future replies can be threaded via In-Reply-To.
    messageId: text("message_id"),
    // Conversation grouping key. Inbound messages without an In-Reply-To match
    // start a new thread; replies inherit the original's threadId.
    threadId: uuid("thread_id").notNull().defaultRandom(),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Inbox query: WHERE to = $1 OR from = $1 ORDER BY received_at DESC, id DESC
    // Composite index covers the filter + sort for a cursor-paginated scan.
    index("emails_participant_received_idx").on(
      table.to,
      table.from,
      table.receivedAt,
      table.id,
    ),
    // Thread view: WHERE thread_id = $1 ORDER BY received_at ASC
    index("emails_thread_received_idx").on(
      table.threadId,
      table.receivedAt,
      table.id,
    ),
    // In-Reply-To lookup during ingest: WHERE message_id = $1
    index("emails_message_id_idx").on(table.messageId),
  ],
);

export const users = cockroachTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  isAdmin: bool("is_admin").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const sessions = cockroachTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Email = typeof emails.$inferSelect;
export type NewEmail = typeof emails.$inferInsert;
export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
