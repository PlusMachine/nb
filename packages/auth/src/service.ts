import { accounts, authRateLimits, db, sessions, users, verifications } from "@nb/db";
import { and, eq, gt, sql } from "@nb/db";

import { createOtpCode, createRandomToken, hashPassword, hashToken, verifyPassword } from "./crypto";
import type { AuthUser, UserRole } from "./types";

type VerificationType = "otp" | "magic_link" | "password_reset";

const SESSION_TTL_DAYS = 30;
const OTP_TTL_MINUTES = 10;
const MAGIC_TTL_MINUTES = 20;
const RESET_TTL_MINUTES = 20;

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

const defaultDisplayName = (email: string): string => email.split("@")[0] ?? "Brewer";

const mapUser = (user: typeof users.$inferSelect): AuthUser => ({
  id: user.id,
  email: user.email,
  emailVerified: user.emailVerified,
  displayName: user.displayName,
  image: user.image,
  role: user.role,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt
});

export const assertRateLimit = async (key: string, action: string, limit: number, windowSeconds: number): Promise<void> => {
  const now = new Date();
  const [row] = await db.select().from(authRateLimits).where(and(eq(authRateLimits.key, key), eq(authRateLimits.action, action)));

  if (!row || row.resetAt <= now) {
    await db.insert(authRateLimits).values({ key, action, count: 1, resetAt: new Date(now.getTime() + windowSeconds * 1000) }).onConflictDoUpdate({
      target: [authRateLimits.key, authRateLimits.action],
      set: { count: 1, resetAt: new Date(now.getTime() + windowSeconds * 1000), updatedAt: now }
    });
    return;
  }

  if (row.count >= limit) {
    throw new Error("RATE_LIMITED");
  }

  await db.update(authRateLimits).set({ count: row.count + 1, updatedAt: now }).where(eq(authRateLimits.id, row.id));
};

export const getOrCreateUserByEmail = async (email: string): Promise<typeof users.$inferSelect> => {
  const normalized = normalizeEmail(email);
  const [found] = await db.select().from(users).where(eq(users.email, normalized));
  if (found) {
    return found;
  }

  const [created] = await db.insert(users).values({
    email: normalized,
    displayName: defaultDisplayName(normalized),
    emailVerified: false,
    role: "user"
  }).returning();

  return created;
};

export const issueVerification = async ({ email, type }: { email: string; type: VerificationType }) => {
  const normalized = normalizeEmail(email);
  const raw = type === "otp" ? createOtpCode() : createRandomToken(24);
  const ttlMinutes = type === "otp" ? OTP_TTL_MINUTES : type === "magic_link" ? MAGIC_TTL_MINUTES : RESET_TTL_MINUTES;
  const tokenHash = hashToken(raw);

  await db.insert(verifications).values({
    email: normalized,
    type,
    codeHash: tokenHash,
    expiresAt: new Date(Date.now() + ttlMinutes * 60 * 1000)
  });

  return { rawToken: raw, email: normalized, expiresInMinutes: ttlMinutes };
};

export const consumeVerification = async ({ email, token, type }: { email: string; token: string; type: VerificationType }) => {
  const normalized = normalizeEmail(email);
  const tokenHash = hashToken(token);

  const [found] = await db.select().from(verifications).where(and(
    eq(verifications.email, normalized),
    eq(verifications.type, type),
    eq(verifications.codeHash, tokenHash)
  ));

  if (!found) {
    throw new Error("INVALID_TOKEN");
  }

  if (found.usedAt) {
    throw new Error("TOKEN_USED");
  }

  if (found.expiresAt <= new Date()) {
    throw new Error("TOKEN_EXPIRED");
  }

  await db.update(verifications).set({ usedAt: new Date(), attempts: found.attempts + 1 }).where(eq(verifications.id, found.id));
};

export const createSession = async ({ userId, userAgent, ipAddress }: { userId: string; userAgent?: string | null; ipAddress?: string | null }) => {
  const rawToken = createRandomToken(32);
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

  await db.insert(sessions).values({ userId, tokenHash, expiresAt, userAgent: userAgent ?? null, ipAddress: ipAddress ?? null });

  return { rawToken, expiresAt };
};

export const getUserBySessionToken = async (rawToken: string): Promise<AuthUser | null> => {
  const tokenHash = hashToken(rawToken);
  const [row] = await db.select({ user: users, sessionId: sessions.id }).from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, new Date())));

  if (!row) {
    return null;
  }

  return mapUser(row.user);
};

export const revokeSession = async (rawToken: string): Promise<void> => {
  await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(rawToken)));
};

export const setPassword = async ({ email, password }: { email: string; password: string }) => {
  const user = await getOrCreateUserByEmail(email);
  await db.update(users).set({ passwordHash: await hashPassword(password), updatedAt: new Date() }).where(eq(users.id, user.id));
  return mapUser(user);
};

export const signInWithPassword = async ({ email, password }: { email: string; password: string }): Promise<AuthUser> => {
  const normalized = normalizeEmail(email);
  const [user] = await db.select().from(users).where(eq(users.email, normalized));
  if (!user?.passwordHash) {
    throw new Error("INVALID_CREDENTIALS");
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    throw new Error("INVALID_CREDENTIALS");
  }

  return mapUser(user);
};

export const completeEmailSignIn = async ({ email }: { email: string }): Promise<AuthUser> => {
  const user = await getOrCreateUserByEmail(email);
  const [updated] = await db.update(users).set({ emailVerified: true, updatedAt: new Date() }).where(eq(users.id, user.id)).returning();
  return mapUser(updated ?? user);
};

export const updateProfile = async ({ userId, displayName }: { userId: string; displayName: string }): Promise<AuthUser> => {
  const [updated] = await db.update(users).set({ displayName, updatedAt: new Date() }).where(eq(users.id, userId)).returning();
  if (!updated) {
    throw new Error("USER_NOT_FOUND");
  }
  return mapUser(updated);
};

export const setRole = async ({ userId, role }: { userId: string; role: UserRole }) => {
  await db.update(users).set({ role, updatedAt: new Date() }).where(eq(users.id, userId));
};

export const linkOAuthAccount = async ({ provider, providerAccountId, email, displayName, image, accessToken, refreshToken }: {
  provider: "google" | "vk" | "yandex";
  providerAccountId: string;
  email: string;
  displayName?: string;
  image?: string;
  accessToken?: string;
  refreshToken?: string;
}) => {
  const normalized = normalizeEmail(email);

  const [existingAccount] = await db.select().from(accounts).where(and(eq(accounts.provider, provider), eq(accounts.providerAccountId, providerAccountId)));

  if (existingAccount) {
    const [existingUser] = await db.select().from(users).where(eq(users.id, existingAccount.userId));
    if (!existingUser) {
      throw new Error("USER_NOT_FOUND");
    }
    return mapUser(existingUser);
  }

  let [user] = await db.select().from(users).where(eq(users.email, normalized));
  if (!user) {
    [user] = await db.insert(users).values({
      email: normalized,
      emailVerified: true,
      displayName: displayName?.trim() || defaultDisplayName(normalized),
      image: image ?? null,
      role: "user"
    }).returning();
  }

  await db.insert(accounts).values({
    userId: user.id,
    provider,
    providerAccountId,
    accessToken,
    refreshToken
  }).onConflictDoUpdate({
    target: [accounts.provider, accounts.providerAccountId],
    set: { accessToken, refreshToken, updatedAt: new Date() }
  });

  return mapUser(user);
};

export const cleanupExpiredVerifications = async (): Promise<void> => {
  await db.delete(verifications).where(and(sql`${verifications.expiresAt} <= now()`, sql`${verifications.usedAt} is not null`));
};
