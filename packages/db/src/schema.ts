import { cockroachTable, uuid, text, timestamp, bool } from "drizzle-orm/cockroach-core";

export const emails = cockroachTable("emails", {
  id: uuid("id").primaryKey().defaultRandom(),
  from: text("from").notNull(),
  to: text("to").notNull(),
  subject: text("subject").notNull().default(""),
  bodyText: text("body_text"),
  bodyHtml: text("body_html"),
  isInbound: bool("is_inbound").notNull().default(true),
  isRead: bool("is_read").notNull().default(false),
  receivedAt: timestamp("received_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

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
