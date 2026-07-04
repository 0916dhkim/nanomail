import { scrypt, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { redirect } from "@tanstack/react-router";
import { eq, and, gt, count } from "drizzle-orm";
import { users, sessions } from "@nanomail/db";
import { getDb } from "./db";

const scryptAsync = promisify(scrypt);

const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30 days in seconds
const MIN_PASSWORD_LENGTH = 8;

// --- Password Policy (shared by setup, login, and admin account creation) ---

/**
 * Returns an error message if the password fails the policy, or null if ok.
 * Applied server-side in {@link setupAdminFn} and {@link createUserFn}; the
 * setup and admin forms mirror this client-side with `minLength={8}`.
 */
export function validatePassword(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  return null;
}

// --- Password Hashing (scrypt, zero dependencies) ---

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const hash = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${hash.toString("hex")}`;
}

async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const hashBuffer = Buffer.from(hash, "hex");
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  return timingSafeEqual(hashBuffer, derived);
}

// --- Cookie Helpers ---

function parseCookies(header: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key) cookies[key] = rest.join("=");
  }
  return cookies;
}

function serializeSessionCookie(sessionId: string): string {
  return `session=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}`;
}

function serializeExpiredSessionCookie(): string {
  return "session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0";
}

// --- Server Functions ---

export async function getSessionFromRequest() {
  const request = getRequest();
  const cookieHeader = request.headers.get("cookie") ?? "";
  const sessionId = parseCookies(cookieHeader).session;
  if (!sessionId) return null;

  const db = await getDb();
  const result = await db
    .select({ id: users.id, email: users.email, isAdmin: users.isAdmin })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(
      and(eq(sessions.id, sessionId), gt(sessions.expiresAt, new Date())),
    )
    .limit(1);

  return result[0] ?? null;
}

export const getSession = createServerFn({ method: "GET" }).handler(
  async () => {
    return getSessionFromRequest();
  },
);

export const loginFn = createServerFn({ method: "POST" })
  .validator((data: { email: string; password: string }) => data)
  .handler(async ({ data }) => {
    const db = await getDb();
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, data.email))
      .limit(1);

    if (!user || !(await verifyPassword(data.password, user.passwordHash))) {
      return { error: "Invalid email or password" };
    }

    const expiresAt = new Date(Date.now() + SESSION_MAX_AGE * 1000);
    const [session] = await db
      .insert(sessions)
      .values({ userId: user.id, expiresAt })
      .returning();

    throw redirect({
      to: "/",
      headers: { "Set-Cookie": serializeSessionCookie(session!.id) },
    });
  });

export const createUserFn = createServerFn({ method: "POST" })
  .validator((data: { email: string; password: string }) => data)
  .handler(async ({ data }) => {
    const caller = await getSessionFromRequest();
    if (!caller?.isAdmin) {
      return { error: "Only admins can create accounts" };
    }

    const db = await getDb();
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, data.email))
      .limit(1);

    if (existing.length > 0) {
      return { error: "An account with this email already exists" };
    }

    const passwordError = validatePassword(data.password);
    if (passwordError) {
      return { error: passwordError };
    }

    const passwordHash = await hashPassword(data.password);
    await db.insert(users).values({ email: data.email, passwordHash });

    return { success: true as const };
  });

// --- First-run Setup ---

/**
 * Whether the app has any users at all. When false, the root route redirects
 * unauthenticated visitors to `/setup` so the first admin account can be
 * created. Not cached: a `COUNT(*)` on the users PK index is sub-millisecond,
 * and skipping the cache keeps setup state always-correct (e.g. if an operator
 * truncates the table while the server is running).
 */
export async function isSetupRequired(): Promise<boolean> {
  const db = await getDb();
  const [row] = await db.select({ n: count() }).from(users);
  return (row?.n ?? 0) === 0;
}

export const setupAdminFn = createServerFn({ method: "POST" })
  .validator((data: { email: string; password: string }) => data)
  .handler(async ({ data }) => {
    if (!(await isSetupRequired())) {
      return { error: "Setup is already complete" };
    }

    const db = await getDb();
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, data.email))
      .limit(1);
    if (existing.length > 0) {
      return { error: "An account with this email already exists" };
    }

    const passwordError = validatePassword(data.password);
    if (passwordError) {
      return { error: passwordError };
    }

    const passwordHash = await hashPassword(data.password);
    await db.insert(users).values({
      email: data.email,
      passwordHash,
      isAdmin: true,
    });

    throw redirect({ to: "/login" });
  });

export const logoutFn = createServerFn({ method: "POST" }).handler(
  async () => {
    const request = getRequest();
    const cookieHeader = request.headers.get("cookie") ?? "";
    const sessionId = parseCookies(cookieHeader).session;

    if (sessionId) {
      const db = await getDb();
      await db.delete(sessions).where(eq(sessions.id, sessionId));
    }

    throw redirect({
      to: "/login",
      headers: { "Set-Cookie": serializeExpiredSessionCookie() },
    });
  },
);
